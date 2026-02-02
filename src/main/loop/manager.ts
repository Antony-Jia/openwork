import { BrowserWindow } from "electron"
import * as fs from "node:fs"
import * as fsp from "node:fs/promises"
import * as path from "node:path"
import { parseExpression } from "cron-parser"
import { runAgentStream } from "../agent/run"
import { getAllThreads, getThread, updateThread as dbUpdateThread } from "../db"
import { broadcastThreadsChanged, broadcastToast } from "../ipc/events"
import { ensureDockerRunning, getDockerRuntimeConfig } from "../docker/session"
import type {
  LoopConfig,
  LoopConditionOp,
  LoopFileTrigger,
  LoopApiTrigger,
  LoopScheduleTrigger
} from "../types"

type LoopEvent =
  | { type: "schedule"; ts: number }
  | { type: "api"; ts: number; response: unknown; pathValue: unknown; status: number }
  | { type: "file"; ts: number; filePath: string; preview: string; size: number }

interface LoopRunner {
  threadId: string
  config: LoopConfig
  running: boolean
  queue: LoopEvent[]
  lastEnqueueAt?: number
  scheduleTimer?: NodeJS.Timeout
  fileWatcher?: fs.FSWatcher
  knownFiles?: Set<string>
  abortController?: AbortController
}

const DEFAULT_PREVIEW_LINES = 200
const DEFAULT_PREVIEW_BYTES = 8192

const DEFAULT_QUEUE_MERGE_WINDOW_SEC = 300

function normalizeLoopConfig(input: LoopConfig): LoopConfig {
  const queue = input.queue || { policy: "strict", mergeWindowSec: DEFAULT_QUEUE_MERGE_WINDOW_SEC }
  const trigger = input.trigger
  if (trigger.type === "file") {
    const fileTrigger = trigger as LoopFileTrigger
    return {
      ...input,
      queue: {
        policy: "strict",
        mergeWindowSec: queue.mergeWindowSec || DEFAULT_QUEUE_MERGE_WINDOW_SEC
      },
      trigger: {
        ...fileTrigger,
        previewMaxLines: fileTrigger.previewMaxLines || DEFAULT_PREVIEW_LINES,
        previewMaxBytes: fileTrigger.previewMaxBytes || DEFAULT_PREVIEW_BYTES
      }
    }
  }

  return {
    ...input,
    queue: {
      policy: "strict",
      mergeWindowSec: queue.mergeWindowSec || DEFAULT_QUEUE_MERGE_WINDOW_SEC
    }
  }
}

function getThreadMetadata(threadId: string): Record<string, unknown> {
  const row = getThread(threadId)
  return row?.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {}
}

function saveLoopConfig(threadId: string, config: LoopConfig): void {
  const metadata = getThreadMetadata(threadId)
  const next = { ...metadata, loop: config }
  dbUpdateThread(threadId, { metadata: JSON.stringify(next) })
  broadcastThreadsChanged()
}

function getWorkspacePath(threadId: string): string | null {
  const metadata = getThreadMetadata(threadId)
  return (metadata.workspacePath as string | undefined) || null
}

function getLoopConfig(threadId: string): LoopConfig | null {
  const metadata = getThreadMetadata(threadId)
  const raw = metadata.loop as LoopConfig | undefined
  if (!raw) return null
  return normalizeLoopConfig(raw)
}

function stringifyLimited(value: unknown, maxChars: number): string {
  let text = ""
  try {
    text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  } catch {
    text = String(value)
  }
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n...[truncated]`
}

function buildTemplateVariables(
  config: LoopConfig,
  event: LoopEvent
): Record<string, string> {
  const vars: Record<string, string> = {
    "trigger.type": event.type,
    time: new Date(event.ts).toLocaleString()
  }

  if (event.type === "schedule") {
    const trigger = config.trigger as LoopScheduleTrigger
    vars["schedule.cron"] = trigger.cron
  }

  if (event.type === "api") {
    const trigger = config.trigger as LoopApiTrigger
    vars["api.url"] = trigger.url
    vars["api.status"] = String(event.status)
    vars["api.json"] = stringifyLimited(event.response, 4000)
    vars["api.pathValue"] = stringifyLimited(event.pathValue, 2000)
  }

  if (event.type === "file") {
    vars["file.path"] = event.filePath
    vars["file.preview"] = event.preview
    vars["file.size"] = String(event.size)
  }

  return vars
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/{{\s*([^}]+)\s*}}/g, (_match, key) => vars[key] ?? "")
}

function getJsonPathValue(data: unknown, pathInput: string): unknown {
  if (!pathInput || pathInput === "$") return data
  let pathText = pathInput.trim()
  if (pathText.startsWith("$.")) pathText = pathText.slice(2)
  if (pathText.startsWith("$")) pathText = pathText.slice(1)
  if (!pathText) return data

  const tokens: Array<string | number> = []
  const regex = /[^.[\]]+|\[(\d+)\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(pathText))) {
    if (match[1] !== undefined) tokens.push(Number(match[1]))
    else tokens.push(match[0])
  }

  let current: unknown = data
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined
    if (typeof token === "number") {
      if (Array.isArray(current)) {
        current = current[token]
      } else {
        return undefined
      }
    } else {
      if (typeof current === "object") {
        current = (current as Record<string, unknown>)[token]
      } else {
        return undefined
      }
    }
  }
  return current
}

function checkCondition(op: LoopConditionOp, value: unknown, expected?: string): boolean {
  if (op === "truthy") return Boolean(value)
  const text = value === null || value === undefined ? "" : String(value)
  if (op === "equals") return text === (expected ?? "")
  if (op === "contains") return expected ? text.includes(expected) : false
  return false
}

async function readFilePreview(
  filePath: string,
  maxLines: number,
  maxBytes: number
): Promise<{ preview: string; size: number }> {
  const stat = await fsp.stat(filePath)
  const raw = await fsp.readFile(filePath, "utf-8")
  const sliced = raw.slice(0, maxBytes)
  const lines = sliced.split(/\r?\n/)
  const limitedLines = lines.slice(0, maxLines)
  let preview = limitedLines.join("\n")
  if (lines.length > maxLines || raw.length > maxBytes) {
    preview += "\n...[truncated]"
  }
  return { preview, size: stat.size }
}

async function listFilesRecursive(rootPath: string): Promise<Set<string>> {
  const files = new Set<string>()

  async function walk(current: string): Promise<void> {
    const entries = await fsp.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else {
        files.add(fullPath)
      }
    }
  }

  await walk(rootPath)
  return files
}

function shouldIgnorePath(filePath: string): boolean {
  const parts = filePath.split(/[\\/]/)
  return parts.some((p) => p.startsWith(".") || p === "node_modules")
}

function matchesSuffix(filePath: string, suffixes?: string[]): boolean {
  if (!suffixes || suffixes.length === 0) return true
  const lower = filePath.toLowerCase()
  return suffixes.some((suffix) => lower.endsWith(suffix.toLowerCase()))
}

function getWindowForThread(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows[0] || null
}

export class LoopManager {
  private runners = new Map<string, LoopRunner>()

  getConfig(threadId: string): LoopConfig | null {
    return getLoopConfig(threadId)
  }

  getStatus(threadId: string): { running: boolean; queueLength: number } {
    const runner = this.runners.get(threadId)
    return {
      running: runner?.running || false,
      queueLength: runner?.queue.length || 0
    }
  }

  updateConfig(threadId: string, config: LoopConfig): LoopConfig {
    const normalized = normalizeLoopConfig(config)
    saveLoopConfig(threadId, normalized)
    const runner = this.runners.get(threadId)
    if (runner) {
      runner.config = normalized
      if (normalized.enabled) {
        this.stopRunner(runner)
        this.startRunner(runner)
      } else {
        this.stopRunner(runner)
      }
    }
    return normalized
  }

  start(threadId: string): LoopConfig {
    const config = getLoopConfig(threadId)
    if (!config) {
      throw new Error("Missing loop configuration")
    }
    const normalized = normalizeLoopConfig({ ...config, enabled: true, lastError: null })
    saveLoopConfig(threadId, normalized)

    let runner = this.runners.get(threadId)
    if (!runner) {
      runner = {
        threadId,
        config: normalized,
        running: false,
        queue: []
      }
      this.runners.set(threadId, runner)
    } else {
      runner.config = normalized
    }
    this.startRunner(runner)
    return normalized
  }

  stop(threadId: string): LoopConfig {
    const config = getLoopConfig(threadId)
    if (!config) {
      throw new Error("Missing loop configuration")
    }
    const normalized = normalizeLoopConfig({ ...config, enabled: false, nextRunAt: null })
    saveLoopConfig(threadId, normalized)

    const runner = this.runners.get(threadId)
    if (runner) {
      runner.config = normalized
      this.stopRunner(runner)
    }
    return normalized
  }

  stopAll(): void {
    for (const runner of this.runners.values()) {
      this.stopRunner(runner)
    }
    this.runners.clear()
  }

  cleanupThread(threadId: string): void {
    const runner = this.runners.get(threadId)
    if (runner) {
      this.stopRunner(runner)
      this.runners.delete(threadId)
    }
  }

  resetAllOnStartup(): void {
    // Default to paused on restart: do not auto-start and ensure enabled flag is false.
    const rows = getAllThreads()
    for (const row of rows) {
      const config = getLoopConfig(row.thread_id)
      if (config?.enabled) {
        saveLoopConfig(row.thread_id, { ...config, enabled: false, nextRunAt: null })
      }
    }
  }

  private startRunner(runner: LoopRunner): void {
    this.stopRunner(runner)
    const trigger = runner.config.trigger
    if (trigger.type === "schedule") {
      this.scheduleNext(runner)
    } else if (trigger.type === "api") {
      this.scheduleNext(runner)
    } else if (trigger.type === "file") {
      runner.config.nextRunAt = null
      saveLoopConfig(runner.threadId, runner.config)
      this.startFileWatcher(runner, trigger)
    }
  }

  private stopRunner(runner: LoopRunner): void {
    if (runner.scheduleTimer) {
      clearTimeout(runner.scheduleTimer)
      runner.scheduleTimer = undefined
    }
    if (runner.fileWatcher) {
      runner.fileWatcher.close()
      runner.fileWatcher = undefined
    }
    if (runner.abortController) {
      runner.abortController.abort()
      runner.abortController = undefined
    }
    runner.running = false
    runner.queue = []
  }

  private scheduleNext(runner: LoopRunner): void {
    const trigger = runner.config.trigger as LoopScheduleTrigger | LoopApiTrigger
    let nextDate: Date | null = null
    try {
      const interval = parseExpression(trigger.cron, { currentDate: new Date() })
      nextDate = interval.next().toDate()
    } catch (error) {
      runner.config.nextRunAt = null
      saveLoopConfig(runner.threadId, runner.config)
      this.markError(runner, `Invalid cron expression: ${String(error)}`)
      return
    }

    const delay = Math.max(0, nextDate.getTime() - Date.now())
    runner.config.nextRunAt = nextDate.toISOString()
    saveLoopConfig(runner.threadId, runner.config)

    runner.scheduleTimer = setTimeout(async () => {
      if (!runner.config.enabled) return
      if (trigger.type === "api") {
        await this.handleApiTrigger(runner, trigger)
      } else {
        this.enqueue(runner, { type: "schedule", ts: Date.now() })
      }
      this.scheduleNext(runner)
    }, delay)
  }

  private async handleApiTrigger(runner: LoopRunner, trigger: LoopApiTrigger): Promise<void> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), trigger.timeoutMs ?? 10000)
    try {
      const headers: Record<string, string> = { ...(trigger.headers || {}) }
      if (trigger.bodyJson) {
        const hasContentType = Object.keys(headers).some(
          (key) => key.toLowerCase() === "content-type"
        )
        if (!hasContentType) {
          headers["Content-Type"] = "application/json"
        }
      }

      const response = await fetch(trigger.url, {
        method: trigger.method || "GET",
        headers,
        body: trigger.bodyJson ? JSON.stringify(trigger.bodyJson) : undefined,
        signal: controller.signal
      })
      const status = response.status
      const json = await response.json()
      const pathValue = getJsonPathValue(json, trigger.jsonPath || "$")
      const matched = checkCondition(trigger.op, pathValue, trigger.expected)
      if (matched) {
        this.enqueue(runner, { type: "api", ts: Date.now(), response: json, pathValue, status })
      }
    } catch (error) {
      this.markError(runner, `API trigger failed: ${String(error)}`)
    } finally {
      clearTimeout(timeout)
    }
  }

  private async startFileWatcher(runner: LoopRunner, trigger: LoopFileTrigger): Promise<void> {
    const watchPath = trigger.watchPath
    if (!watchPath) {
      this.markError(runner, "Missing watch path for file trigger.")
      return
    }

    const workspacePath = getWorkspacePath(runner.threadId)
    if (workspacePath) {
      const resolvedWatch = path.resolve(watchPath)
      const resolvedWorkspace = path.resolve(workspacePath)
      if (!resolvedWatch.startsWith(resolvedWorkspace)) {
        this.markError(runner, "Watch path must be within the workspace.")
        return
      }
    }

    try {
      const stat = await fsp.stat(watchPath)
      if (!stat.isDirectory()) {
        this.markError(runner, "Watch path must be a directory.")
        return
      }
      runner.knownFiles = await listFilesRecursive(watchPath)
    } catch (error) {
      this.markError(runner, `Failed to read watch path: ${String(error)}`)
      return
    }

    try {
      runner.fileWatcher = fs.watch(
        watchPath,
        { recursive: true },
        async (_eventType, filename) => {
          if (!filename) return
          if (shouldIgnorePath(filename)) return
          const fullPath = path.join(watchPath, filename)
          if (shouldIgnorePath(fullPath)) return
          if (!matchesSuffix(fullPath, trigger.suffixes)) return

          try {
            const stat = await fsp.stat(fullPath)
            if (!stat.isFile()) return
          } catch {
            return
          }

          if (runner.knownFiles?.has(fullPath)) return
          runner.knownFiles?.add(fullPath)

          setTimeout(async () => {
            try {
              const { preview, size } = await readFilePreview(
                fullPath,
                trigger.previewMaxLines || DEFAULT_PREVIEW_LINES,
                trigger.previewMaxBytes || DEFAULT_PREVIEW_BYTES
              )
              this.enqueue(runner, {
                type: "file",
                ts: Date.now(),
                filePath: fullPath,
                preview,
                size
              })
            } catch (error) {
              this.markError(runner, `Failed to read file: ${String(error)}`)
            }
          }, 200)
        }
      )
    } catch (error) {
      this.markError(runner, `Failed to watch path: ${String(error)}`)
    }
  }

  private enqueue(runner: LoopRunner, event: LoopEvent): void {
    if (!runner.config.enabled) return
    const mergeWindowMs = (runner.config.queue?.mergeWindowSec || DEFAULT_QUEUE_MERGE_WINDOW_SEC) * 1000
    const now = Date.now()
    if (runner.lastEnqueueAt && now - runner.lastEnqueueAt < mergeWindowMs) {
      if (runner.queue.length === 0) {
        runner.queue.push(event)
      } else {
        runner.queue[runner.queue.length - 1] = event
      }
    } else {
      runner.queue.push(event)
    }
    runner.lastEnqueueAt = now
    void this.runNext(runner)
  }

  private async runNext(runner: LoopRunner): Promise<void> {
    if (runner.running) return
    const event = runner.queue.shift()
    if (!event) return
    runner.running = true
    runner.abortController = new AbortController()

    const loopConfig = runner.config
    const marker = `[Loop Trigger @${new Date(event.ts).toLocaleString()}]`
    const vars = buildTemplateVariables(loopConfig, event)
    const rendered = applyTemplate(loopConfig.contentTemplate || "", vars)
    const finalMessage = rendered ? `${marker}\n${rendered}` : marker

    try {
      const workspacePath = getWorkspacePath(runner.threadId)
      if (!workspacePath) {
        throw new Error("Workspace path is required to run loop tasks.")
      }
      await ensureDockerRunning()
      const dockerRuntime = getDockerRuntimeConfig()
      const dockerConfig = dockerRuntime.config ?? undefined
      const dockerContainerId = dockerRuntime.containerId ?? undefined
      const window = getWindowForThread()
      if (!window) {
        throw new Error("No active window to stream loop output.")
      }

      const metadata = getThreadMetadata(runner.threadId)
      const modelId = metadata.model as string | undefined

      await runAgentStream({
        threadId: runner.threadId,
        workspacePath,
        modelId,
        dockerConfig,
        dockerContainerId,
        disableApprovals: true,
        message: finalMessage,
        window,
        channel: `agent:stream:${runner.threadId}`,
        abortController: runner.abortController
      })

      runner.config.lastRunAt = new Date().toISOString()
      runner.config.lastError = null
      saveLoopConfig(runner.threadId, runner.config)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.markError(runner, message)
      broadcastToast("error", `[Loop] ${message}`)
    } finally {
      runner.running = false
      runner.abortController = undefined
      if (runner.queue.length > 0) {
        void this.runNext(runner)
      }
    }
  }

  private markError(runner: LoopRunner, message: string): void {
    runner.config.lastError = message
    saveLoopConfig(runner.threadId, runner.config)
  }
}

export const loopManager = new LoopManager()

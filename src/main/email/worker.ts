import { v4 as uuid } from "uuid"
import { HumanMessage } from "@langchain/core/messages"
import { createAgentRuntime } from "../agent/runtime"
import { getThread, createThread as dbCreateThread, updateThread as dbUpdateThread } from "../db"
import { getSettings } from "../settings"
import { ensureDockerRunning, getDockerRuntimeConfig } from "../docker/session"
import { extractAssistantChunkText, extractContent } from "../agent/stream-utils"
import { broadcastThreadHistoryUpdated, broadcastThreadsChanged } from "../ipc/events"
import {
  buildEmailSubject,
  fetchUnreadEmailTasks,
  isStartWorkSubject,
  markEmailTaskRead,
  sendEmail,
  stripEmailSubjectPrefix
} from "./service"
import { buildEmailModePrompt } from "./prompt"
import type { EmailTask } from "./service"

let pollInterval: NodeJS.Timeout | null = null
let polling = false
const processingTaskIds = new Set<string>()
let currentIntervalMs: number | null = null

function buildTaskPrompt(task: EmailTask): string {
  const body = task.text?.trim() ?? ""
  if (body) return body
  return stripEmailSubjectPrefix(task.subject) || task.subject || ""
}

function buildErrorEmailBody(title: string, details: string): string {
  return ["Openwork email task failed.", "", title, "", details, ""].join("\n")
}

async function runAgentToSummary({
  threadId,
  workspacePath,
  message
}: {
  threadId: string
  workspacePath: string
  message: string
}): Promise<string> {
  await ensureDockerRunning()
  const dockerRuntime = getDockerRuntimeConfig()
  const dockerConfig = dockerRuntime.config ?? undefined
  const dockerContainerId = dockerRuntime.containerId ?? undefined

  const agent = await createAgentRuntime({
    threadId,
    workspacePath,
    dockerConfig,
    dockerContainerId,
    extraSystemPrompt: buildEmailModePrompt(threadId),
    forceToolNames: ["send_email"]
  })

  const humanMessage = new HumanMessage(message)
  const stream = await agent.stream(
    { messages: [humanMessage] },
    {
      configurable: { thread_id: threadId },
      streamMode: ["messages", "values"],
      recursionLimit: 1000
    }
  )

  let lastAssistant = ""
  let lastAssistantFromValues = ""
  for await (const chunk of stream) {
    const [mode, data] = chunk as [string, unknown]
    if (mode === "messages") {
      const content = extractAssistantChunkText(data)
      if (content) {
        if (content.startsWith(lastAssistant)) {
          lastAssistant = content
        } else {
          lastAssistant += content
        }
      }
    }
    if (mode === "values") {
      const state = data as { messages?: Array<{ id?: unknown; kwargs?: { content?: unknown } }> }
      if (Array.isArray(state.messages)) {
        for (const msg of state.messages) {
          const classId = Array.isArray(msg.id) ? msg.id : []
          const className = classId[classId.length - 1] || ""
          if (!className.includes("AI")) continue
          const content = extractContent(msg.kwargs?.content)
          if (content) {
            lastAssistantFromValues = content
          }
        }
      }
    }
  }

  const summary = lastAssistant.trim()
  if (summary) return summary
  return lastAssistantFromValues.trim()
}

async function processStartWorkTask(task: EmailTask, defaultWorkspacePath: string): Promise<void> {
  const threadId = uuid()
  const metadata: Record<string, unknown> = {
    mode: "email",
    workspacePath: defaultWorkspacePath
  }
  dbCreateThread(threadId, metadata)
  dbUpdateThread(threadId, {
    metadata: JSON.stringify(metadata),
    title: `Email Task ${new Date().toLocaleDateString()}`
  })
  broadcastThreadsChanged()

  const taskPrompt = buildTaskPrompt(task)
  await runAgentToSummary({
    threadId,
    workspacePath: defaultWorkspacePath,
    message: taskPrompt
  })
  broadcastThreadHistoryUpdated(threadId)
}

async function processReplyTask(task: EmailTask, defaultWorkspacePath: string | null): Promise<void> {
  const threadId = task.threadId?.trim()
  if (!threadId) {
    throw new Error("Missing work id in subject.")
  }

  const thread = getThread(threadId)
  if (!thread) {
    throw new Error(`Unknown work id: ${threadId}`)
  }

  const metadata = thread.metadata ? JSON.parse(thread.metadata) : {}
  let workspacePath = metadata.workspacePath as string | undefined
  if (!workspacePath && defaultWorkspacePath) {
    metadata.workspacePath = defaultWorkspacePath
    dbUpdateThread(threadId, { metadata: JSON.stringify(metadata) })
    workspacePath = defaultWorkspacePath
  }

  if (!workspacePath) {
    throw new Error("No workspace linked to this task.")
  }

  const taskPrompt = buildTaskPrompt(task)
  await runAgentToSummary({
    threadId,
    workspacePath,
    message: taskPrompt
  })
  broadcastThreadHistoryUpdated(threadId)
}

async function processEmailTask(task: EmailTask, defaultWorkspacePath: string | null): Promise<void> {
  if (processingTaskIds.has(task.id)) return
  processingTaskIds.add(task.id)

  try {
    if (isStartWorkSubject(task.subject)) {
      if (!defaultWorkspacePath) {
        await sendEmail({
          subject: buildEmailSubject("NEW", "Error - Missing default workspace"),
          text: buildErrorEmailBody(
            "No default workspace configured.",
            "Set a default workspace in Settings → General."
          )
        })
        return
      }
      await processStartWorkTask(task, defaultWorkspacePath)
    } else if (task.threadId) {
      await processReplyTask(task, defaultWorkspacePath)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    try {
      const threadId = task.threadId?.trim() || "NEW"
      await sendEmail({
        subject: buildEmailSubject(threadId, "Error - Failed to process task"),
        text: buildErrorEmailBody("Processing failed.", message)
      })
    } catch (sendError) {
      console.warn("[EmailWorker] Failed to send error email:", sendError)
    }
  } finally {
    try {
      await markEmailTaskRead(task.id)
    } catch (markError) {
      console.warn("[EmailWorker] Failed to mark email as read:", markError)
    }
    processingTaskIds.delete(task.id)
  }
}

async function pollOnce(): Promise<void> {
  if (polling) return
  polling = true

  try {
    const settings = getSettings()
    if (!settings.email?.enabled) return

    const defaultWorkspacePath =
      typeof settings.defaultWorkspacePath === "string" && settings.defaultWorkspacePath.trim()
        ? settings.defaultWorkspacePath.trim()
        : null

    const tasks = await fetchUnreadEmailTasks()
    for (const task of tasks) {
      await processEmailTask(task, defaultWorkspacePath)
    }
  } catch (error) {
    console.warn("[EmailWorker] Polling failed:", error)
  } finally {
    polling = false
  }
}

function normalizePollIntervalSec(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 60
  }
  return Math.max(1, Math.round(value))
}

function getPollIntervalMsFromSettings(): number {
  const settings = getSettings()
  const intervalSec = normalizePollIntervalSec(settings.email?.pollIntervalSec)
  return intervalSec * 1000
}

export function startEmailPolling(intervalMs?: number): void {
  const resolvedMs =
    typeof intervalMs === "number" && Number.isFinite(intervalMs) && intervalMs > 0
      ? intervalMs
      : getPollIntervalMsFromSettings()
  if (pollInterval) {
    if (currentIntervalMs === resolvedMs) return
    stopEmailPolling()
  }
  currentIntervalMs = resolvedMs
  pollInterval = setInterval(() => {
    void pollOnce()
  }, resolvedMs)
  void pollOnce()
}

export function stopEmailPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  currentIntervalMs = null
}

export function updateEmailPollingInterval(intervalSec?: number): void {
  const normalizedSec = normalizePollIntervalSec(intervalSec)
  const nextMs = normalizedSec * 1000
  if (pollInterval && currentIntervalMs === nextMs) return
  stopEmailPolling()
  startEmailPolling(nextMs)
}

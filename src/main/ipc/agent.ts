import { IpcMain, BrowserWindow } from "electron"
import { appendFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { Command } from "@langchain/langgraph"
import { createAgentRuntime, closeCheckpointer } from "../agent/runtime"
import { getThread, updateThread as dbUpdateThread } from "../db"
import { deleteThreadCheckpoint, hasThreadCheckpoint } from "../storage"
import { getSettings } from "../settings"
import { buildEmailModePrompt } from "../email/prompt"
import { ensureDockerRunning, getDockerRuntimeConfig } from "../docker/session"
import { appendRalphLogEntry } from "../ralph-log"
import { runAgentStream } from "../agent/run"
import type {
  AgentInvokeParams,
  AgentResumeParams,
  AgentInterruptParams,
  AgentCancelParams,
  ContentBlock,
  RalphState,
  ThreadMode,
  RalphLogEntry
} from "../types"

// Track active runs for cancellation
const activeRuns = new Map<string, AbortController>()

function parseMetadata(threadId: string): Record<string, unknown> {
  const row = getThread(threadId)
  return row?.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {}
}

function updateMetadata(threadId: string, updates: Record<string, unknown>): void {
  const current = parseMetadata(threadId)
  const next = {
    ...current,
    ...updates,
    ralph: {
      ...(current.ralph as Record<string, unknown> | undefined),
      ...(updates.ralph as Record<string, unknown> | undefined)
    }
  }
  dbUpdateThread(threadId, { metadata: JSON.stringify(next) })
}

async function resetRalphCheckpoint(threadId: string): Promise<void> {
  await closeCheckpointer(threadId)
  deleteThreadCheckpoint(threadId)
}

function appendProgressEntry(workspacePath: string, storyId = "INIT"): void {
  const entry = [
    `## [${new Date().toLocaleString()}] - ${storyId}`,
    "- 实现内容",
    "- 修改的文件",
    "- **后续迭代的经验教训：**",
    "  - 发现的模式",
    "  - 遇到的坑",
    "  - 有用的上下文",
    "---",
    ""
  ].join("\n")

  const progressPath = join(workspacePath, "progress.txt")
  appendFileSync(progressPath, entry)
}

function buildRalphInitPrompt(userMessage: string): string {
  const example = [
    "{",
    '  "project": "MyApp",',
    '  "branchName": "ralph/task-priority",',
    '  "description": "任务优先级系统 - 为任务添加优先级",',
    '  "userStories": [',
    "    {",
    '      "id": "US-001",',
    '      "title": "在数据库中添加优先级字段",',
    '      "description": "作为开发者，我需要存储任务优先级以便跨会话持久化。",',
    '      "acceptanceCriteria": [',
    "        \"在 tasks 表中添加 priority 列：'high' | 'medium' | 'low'（默认 'medium'）\",",
    '        "成功生成并运行迁移",',
    '        "类型检查通过"',
    "      ],",
    '      "priority": 1,',
    '      "passes": false,',
    '      "notes": ""',
    "    },",
    "    {",
    '      "id": "US-002",',
    '      "title": "在任务卡片上显示优先级指示器",',
    '      "description": "作为用户，我希望能一眼看到任务优先级。",',
    '      "acceptanceCriteria": [',
    '        "每个任务卡片显示彩色优先级徽章（红色=高，黄色=中，灰色=低）",',
    '        "无需悬停或点击即可看到优先级",',
    '        "类型检查通过",',
    '        "使用 dev-browser 技能在浏览器中验证"',
    "      ],",
    '      "priority": 2,',
    '      "passes": false,',
    '      "notes": ""',
    "    }",
    "  ]",
    "}"
  ].join("\n")

  return [
    "Ralph 模式初始化：",
    "1) 与用户确认任务详情。",
    "2) 按照下面的 JSON 格式生成计划。",
    "3) 将 JSON 保存到工作区的 ralph_plan.json 文件中。",
    "4) 请用户回复 /confirm 以开始迭代。",
    "",
    "JSON 格式示例：",
    example,
    "",
    "用户请求：",
    userMessage.trim()
  ].join("\n")
}

function extractTextFromContent(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((block) => (block.type === "text" && block.text ? block.text : ""))
    .join("")
}


export function registerAgentHandlers(ipcMain: IpcMain): void {
  console.log("[Agent] Registering agent handlers...")

  // Handle agent invocation with streaming
  ipcMain.on("agent:invoke", async (event, { threadId, message, modelId }: AgentInvokeParams) => {
    const channel = `agent:stream:${threadId}`
    const window = BrowserWindow.fromWebContents(event.sender)
    const messageText = extractTextFromContent(message)

    console.log("[Agent] Received invoke request:", {
      threadId,
      message: messageText.substring(0, 50),
      modelId
    })

    if (!window) {
      console.error("[Agent] No window found")
      return
    }

    // Abort any existing stream for this thread before starting a new one
    // This prevents concurrent streams which can cause checkpoint corruption
    const existingController = activeRuns.get(threadId)
    if (existingController) {
      console.log("[Agent] Aborting existing stream for thread:", threadId)
      existingController.abort()
      activeRuns.delete(threadId)
    }

    const abortController = new AbortController()
    activeRuns.set(threadId, abortController)

    // Abort the stream if the window is closed/destroyed
    const onWindowClosed = (): void => {
      console.log("[Agent] Window closed, aborting stream for thread:", threadId)
      abortController.abort()
    }
    window.once("closed", onWindowClosed)

    try {
      // Get workspace path from thread metadata - REQUIRED
      const thread = getThread(threadId)
      const metadata = thread?.metadata ? JSON.parse(thread.metadata) : {}
      console.log("[Agent] Thread metadata:", metadata)

      const workspacePath = metadata.workspacePath as string | undefined
      await ensureDockerRunning()
      const dockerRuntime = getDockerRuntimeConfig()
      const dockerConfig = dockerRuntime.config ?? undefined
      const dockerContainerId = dockerRuntime.containerId ?? undefined

      if (!workspacePath) {
        window.webContents.send(channel, {
          type: "error",
          error: "WORKSPACE_REQUIRED",
          message: "请在发送消息前选择一个工作区文件夹。"
        })
        return
      }

      const mode = (metadata.mode as ThreadMode) || "default"
      const settings = getSettings()
      const normalizedWorkspace = workspacePath || ""

      if (mode === "ralph") {
        const emitRalphLog = (
          entry: Omit<RalphLogEntry, "id" | "ts" | "threadId" | "runId">
        ): void => {
          const fullEntry: RalphLogEntry = {
            id: randomUUID(),
            ts: new Date().toISOString(),
            threadId,
            runId: randomUUID(),
            ...entry
          }
          appendRalphLogEntry(threadId, fullEntry)
          window.webContents.send(channel, {
            type: "custom",
            data: { type: "ralph_log", entry: fullEntry }
          })
        }

        const trimmedMessage = messageText.trim()
        if (trimmedMessage) {
          emitRalphLog({
            role: "user",
            content: trimmedMessage,
            phase: (metadata.ralph as RalphState | undefined)?.phase
          })
        }

        const ralph = (metadata.ralph as RalphState) || { phase: "init", iterations: 0 }
        const trimmed = trimmedMessage
        const isConfirm = trimmed.toLowerCase() === "/confirm"

        if (ralph.phase === "awaiting_confirm" && !isConfirm) {
          // 计划阶段不清空记忆
          // await resetRalphCheckpoint(threadId)
          const initPrompt = buildRalphInitPrompt(trimmed)

          await runAgentStream({
            threadId,
            workspacePath: normalizedWorkspace,
            modelId,
            dockerConfig,
            dockerContainerId,
            disableApprovals: true,
            message: initPrompt,
            window,
            channel,
            abortController,
            ralphLog: { enabled: true, iteration: 0, phase: ralph.phase }
          })
          updateMetadata(threadId, { ralph: { phase: "awaiting_confirm", iterations: 0 } })
          if (!abortController.signal.aborted) {
            window.webContents.send(channel, { type: "done" })
          }
          return
        }

        if (ralph.phase === "awaiting_confirm" && isConfirm) {
          const planPath = join(normalizedWorkspace, "ralph_plan.json")
          if (!existsSync(planPath)) {
            window.webContents.send(channel, {
              type: "error",
              error: "RALPH_PLAN_MISSING",
              message: "请在确认迭代前先生成 ralph_plan.json 文件。"
            })
            return
          }

          appendProgressEntry(normalizedWorkspace)
          updateMetadata(threadId, { ralph: { phase: "running", iterations: 0 } })

          const maxIterations = settings.ralphIterations || 5
          for (let i = 1; i <= maxIterations; i += 1) {
            if (abortController.signal.aborted) break
            const doneFlag = join(normalizedWorkspace, ".ralph_done")
            if (existsSync(doneFlag)) {
              updateMetadata(threadId, { ralph: { phase: "done", iterations: i } })
              break
            }

            // 迭代阶段清空记忆，从文件记忆中读取内容
            await resetRalphCheckpoint(threadId)
            const iterationPrompt = [
              `Ralph 迭代 ${i}/${maxIterations}：`,
              "- 在修改前先阅读 ralph_plan.json 和 progress.txt。",
              "- 以文件系统作为唯一的真实来源。",
              "- 实现下一个最高优先级的用户故事。",
              "- 使用规定的模板追加到 progress.txt（不要覆盖）。",
              "- 如果工作完成，创建一个 .ralph_done 文件并写入简短总结。",
              "- 如果工作未完成，创建一个 .ralph_ongoing 文件。",
              "- 工作过程的重要信息你需要写入在工作路径中，并写在 progress.txt 中，提示下一轮迭代读取或者最终总结。"
            ].join("\n")

            await runAgentStream({
              threadId,
              workspacePath: normalizedWorkspace,
              modelId,
              dockerConfig,
              dockerContainerId,
              disableApprovals: true,
              message: iterationPrompt,
              window,
              channel,
              abortController,
              ralphLog: { enabled: true, iteration: i, phase: "running" }
            })
            updateMetadata(threadId, { ralph: { iterations: i } })

            if (existsSync(doneFlag)) {
              updateMetadata(threadId, { ralph: { phase: "done", iterations: i } })
              break
            }
          }

          if (!abortController.signal.aborted) {
            updateMetadata(threadId, { ralph: { phase: "done" } })
          }

          if (!abortController.signal.aborted) {
            window.webContents.send(channel, { type: "done" })
          }
          return
        }

        if (ralph.phase === "running") {
          // 检查是否有 checkpoint，如果有则说明是上次运行中断，自动重置状态
          if (hasThreadCheckpoint(threadId)) {
            console.log("[Agent] Ralph stuck in running state, resetting to awaiting_confirm")
            updateMetadata(threadId, { ralph: { phase: "awaiting_confirm", iterations: 0 } })
            // 继续执行，不返回错误
          } else {
            window.webContents.send(channel, {
              type: "error",
              error: "RALPH_RUNNING",
              message: "Ralph 正在运行中，请等待完成。"
            })
            return
          }
        }

        if (ralph.phase === "done") {
          updateMetadata(threadId, { ralph: { phase: "init", iterations: 0 } })
        }

        if (ralph.phase === "init" || ralph.phase === "done") {
          await resetRalphCheckpoint(threadId)
          const initPrompt = buildRalphInitPrompt(messageText)

          await runAgentStream({
            threadId,
            workspacePath: normalizedWorkspace,
            modelId,
            dockerConfig,
            dockerContainerId,
            disableApprovals: true,
            message: initPrompt,
            window,
            channel,
            abortController,
            ralphLog: { enabled: true, iteration: 0, phase: ralph.phase }
          })
          updateMetadata(threadId, { ralph: { phase: "awaiting_confirm", iterations: 0 } })
          if (!abortController.signal.aborted) {
            window.webContents.send(channel, { type: "done" })
          }
          return
        }
      }

      if (mode === "email") {
        await runAgentStream({
          threadId,
          workspacePath: normalizedWorkspace,
          modelId,
          dockerConfig,
          dockerContainerId,
          message,
          window,
          channel,
          abortController,
          extraSystemPrompt: buildEmailModePrompt(threadId),
          forceToolNames: ["send_email"]
        })

        if (!abortController.signal.aborted) {
          window.webContents.send(channel, { type: "done" })
        }
        return
      }

      await runAgentStream({
        threadId,
        workspacePath: normalizedWorkspace,
        modelId,
        dockerConfig,
        dockerContainerId,
        message,
        window,
        channel,
        abortController
      })

      if (!abortController.signal.aborted) {
        window.webContents.send(channel, { type: "done" })
      }
    } catch (error) {
      // Ignore abort-related errors (expected when stream is cancelled)
      const isAbortError =
        error instanceof Error &&
        (error.name === "AbortError" ||
          error.message.includes("aborted") ||
          error.message.includes("Controller is already closed"))

      if (!isAbortError) {
        console.error("[Agent] Error:", error)
        window.webContents.send(channel, {
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error"
        })
      }
    } finally {
      window.removeListener("closed", onWindowClosed)
      activeRuns.delete(threadId)
    }
  })

  // Handle agent resume (after interrupt approval/rejection via useStream)
  ipcMain.on("agent:resume", async (event, { threadId, command, modelId }: AgentResumeParams) => {
    const channel = `agent:stream:${threadId}`
    const window = BrowserWindow.fromWebContents(event.sender)

    console.log("[Agent] Received resume request:", { threadId, command, modelId })

    if (!window) {
      console.error("[Agent] No window found for resume")
      return
    }

    // Get workspace path from thread metadata
    const thread = getThread(threadId)
    const metadata = thread?.metadata ? JSON.parse(thread.metadata) : {}
    const workspacePath = metadata.workspacePath as string | undefined
    await ensureDockerRunning()
    const dockerRuntime = getDockerRuntimeConfig()
    const dockerConfig = dockerRuntime.config ?? undefined
    const dockerContainerId = dockerRuntime.containerId ?? undefined

    if (!workspacePath) {
      window.webContents.send(channel, {
        type: "error",
        error: "需要工作区路径"
      })
      return
    }

    // Abort any existing stream before resuming
    const existingController = activeRuns.get(threadId)
    if (existingController) {
      existingController.abort()
      activeRuns.delete(threadId)
    }

    const abortController = new AbortController()
    activeRuns.set(threadId, abortController)

    try {
      const agent = await createAgentRuntime({
        threadId,
        workspacePath: workspacePath || "",
        modelId,
        dockerConfig,
        dockerContainerId
      })
      const config = {
        configurable: { thread_id: threadId },
        signal: abortController.signal,
        streamMode: ["messages", "values"] as const,
        recursionLimit: 1000
      }

      // Resume from checkpoint by streaming with Command containing the decision
      // The HITL middleware expects { decisions: [{ type: 'approve' | 'reject' | 'edit' }] }
      const decisionType = command?.resume?.decision || "approve"
      const resumeValue = { decisions: [{ type: decisionType }] }
      const stream = await agent.stream(new Command({ resume: resumeValue }), config)

      for await (const chunk of stream) {
        if (abortController.signal.aborted) break

        const [mode, data] = chunk as unknown as [string, unknown]
        window.webContents.send(channel, {
          type: "stream",
          mode,
          data: JSON.parse(JSON.stringify(data))
        })
      }

      if (!abortController.signal.aborted) {
        window.webContents.send(channel, { type: "done" })
      }
    } catch (error) {
      const isAbortError =
        error instanceof Error &&
        (error.name === "AbortError" ||
          error.message.includes("aborted") ||
          error.message.includes("Controller is already closed"))

      if (!isAbortError) {
        console.error("[Agent] Resume error:", error)
        window.webContents.send(channel, {
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error"
        })
      }
    } finally {
      activeRuns.delete(threadId)
    }
  })

  // Handle HITL interrupt response
  ipcMain.on("agent:interrupt", async (event, { threadId, decision }: AgentInterruptParams) => {
    const channel = `agent:stream:${threadId}`
    const window = BrowserWindow.fromWebContents(event.sender)

    if (!window) {
      console.error("[Agent] No window found for interrupt response")
      return
    }

    // Get workspace path from thread metadata - REQUIRED
    const thread = getThread(threadId)
    const metadata = thread?.metadata ? JSON.parse(thread.metadata) : {}
    const workspacePath = metadata.workspacePath as string | undefined
    const modelId = metadata.model as string | undefined
    await ensureDockerRunning()
    const dockerRuntime = getDockerRuntimeConfig()
    const dockerConfig = dockerRuntime.config ?? undefined
    const dockerContainerId = dockerRuntime.containerId ?? undefined

    if (!workspacePath) {
      window.webContents.send(channel, {
        type: "error",
        error: "需要工作区路径"
      })
      return
    }

    // Abort any existing stream before continuing
    const existingController = activeRuns.get(threadId)
    if (existingController) {
      existingController.abort()
      activeRuns.delete(threadId)
    }

    const abortController = new AbortController()
    activeRuns.set(threadId, abortController)

    try {
      const agent = await createAgentRuntime({
        threadId,
        workspacePath: workspacePath || "",
        modelId,
        dockerConfig,
        dockerContainerId
      })
      const config = {
        configurable: { thread_id: threadId },
        signal: abortController.signal,
        streamMode: ["messages", "values"] as const,
        recursionLimit: 1000
      }

      if (decision.type === "approve") {
        // Resume execution by invoking with null (continues from checkpoint)
        const stream = await agent.stream(null, config)

        for await (const chunk of stream) {
          if (abortController.signal.aborted) break

          const [mode, data] = chunk as unknown as [string, unknown]
          window.webContents.send(channel, {
            type: "stream",
            mode,
            data: JSON.parse(JSON.stringify(data))
          })
        }

        if (!abortController.signal.aborted) {
          window.webContents.send(channel, { type: "done" })
        }
      } else if (decision.type === "reject") {
        // For reject, we need to send a Command with reject decision
        // For now, just send done - the agent will see no resumption happened
        window.webContents.send(channel, { type: "done" })
      }
      // edit case handled similarly to approve with modified args
    } catch (error) {
      const isAbortError =
        error instanceof Error &&
        (error.name === "AbortError" ||
          error.message.includes("aborted") ||
          error.message.includes("Controller is already closed"))

      if (!isAbortError) {
        console.error("[Agent] Interrupt error:", error)
        window.webContents.send(channel, {
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error"
        })
      }
    } finally {
      activeRuns.delete(threadId)
    }
  })

  // Handle cancellation
  ipcMain.handle("agent:cancel", async (_event, { threadId }: AgentCancelParams) => {
    const controller = activeRuns.get(threadId)
    if (controller) {
      controller.abort()
      activeRuns.delete(threadId)
    }
  })
}

import { IpcMain, BrowserWindow } from "electron"
import { appendFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { HumanMessage } from "@langchain/core/messages"
import { Command } from "@langchain/langgraph"
import { createAgentRuntime, closeCheckpointer } from "../agent/runtime"
import { getThread, updateThread as dbUpdateThread } from "../db"
import { deleteThreadCheckpoint } from "../storage"
import { getSettings } from "../settings"
import { buildEmailSubject, sendEmail } from "../email/service"
import { ensureDockerRunning, getDockerRuntimeConfig } from "../docker/session"
import { extractAssistantChunkText } from "../agent/stream-utils"
import type {
  AgentInvokeParams,
  AgentResumeParams,
  AgentInterruptParams,
  AgentCancelParams,
  RalphState,
  ThreadMode,
  DockerConfig
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
    "- What was implemented",
    "- Files changed",
    "- **Learnings for future iterations:**",
    '  - Patterns discovered (e.g., "this codebase uses X for Y")',
    '  - Gotchas encountered (e.g., "don\'t forget to update Z when changing W")',
    '  - Useful context (e.g., "the evaluation panel is in component X")',
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
    '  "description": "Task Priority System - Add priority levels to tasks",',
    '  "userStories": [',
    "    {",
    '      "id": "US-001",',
    '      "title": "Add priority field to database",',
    '      "description": "As a developer, I need to store task priority so it persists across sessions.",',
    '      "acceptanceCriteria": [',
    "        \"Add priority column to tasks table: 'high' | 'medium' | 'low' (default 'medium')\",",
    '        "Generate and run migration successfully",',
    '        "Typecheck passes"',
    "      ],",
    '      "priority": 1,',
    '      "passes": false,',
    '      "notes": ""',
    "    },",
    "    {",
    '      "id": "US-002",',
    '      "title": "Display priority indicator on task cards",',
    '      "description": "As a user, I want to see task priority at a glance.",',
    '      "acceptanceCriteria": [',
    '        "Each task card shows colored priority badge (red=high, yellow=medium, gray=low)",',
    '        "Priority visible without hovering or clicking",',
    '        "Typecheck passes",',
    '        "Verify in browser using dev-browser skill"',
    "      ],",
    '      "priority": 2,',
    '      "passes": false,',
    '      "notes": ""',
    "    }",
    "  ]",
    "}"
  ].join("\n")

  return [
    "Ralph mode initialization:",
    "1) Confirm task details with the user.",
    "2) Produce the JSON plan in the exact schema shown below.",
    "3) Save the JSON to ralph_plan.json in the workspace.",
    "4) Ask the user to reply with /confirm to start iterations.",
    "",
    "JSON schema example:",
    example,
    "",
    "User request:",
    userMessage.trim()
  ].join("\n")
}

async function streamAgentRun({
  threadId,
  workspacePath,
  modelId,
  dockerConfig,
  dockerContainerId,
  disableApprovals,
  message,
  window,
  channel,
  abortController
}: {
  threadId: string
  workspacePath: string
  modelId?: string
  dockerConfig?: DockerConfig | null
  dockerContainerId?: string | null
  disableApprovals?: boolean
  message: string
  window: BrowserWindow
  channel: string
  abortController: AbortController
}): Promise<string> {
  const agent = await createAgentRuntime({
    threadId,
    workspacePath,
    modelId,
    dockerConfig,
    dockerContainerId,
    disableApprovals
  })

  const humanMessage = new HumanMessage(message)
  const stream = await agent.stream(
    { messages: [humanMessage] },
    {
      configurable: { thread_id: threadId },
      signal: abortController.signal,
      streamMode: ["messages", "values"],
      recursionLimit: 1000
    }
  )

  let lastAssistant = ""

  for await (const chunk of stream) {
    if (abortController.signal.aborted) break
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

    window.webContents.send(channel, {
      type: "stream",
      mode,
      data: JSON.parse(JSON.stringify(data))
    })
  }

  return lastAssistant.trim()
}

export function registerAgentHandlers(ipcMain: IpcMain): void {
  console.log("[Agent] Registering agent handlers...")

  // Handle agent invocation with streaming
  ipcMain.on("agent:invoke", async (event, { threadId, message, modelId }: AgentInvokeParams) => {
    const channel = `agent:stream:${threadId}`
    const window = BrowserWindow.fromWebContents(event.sender)

    console.log("[Agent] Received invoke request:", {
      threadId,
      message: message.substring(0, 50),
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
          message: "Please select a workspace folder before sending messages."
        })
        return
      }

      const mode = (metadata.mode as ThreadMode) || "default"
      const settings = getSettings()
      const normalizedWorkspace = workspacePath || ""

      if (mode === "ralph") {
        const ralph = (metadata.ralph as RalphState) || { phase: "init", iterations: 0 }
        const trimmed = message.trim()
        const isConfirm = trimmed.toLowerCase() === "/confirm"

        if (ralph.phase === "awaiting_confirm" && !isConfirm) {
          await resetRalphCheckpoint(threadId)
          const initPrompt = buildRalphInitPrompt(trimmed)

          await streamAgentRun({
            threadId,
            workspacePath: normalizedWorkspace,
            modelId,
            dockerConfig,
            dockerContainerId,
            disableApprovals: true,
            message: initPrompt,
            window,
            channel,
            abortController
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
              message: "Please generate ralph_plan.json before confirming iterations."
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

            await resetRalphCheckpoint(threadId)
            const iterationPrompt = [
              `Ralph iteration ${i}/${maxIterations}:`,
              "- Read ralph_plan.json and progress.txt before making changes.",
              "- Use the filesystem as the single source of truth.",
              "- Implement the next highest-priority story.",
              "- Append to progress.txt using the required template (never overwrite).",
              "- If work is complete, create a .ralph_done file with a short summary."
            ].join("\n")

            await streamAgentRun({
              threadId,
              workspacePath: normalizedWorkspace,
              modelId,
              dockerConfig,
              dockerContainerId,
              disableApprovals: true,
              message: iterationPrompt,
              window,
              channel,
              abortController
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
          window.webContents.send(channel, {
            type: "error",
            error: "RALPH_RUNNING",
            message: "Ralph is already running. Please wait for completion."
          })
          return
        }

        if (ralph.phase === "done") {
          updateMetadata(threadId, { ralph: { phase: "init", iterations: 0 } })
        }

        if (ralph.phase === "init" || ralph.phase === "done") {
          await resetRalphCheckpoint(threadId)
          const initPrompt = buildRalphInitPrompt(message)

          await streamAgentRun({
            threadId,
            workspacePath: normalizedWorkspace,
            modelId,
            dockerConfig,
            dockerContainerId,
            disableApprovals: true,
            message: initPrompt,
            window,
            channel,
            abortController
          })
          updateMetadata(threadId, { ralph: { phase: "awaiting_confirm", iterations: 0 } })
          if (!abortController.signal.aborted) {
            window.webContents.send(channel, { type: "done" })
          }
          return
        }
      }

      if (mode === "email") {
        try {
          await sendEmail({
            subject: buildEmailSubject(threadId, `User Message - ${thread?.title || threadId}`),
            text: message
          })
        } catch (emailError) {
          console.warn("[Agent] Failed to send outgoing email:", emailError)
        }

        const summary = await streamAgentRun({
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

        const summaryText = summary || "Task completed. See Openwork for details."
        try {
          await sendEmail({
            subject: buildEmailSubject(threadId, `Completed - ${thread?.title || threadId}`),
            text: summaryText
          })
        } catch (emailError) {
          console.warn("[Agent] Failed to send completion email:", emailError)
        }

        if (!abortController.signal.aborted) {
          window.webContents.send(channel, { type: "done" })
        }
        return
      }

      await streamAgentRun({
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
        error: "Workspace path is required"
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
        error: "Workspace path is required"
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

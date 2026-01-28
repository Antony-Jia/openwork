import { v4 as uuid } from "uuid"
import { HumanMessage } from "@langchain/core/messages"
import { createAgentRuntime, closeCheckpointer } from "../agent/runtime"
import { deleteThreadCheckpoint } from "../storage"
import { getThread, createThread as dbCreateThread, updateThread as dbUpdateThread } from "../db"
import { getSettings } from "../settings"
import { ensureDockerRunning, getDockerRuntimeConfig } from "../docker/session"
import { extractAssistantChunkText } from "../agent/stream-utils"
import { broadcastThreadsChanged } from "../ipc/events"
import {
  buildEmailSubject,
  fetchUnreadEmailTasks,
  isStartWorkSubject,
  markEmailTaskRead,
  sendEmail,
  stripEmailSubjectPrefix
} from "./service"
import type { EmailTask } from "./service"

let pollInterval: NodeJS.Timeout | null = null
let polling = false
const processingTaskIds = new Set<string>()

function buildTaskPrompt(task: EmailTask): string {
  return [`Email task from ${task.from}:`, `Subject: ${task.subject}`, "", task.text].join("\n")
}

function buildStartEmailBody(threadId: string): string {
  return [
    "Started a new Openwork task.",
    "",
    `Work ID: ${threadId}`,
    "Reply to this email to continue the task.",
    ""
  ].join("\n")
}

function buildErrorEmailBody(title: string, details: string): string {
  return ["Openwork email task failed.", "", title, "", details, ""].join("\n")
}

async function resetThreadCheckpoint(threadId: string): Promise<void> {
  await closeCheckpointer(threadId)
  deleteThreadCheckpoint(threadId)
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
    dockerContainerId
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
  }

  return lastAssistant.trim()
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

  try {
    await sendEmail({
      subject: buildEmailSubject(threadId, "StartWork"),
      text: buildStartEmailBody(threadId)
    })
  } catch (error) {
    console.warn("[EmailWorker] Failed to send start email:", error)
  }

  const taskPrompt = buildTaskPrompt(task)
  const summary = await runAgentToSummary({
    threadId,
    workspacePath: defaultWorkspacePath,
    message: taskPrompt
  })

  const summaryText = summary || "Task completed. See Openwork for details."
  await sendEmail({
    subject: buildEmailSubject(threadId, "Completed - StartWork"),
    text: summaryText
  })
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

  await resetThreadCheckpoint(threadId)

  const taskPrompt = buildTaskPrompt(task)
  const summary = await runAgentToSummary({
    threadId,
    workspacePath,
    message: taskPrompt
  })
  const summaryText = summary || "Task completed. See Openwork for details."
  const cleanedSubject = stripEmailSubjectPrefix(task.subject)
  await sendEmail({
    subject: buildEmailSubject(threadId, `Completed - ${cleanedSubject || task.subject}`),
    text: summaryText
  })
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

export function startEmailPolling(intervalMs = 60_000): void {
  if (pollInterval) return
  pollInterval = setInterval(() => {
    void pollOnce()
  }, intervalMs)
  void pollOnce()
}

export function stopEmailPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

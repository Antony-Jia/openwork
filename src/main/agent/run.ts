import { BrowserWindow } from "electron"
import { randomUUID } from "node:crypto"
import { HumanMessage } from "@langchain/core/messages"
import { createAgentRuntime } from "./runtime"
import { extractAssistantChunkText } from "./stream-utils"
import { appendRalphLogEntry } from "../ralph-log"
import type { ContentBlock, RalphLogEntry, RalphState, DockerConfig } from "../types"

export async function runAgentStream({
  threadId,
  workspacePath,
  modelId,
  dockerConfig,
  dockerContainerId,
  disableApprovals,
  extraSystemPrompt,
  forceToolNames,
  message,
  window,
  channel,
  abortController,
  ralphLog
}: {
  threadId: string
  workspacePath: string
  modelId?: string
  dockerConfig?: DockerConfig | null
  dockerContainerId?: string | null
  disableApprovals?: boolean
  extraSystemPrompt?: string
  forceToolNames?: string[]
  message: string | ContentBlock[]
  window: BrowserWindow
  channel: string
  abortController: AbortController
  ralphLog?: {
    enabled: boolean
    iteration?: number
    phase?: RalphState["phase"]
  }
}): Promise<string> {
  const agent = await createAgentRuntime({
    threadId,
    workspacePath,
    modelId,
    messageContent: message,
    dockerConfig,
    dockerContainerId,
    disableApprovals,
    extraSystemPrompt,
    forceToolNames
  })

  const humanMessage = Array.isArray(message)
    ? new HumanMessage({ content: message as unknown as any })
    : new HumanMessage(message)
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
  const runId = randomUUID()
  const seenMessageIds = new Set<string>()
  const seenToolCallIds = new Set<string>()

  let loggedAnything = false
  const appendLog = (entry: Omit<RalphLogEntry, "id" | "ts" | "threadId" | "runId">): void => {
    if (!ralphLog?.enabled) return

    const fullEntry: RalphLogEntry = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      threadId,
      runId,
      iteration: ralphLog.iteration,
      phase: ralphLog.phase,
      ...entry
    }

    try {
      appendRalphLogEntry(threadId, fullEntry)
      loggedAnything = true
      window.webContents.send(channel, {
        type: "custom",
        data: { type: "ralph_log", entry: fullEntry }
      })
    } catch (error) {
      console.warn("[Agent] Failed to append ralph log entry:", error)
    }
  }

  const extractContent = (content: unknown): string => {
    if (typeof content === "string") return content
    if (Array.isArray(content)) {
      return content
        .filter(
          (block): block is { type: "text"; text: string } =>
            !!block && typeof block === "object" && (block as { type?: string }).type === "text"
        )
        .map((block) => block.text)
        .join("")
    }
    return ""
  }

  const getMessageRole = (msg: Record<string, unknown>): string => {
    if (typeof (msg as { _getType?: () => string })._getType === "function") {
      return (msg as { _getType: () => string })._getType()
    }
    if (typeof msg.type === "string") return msg.type
    const classId = Array.isArray(msg.id) ? msg.id : []
    const className = classId[classId.length - 1] || ""
    if (className.includes("Human")) return "human"
    if (className.includes("AI")) return "ai"
    if (className.includes("Tool")) return "tool"
    if (className.includes("System")) return "system"
    return ""
  }

  const getMessageId = (msg: Record<string, unknown>): string | undefined => {
    if (typeof msg.id === "string") return msg.id
    const kwargs = msg.kwargs as { id?: string } | undefined
    return kwargs?.id
  }

  const getMessageContent = (msg: Record<string, unknown>): string => {
    if ("content" in msg) {
      return extractContent(msg.content)
    }
    const kwargs = msg.kwargs as { content?: unknown } | undefined
    return extractContent(kwargs?.content)
  }

  const getToolCalls = (
    msg: Record<string, unknown>
  ): Array<{ id?: string; name?: string; args?: Record<string, unknown> }> => {
    if (Array.isArray((msg as { tool_calls?: unknown }).tool_calls)) {
      return (msg as {
        tool_calls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>
      }).tool_calls
    }
    const kwargs = msg.kwargs as {
      tool_calls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>
    } | undefined
    return kwargs?.tool_calls || []
  }

  const getToolMessageMeta = (
    msg: Record<string, unknown>
  ): { toolCallId?: string; toolName?: string } => {
    const toolCallId = (msg as { tool_call_id?: string }).tool_call_id
    const toolName = (msg as { name?: string }).name
    const kwargs = msg.kwargs as { tool_call_id?: string; name?: string } | undefined
    return {
      toolCallId: toolCallId || kwargs?.tool_call_id,
      toolName: toolName || kwargs?.name
    }
  }

  for await (const chunk of stream) {
    if (abortController.signal.aborted) break
    const [mode, data] = chunk as [string, unknown]

    if (mode === "values" && ralphLog?.enabled) {
      const state = data as { messages?: unknown[] }
      if (Array.isArray(state.messages)) {
        for (const rawMsg of state.messages) {
          if (!rawMsg || typeof rawMsg !== "object") continue
          const msg = rawMsg as Record<string, unknown>
          const role = getMessageRole(msg)
          if (role === "human") continue

          const messageId = getMessageId(msg)
          if (messageId && seenMessageIds.has(messageId)) {
            continue
          }

          const content = getMessageContent(msg)
          const toolCalls = getToolCalls(msg)

          if (role === "ai") {
            if (messageId) seenMessageIds.add(messageId)
            if (content || toolCalls.length > 0) {
              appendLog({
                role: "ai",
                content,
                messageId
              })
            }

            for (const tc of toolCalls) {
              if (!tc.id || seenToolCallIds.has(tc.id)) continue
              seenToolCallIds.add(tc.id)
              let argsText = ""
              try {
                argsText = tc.args ? JSON.stringify(tc.args) : ""
              } catch {
                argsText = ""
              }
              appendLog({
                role: "tool_call",
                content: `${tc.name || "tool"}(${argsText})`,
                toolCallId: tc.id,
                toolName: tc.name,
                toolArgs: tc.args
              })
            }
          } else if (role === "tool") {
            if (messageId) seenMessageIds.add(messageId)
            const meta = getToolMessageMeta(msg)
            appendLog({
              role: "tool",
              content,
              messageId,
              toolCallId: meta.toolCallId,
              toolName: meta.toolName
            })
          }
        }
      }
    }

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

  if (ralphLog?.enabled && !loggedAnything && lastAssistant.trim()) {
    appendLog({
      role: "ai",
      content: lastAssistant.trim()
    })
  }

  return lastAssistant.trim()
}

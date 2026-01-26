import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { Send, Square, Loader2, AlertCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAppStore } from "@/lib/store"
import { useCurrentThread, useThreadStream } from "@/lib/thread-context"
import { MessageBubble } from "./MessageBubble"
import { Folder } from "lucide-react"
import { WorkspacePicker } from "./WorkspacePicker"
import { selectWorkspaceFolder } from "@/lib/workspace-utils"
import { ChatTodos } from "./ChatTodos"
import { ContextUsageIndicator } from "./ContextUsageIndicator"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/lib/i18n"
import type { Message } from "@/types"

interface AgentStreamValues {
  todos?: Array<{ id?: string; content?: string; status?: string }>
}

interface StreamMessage {
  id?: string
  type?: string
  content?: string | unknown[]
  tool_calls?: Message["tool_calls"]
  tool_call_id?: string
  name?: string
}

interface ChatContainerProps {
  threadId: string
}

export function ChatContainer({ threadId }: ChatContainerProps): React.JSX.Element {
  const { t } = useLanguage()
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)

  const { loadThreads, generateTitleForFirstMessage } = useAppStore()

  // Get persisted thread state and actions from context
  const {
    messages: threadMessages,
    pendingApproval,
    todos,
    error: threadError,
    workspacePath,
    dockerEnabled,
    tokenUsage,
    currentModel,
    setTodos,
    setWorkspaceFiles,
    setWorkspacePath,
    setPendingApproval,
    appendMessage,
    setError,
    clearError
  } = useCurrentThread(threadId)

  // Get the stream data via subscription - reactive updates without re-rendering provider
  const streamData = useThreadStream(threadId)
  const stream = streamData.stream
  const isLoading = streamData.isLoading

  const handleApprovalDecision = useCallback(
    async (decision: "approve" | "reject" | "edit"): Promise<void> => {
      if (!pendingApproval || !stream) return

      setPendingApproval(null)

      try {
        await stream.submit(null, {
          command: { resume: { decision } },
          config: { configurable: { thread_id: threadId, model_id: currentModel } }
        })
      } catch (err) {
        console.error("[ChatContainer] Resume command failed:", err)
      }
    },
    [pendingApproval, setPendingApproval, stream, threadId, currentModel]
  )

  const agentValues = stream?.values as AgentStreamValues | undefined
  const streamTodos = agentValues?.todos
  useEffect(() => {
    if (Array.isArray(streamTodos)) {
      setTodos(
        streamTodos.map((t) => ({
          id: t.id || crypto.randomUUID(),
          content: t.content || "",
          status: (t.status || "pending") as "pending" | "in_progress" | "completed" | "cancelled"
        }))
      )
    }
  }, [streamTodos, setTodos])

  const prevLoadingRef = useRef(false)
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      for (const rawMsg of streamData.messages) {
        const msg = rawMsg as StreamMessage
        if (msg.id) {
          const streamMsg = msg as StreamMessage & { id: string }

          let role: Message["role"] = "assistant"
          if (streamMsg.type === "human") role = "user"
          else if (streamMsg.type === "tool") role = "tool"
          else if (streamMsg.type === "ai") role = "assistant"

          const storeMsg: Message = {
            id: streamMsg.id,
            role,
            content: typeof streamMsg.content === "string" ? streamMsg.content : "",
            tool_calls: streamMsg.tool_calls,
            ...(role === "tool" &&
              streamMsg.tool_call_id && { tool_call_id: streamMsg.tool_call_id }),
            ...(role === "tool" && streamMsg.name && { name: streamMsg.name }),
            created_at: new Date()
          }
          appendMessage(storeMsg)
        }
      }
      loadThreads()
    }
    prevLoadingRef.current = isLoading
  }, [isLoading, streamData.messages, loadThreads, appendMessage])

  const displayMessages = useMemo(() => {
    const threadMessageIds = new Set(threadMessages.map((m) => m.id))

    const streamingMsgs: Message[] = ((streamData.messages || []) as StreamMessage[])
      .filter((m): m is StreamMessage & { id: string } => !!m.id && !threadMessageIds.has(m.id))
      .map((streamMsg) => {
        let role: Message["role"] = "assistant"
        if (streamMsg.type === "human") role = "user"
        else if (streamMsg.type === "tool") role = "tool"
        else if (streamMsg.type === "ai") role = "assistant"

        return {
          id: streamMsg.id,
          role,
          content: typeof streamMsg.content === "string" ? streamMsg.content : "",
          tool_calls: streamMsg.tool_calls,
          ...(role === "tool" &&
            streamMsg.tool_call_id && { tool_call_id: streamMsg.tool_call_id }),
          ...(role === "tool" && streamMsg.name && { name: streamMsg.name }),
          created_at: new Date()
        }
      })

    return [...threadMessages, ...streamingMsgs]
  }, [threadMessages, streamData.messages])

  // Build tool results map from tool messages
  const toolResults = useMemo(() => {
    const results = new Map<string, { content: string | unknown; is_error?: boolean }>()
    for (const msg of displayMessages) {
      if (msg.role === "tool" && msg.tool_call_id) {
        results.set(msg.tool_call_id, {
          content: msg.content,
          is_error: false // Could be enhanced to track errors
        })
      }
    }
    return results
  }, [displayMessages])

  // Get the scrollable container element (now native div)
  const getViewport = useCallback((): HTMLDivElement | null => {
    return scrollRef.current
  }, [])

  // Track scroll position to determine if user is at bottom
  const handleScroll = useCallback((): void => {
    const viewport = getViewport()
    if (!viewport) return

    const { scrollTop, scrollHeight, clientHeight } = viewport
    // Consider "at bottom" if within 50px of the bottom
    const threshold = 50
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < threshold
  }, [getViewport])

  // Attach scroll listener to viewport
  useEffect(() => {
    const viewport = getViewport()
    if (!viewport) return

    viewport.addEventListener("scroll", handleScroll)
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [getViewport, handleScroll])

  // Auto-scroll on new messages only if already at bottom
  useEffect(() => {
    const viewport = getViewport()
    if (viewport && isAtBottomRef.current) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [displayMessages, isLoading, getViewport])

  // Always scroll to bottom when switching threads
  useEffect(() => {
    const viewport = getViewport()
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
      isAtBottomRef.current = true
    }
  }, [threadId, getViewport])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [threadId])

  const handleDismissError = (): void => {
    clearError()
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!input.trim() || isLoading || !stream) return

    if (!workspacePath && !dockerEnabled) {
      setError("Please select a workspace folder before sending messages.")
      return
    }

    if (threadError) {
      clearError()
    }

    if (pendingApproval) {
      setPendingApproval(null)
    }

    const message = input.trim()
    setInput("")

    const isFirstMessage = threadMessages.length === 0

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      created_at: new Date()
    }
    appendMessage(userMessage)

    if (isFirstMessage) {
      generateTitleForFirstMessage(threadId, message)
    }

    await stream.submit(
      {
        messages: [{ type: "human", content: message }]
      },
      {
        config: {
          configurable: { thread_id: threadId, model_id: currentModel }
        }
      }
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  // Auto-resize textarea based on content
  const adjustTextareaHeight = (): void => {
    const textarea = inputRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }

  useEffect(() => {
    adjustTextareaHeight()
  }, [input])

  const handleCancel = async (): Promise<void> => {
    await stream?.stop()
  }

  const handleSelectWorkspaceFromEmptyState = async (): Promise<void> => {
    await selectWorkspaceFolder(threadId, setWorkspacePath, setWorkspaceFiles, () => {}, undefined)
  }

  return (
    <div className={cn("flex flex-col flex-1 min-h-0", dockerEnabled && "docker-mode-ring")}>
      {/* Messages - scrollable area */}
      <div className="flex-1 overflow-y-auto min-h-0" ref={scrollRef}>
        <div className="p-4 pb-2">
          <div className="max-w-3xl mx-auto space-y-4">
            {displayMessages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-in fade-in duration-500">
                <div className="text-section-header mb-4 text-xs tracking-[0.2em] opacity-50">
                  {t("chat.new_thread")}
                </div>
                {workspacePath ? (
                  <div className="text-sm font-light">{t("chat.start_conversation")}</div>
                ) : dockerEnabled ? (
                  <div className="text-sm font-light">{t("chat.docker_ready")}</div>
                ) : (
                  <div className="text-sm text-center space-y-4 max-w-xs">
                    <div className="bg-background-elevated p-4 rounded-lg border border-border/50 shadow-sm">
                      <span className="block text-amber-500 font-medium mb-1">
                        {t("chat.select_workspace")}
                      </span>
                      <span className="block text-xs text-muted-foreground leading-relaxed">
                        {t("chat.workspace_needed")}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-xs font-medium gap-2 hover:bg-accent hover:text-accent-foreground transition-all duration-200 shadow-sm"
                      onClick={handleSelectWorkspaceFromEmptyState}
                    >
                      <Folder className="size-3.5" />
                      <span>{t("chat.select_workspace_button")}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {displayMessages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                toolResults={toolResults}
                pendingApproval={pendingApproval}
                onApprovalDecision={handleApprovalDecision}
              />
            ))}

            {/* Streaming indicator and inline TODOs */}
            {isLoading && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  {t("chat.thinking")}
                </div>
                {todos.length > 0 && <ChatTodos todos={todos} />}
              </div>
            )}

            {/* Error state */}
            {threadError && !isLoading && (
              <div className="flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-4">
                <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-destructive text-sm">
                    {t("chat.error_title")}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 break-words">
                    {threadError}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {t("chat.error_dismiss")}
                  </div>
                </div>
                <button
                  onClick={handleDismissError}
                  className="shrink-0 rounded p-1 hover:bg-destructive/20 transition-colors"
                  aria-label="Dismiss error"
                >
                  <X className="size-4 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Input - stays at bottom */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 bg-background border-t border-border/30">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative">
          <div className="relative flex flex-col gap-2 rounded-xl border border-border bg-background shadow-sm focus-within:shadow-md focus-within:border-ring/30 transition-all duration-200 p-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.placeholder")}
              disabled={isLoading}
              className="flex-1 w-full min-w-0 resize-none bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50"
              rows={1}
              style={{ minHeight: "44px", maxHeight: "200px" }}
            />
            <div className="flex items-center justify-between px-2 pb-1">
              <div className="flex items-center gap-2">
                {!dockerEnabled && <WorkspacePicker threadId={threadId} />}
              </div>
              <div className="flex items-center">
                {isLoading ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleCancel}
                    className="h-7 w-7"
                  >
                    <Square className="size-3.5 fill-current" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-sm"
                    disabled={!input.trim()}
                    className={cn(
                      "h-7 w-7 transition-all duration-200",
                      input.trim()
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "text-muted-foreground"
                    )}
                  >
                    <Send className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          {tokenUsage && (
            <div className="absolute -top-6 right-0">
              <ContextUsageIndicator tokenUsage={tokenUsage} modelId={currentModel} />
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

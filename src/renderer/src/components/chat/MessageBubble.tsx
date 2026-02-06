import { useCallback, useEffect, useRef, useState } from "react"
import { User, Bot, Volume2, Square, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/lib/i18n"
import type { Message, HITLRequest } from "@/types"
import { ToolCallRenderer } from "./ToolCallRenderer"
import { StreamingMarkdown } from "./StreamingMarkdown"

interface ToolResultInfo {
  content: string | unknown
  is_error?: boolean
}

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
  toolResults?: Map<string, ToolResultInfo>
  pendingApproval?: HITLRequest | null
  onApprovalDecision?: (decision: "approve" | "reject" | "edit") => void
  onApproveAlways?: () => void
}

function extractTextFromContent(content: Message["content"]): string {
  if (typeof content === "string") return content
  return content
    .map((block) => (block.type === "text" && block.text ? block.text : ""))
    .filter(Boolean)
    .join("\n")
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function MessageBubble({
  message,
  isStreaming,
  toolResults,
  pendingApproval,
  onApprovalDecision,
  onApproveAlways
}: MessageBubbleProps): React.JSX.Element | null {
  const { t } = useLanguage()
  const isUser = message.role === "user"
  const isTool = message.role === "tool"
  const ttsText = extractTextFromContent(message.content).trim()
  const canPlayAudio = !isUser && !isTool && Boolean(ttsText)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isTtsBusy, setIsTtsBusy] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setIsPlaying(false)
  }, [])

  const handleTogglePlayback = useCallback(async () => {
    if (isPlaying) {
      stopPlayback()
      return
    }
    if (!ttsText) return

    setIsTtsBusy(true)
    try {
      const result = await window.api.speech.tts({ text: ttsText })
      const bytes = base64ToUint8Array(result.audioBase64)
      const blob = new Blob([bytes], { type: result.mimeType || "audio/mpeg" })
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url
      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = stopPlayback
      audio.onerror = () => {
        console.error(t("chat.voice_play_failed"))
        stopPlayback()
      }

      setIsPlaying(true)
      await audio.play()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`${t("chat.voice_play_failed")}: ${message}`)
      stopPlayback()
    } finally {
      setIsTtsBusy(false)
    }
  }, [isPlaying, stopPlayback, t, ttsText])

  useEffect(() => {
    return () => {
      stopPlayback()
    }
  }, [stopPlayback])

  // Hide tool result messages - they're shown inline with tool calls
  if (isTool) {
    return null
  }

  const getIcon = (): React.JSX.Element => {
    if (isUser) return <User className="size-4" />
    return <Bot className="size-4" />
  }

  const getLabel = (): string => {
    if (isUser) return "YOU"
    return "AGENT"
  }

  const renderContent = (): React.ReactNode => {
    if (typeof message.content === "string") {
      // Empty content
      if (!message.content.trim()) {
        return null
      }

      // Use streaming markdown for assistant messages, plain text for user messages
      if (isUser) {
        return <div className="whitespace-pre-wrap text-sm">{message.content}</div>
      }
      return <StreamingMarkdown isStreaming={isStreaming}>{message.content}</StreamingMarkdown>
    }

    // Handle content blocks
    const renderedBlocks = message.content
      .map((block, index) => {
        if (block.type === "text" && block.text) {
          // Use streaming markdown for assistant text blocks
          if (isUser) {
            return (
              <div key={index} className="whitespace-pre-wrap text-sm">
                {block.text}
              </div>
            )
          }
          return (
            <StreamingMarkdown key={index} isStreaming={isStreaming}>
              {block.text}
            </StreamingMarkdown>
          )
        }
        if (block.type === "image_url" && block.image_url?.url) {
          return (
            <div key={index} className="mt-2">
              <img
                src={block.image_url.url}
                alt="attachment"
                className="max-h-64 rounded-md border border-border object-contain"
              />
            </div>
          )
        }
        return null
      })
      .filter(Boolean)

    return renderedBlocks.length > 0 ? renderedBlocks : null
  }

  const content = renderContent()
  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0

  // Don't render if there's no content and no tool calls
  if (!content && !hasToolCalls) {
    return null
  }

  return (
    <div className="flex gap-3 overflow-hidden">
      {/* Left avatar column - shows for agent/tool */}
      <div className="w-8 shrink-0">
        {!isUser && (
          <div className="flex size-8 items-center justify-center rounded-sm bg-status-info/10 text-status-info">
            {getIcon()}
          </div>
        )}
      </div>

      {/* Content column - always same width */}
      <div className="flex-1 min-w-0 space-y-2 overflow-hidden">
        <div className={cn("text-section-header", isUser && "text-right")}>{getLabel()}</div>

        {content && (
          <div
            className={cn(
              "rounded-sm p-3 overflow-hidden relative",
              isUser ? "bg-primary/10" : "bg-card",
              canPlayAudio && "pr-10"
            )}
          >
            {canPlayAudio && (
              <button
                type="button"
                onClick={handleTogglePlayback}
                disabled={isTtsBusy}
                title={isPlaying ? t("chat.voice_stop_playback") : t("chat.voice_play")}
                aria-label={isPlaying ? t("chat.voice_stop_playback") : t("chat.voice_play")}
                className={cn(
                  "absolute top-2 right-2 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors",
                  isTtsBusy && "opacity-60 cursor-not-allowed"
                )}
              >
                {isTtsBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : isPlaying ? (
                  <Square className="size-3.5 fill-current" />
                ) : (
                  <Volume2 className="size-3.5" />
                )}
              </button>
            )}
            {content}
          </div>
        )}

        {/* Tool calls */}
        {hasToolCalls && (
          <div className="space-y-2 overflow-hidden">
            {message.tool_calls!.map((toolCall, index) => {
              const result = toolResults?.get(toolCall.id)
              const pendingId = pendingApproval?.tool_call?.id
              const needsApproval = Boolean(pendingId && pendingId === toolCall.id)
              return (
                <ToolCallRenderer
                  key={`${toolCall.id || `tc-${index}`}-${needsApproval ? "pending" : "done"}`}
                  toolCall={toolCall}
                  result={result?.content}
                  isError={result?.is_error}
                  needsApproval={needsApproval}
                  onApprovalDecision={needsApproval ? onApprovalDecision : undefined}
                  onApproveAlways={needsApproval ? onApproveAlways : undefined}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Right avatar column - shows for user */}
      <div className="w-8 shrink-0">
        {isUser && (
          <div className="flex size-8 items-center justify-center rounded-sm bg-primary/10 text-primary">
            {getIcon()}
          </div>
        )}
      </div>
    </div>
  )
}

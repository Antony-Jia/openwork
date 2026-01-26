import { useState } from "react"
import { Plus, MessageSquare, Trash2, Pencil, Loader2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAppStore } from "@/lib/store"
import { useThreadStream } from "@/lib/thread-context"
import { cn, formatRelativeTime, truncate } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import { useLanguage } from "@/lib/i18n"
import type { Thread, ThreadMode } from "@/types"

// Thread loading indicator that subscribes to the stream context
function ThreadLoadingIcon({ threadId }: { threadId: string }): React.JSX.Element {
  const { isLoading } = useThreadStream(threadId)

  if (isLoading) {
    return <Loader2 className="size-4 shrink-0 text-status-info animate-spin" />
  }
  return <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
}

// Individual thread list item component
function ThreadListItem({
  thread,
  isSelected,
  isEditing,
  editingTitle,
  onSelect,
  onDelete,
  onStartEditing,
  onSaveTitle,
  onCancelEditing,
  onEditingTitleChange
}: {
  thread: Thread
  isSelected: boolean
  isEditing: boolean
  editingTitle: string
  onSelect: () => void
  onDelete: () => void
  onStartEditing: () => void
  onSaveTitle: () => void
  onCancelEditing: () => void
  onEditingTitleChange: (value: string) => void
}): React.JSX.Element {
  const { t } = useLanguage()
  const mode = (thread.metadata?.mode as ThreadMode) || "default"
  const modeAccent =
    mode === "ralph"
      ? "border-l-2 border-emerald-400/60"
      : mode === "email"
        ? "border-l-2 border-amber-400/60"
        : "border-l-2 border-transparent"
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group relative flex items-center gap-2 rounded-md px-2.5 py-2 cursor-pointer transition-all duration-200 overflow-hidden mx-2",
            modeAccent,
            isSelected
              ? "bg-sidebar-accent text-foreground shadow-sm ring-1 ring-border/50"
              : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
          )}
          onClick={() => {
            if (!isEditing) {
              onSelect()
            }
          }}
        >
          <ThreadLoadingIcon threadId={thread.thread_id} />
          <div className="flex-1 min-w-0 overflow-hidden">
            {isEditing ? (
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => onEditingTitleChange(e.target.value)}
                onBlur={onSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSaveTitle()
                  if (e.key === "Escape") onCancelEditing()
                }}
                className="w-full bg-background border border-border rounded px-1 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <div className="text-sm truncate block">
                  {thread.title || truncate(thread.thread_id, 20)}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {formatRelativeTime(thread.updated_at)}
                </div>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="opacity-0 group-hover:opacity-100 shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onStartEditing}>
          <Pencil className="size-4 mr-2" />
          {t("sidebar.rename")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-4 mr-2" />
          {t("sidebar.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function ThreadSidebar(): React.JSX.Element {
  const { threads, currentThreadId, createThread, selectThread, deleteThread, updateThread } =
    useAppStore()
  const { t } = useLanguage()

  const [editingThreadId, setEditingThreadId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [newThreadOpen, setNewThreadOpen] = useState(false)

  const startEditing = (threadId: string, currentTitle: string): void => {
    setEditingThreadId(threadId)
    setEditingTitle(currentTitle || "")
  }

  const saveTitle = async (): Promise<void> => {
    if (editingThreadId && editingTitle.trim()) {
      await updateThread(editingThreadId, { title: editingTitle.trim() })
    }
    setEditingThreadId(null)
    setEditingTitle("")
  }

  const cancelEditing = (): void => {
    setEditingThreadId(null)
    setEditingTitle("")
  }

  const handleNewThread = async (mode: ThreadMode): Promise<void> => {
    const metadata: Record<string, unknown> = {
      title: `Thread ${new Date().toLocaleDateString()}`,
      mode
    }
    if (mode === "ralph") {
      metadata.ralph = { phase: "init", iterations: 0 }
    }
    await createThread(metadata)
    setNewThreadOpen(false)
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-sidebar overflow-hidden">
      {/* New Thread Button - with dynamic safe area padding when zoomed out */}
      <div className="p-2" style={{ paddingTop: "calc(8px + var(--sidebar-safe-padding, 0px))" }}>
        <Popover open={newThreadOpen} onOpenChange={setNewThreadOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
              <Plus className="size-4" />
              {t("sidebar.new_thread")}
              <ChevronDown className="size-3 ml-auto text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[260px] p-2 space-y-1">
            <button
              type="button"
              onClick={() => handleNewThread("default")}
              className="w-full rounded-md px-2 py-2 text-left text-xs hover:bg-accent transition-colors"
            >
              <div className="font-medium">{t("sidebar.new_thread.default")}</div>
              <div className="text-[10px] text-muted-foreground">
                {t("sidebar.new_thread.default_desc")}
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleNewThread("ralph")}
              className="w-full rounded-md px-2 py-2 text-left text-xs hover:bg-accent transition-colors"
            >
              <div className="font-medium">{t("sidebar.new_thread.ralph")}</div>
              <div className="text-[10px] text-muted-foreground">
                {t("sidebar.new_thread.ralph_desc")}
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleNewThread("email")}
              className="w-full rounded-md px-2 py-2 text-left text-xs hover:bg-accent transition-colors"
            >
              <div className="font-medium">{t("sidebar.new_thread.email")}</div>
              <div className="text-[10px] text-muted-foreground">
                {t("sidebar.new_thread.email_desc")}
              </div>
            </button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Thread List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1 overflow-hidden">
          {threads.map((thread) => (
            <ThreadListItem
              key={thread.thread_id}
              thread={thread}
              isSelected={currentThreadId === thread.thread_id}
              isEditing={editingThreadId === thread.thread_id}
              editingTitle={editingTitle}
              onSelect={() => selectThread(thread.thread_id)}
              onDelete={() => deleteThread(thread.thread_id)}
              onStartEditing={() => startEditing(thread.thread_id, thread.title || "")}
              onSaveTitle={saveTitle}
              onCancelEditing={cancelEditing}
              onEditingTitleChange={setEditingTitle}
            />
          ))}

          {threads.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t("sidebar.no_threads")}
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}

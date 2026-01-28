import { useState, useEffect, useCallback } from "react"
import { ChevronDown, ChevronRight, RefreshCw, FileText, ListChecks } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/lib/i18n"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { RalphState, ThreadMode } from "@/types"

interface RalphPlan {
  project?: string
  branchName?: string
  description?: string
  userStories?: Array<{
    id: string
    title: string
    description?: string
    acceptanceCriteria?: string[]
    priority?: number
    passes?: boolean
    notes?: string
  }>
}

interface ProgressSection {
  title: string
  content: string[]
}

function parseProgress(content: string): ProgressSection[] {
  const sections: ProgressSection[] = []
  const lines = content.split("\n")
  let currentSection: ProgressSection | null = null

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentSection) {
        sections.push(currentSection)
      }
      currentSection = { title: line.slice(3).trim(), content: [] }
    } else if (currentSection && line.trim() && line !== "---") {
      currentSection.content.push(line)
    }
  }

  if (currentSection) {
    sections.push(currentSection)
  }

  return sections.reverse() // Show newest first
}

export function RalphProgress(): React.JSX.Element | null {
  const { t } = useLanguage()
  const { threads, currentThreadId } = useAppStore()

  const [expanded, setExpanded] = useState(true)
  const [planExpanded, setPlanExpanded] = useState(true)
  const [progressExpanded, setProgressExpanded] = useState(true)
  const [plan, setPlan] = useState<RalphPlan | null>(null)
  const [progress, setProgress] = useState<ProgressSection[]>([])
  const [loading, setLoading] = useState(false)

  const currentThread = threads.find((t) => t.thread_id === currentThreadId)
  const mode = (currentThread?.metadata?.mode as ThreadMode) || "default"
  const ralph = (currentThread?.metadata?.ralph as RalphState) || null

  const loadRalphData = useCallback(async () => {
    if (!currentThreadId || mode !== "ralph") return

    setLoading(true)
    try {
      // Load ralph_plan.json
      const planResult = await window.api.workspace.readFile(currentThreadId, "ralph_plan.json")
      if (planResult.success && planResult.content) {
        try {
          setPlan(JSON.parse(planResult.content) as RalphPlan)
        } catch {
          setPlan(null)
        }
      } else {
        setPlan(null)
      }

      // Load progress.txt
      const progressResult = await window.api.workspace.readFile(currentThreadId, "progress.txt")
      if (progressResult.success && progressResult.content) {
        setProgress(parseProgress(progressResult.content))
      } else {
        setProgress([])
      }
    } catch (error) {
      console.error("[RalphProgress] Failed to load data:", error)
    } finally {
      setLoading(false)
    }
  }, [currentThreadId, mode])

  useEffect(() => {
    loadRalphData()
  }, [loadRalphData])

  // Don't render if not in ralph mode
  if (mode !== "ralph") {
    return null
  }

  const phaseLabel = ralph?.phase
    ? {
        init: t("ralph.phase.init"),
        awaiting_confirm: t("ralph.phase.awaiting_confirm"),
        running: t("ralph.phase.running"),
        done: t("ralph.phase.done")
      }[ralph.phase] || ralph.phase
    : "-"

  return (
    <div className="border-t border-border bg-sidebar">
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-sidebar-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span className="uppercase">{t("ralph.progress.title")}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto size-5"
          onClick={(e) => {
            e.stopPropagation()
            loadRalphData()
          }}
          disabled={loading}
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
        </Button>
      </button>

      {expanded && (
        <div className="px-2 pb-2">
          {/* Iteration & Phase Info */}
          <div className="rounded-md bg-emerald-50/50 dark:bg-emerald-950/30 p-2 mb-2 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("ralph.progress.iteration")}</span>
              <span className="font-medium">{ralph?.iterations ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("ralph.progress.phase")}</span>
              <span className="font-medium">{phaseLabel}</span>
            </div>
          </div>

          <ScrollArea className="max-h-[300px]">
            {/* Plan Section */}
            {plan && (
              <div className="mb-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setPlanExpanded(!planExpanded)}
                >
                  {planExpanded ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronRight className="size-3" />
                  )}
                  <ListChecks className="size-3" />
                  <span>ralph_plan.json</span>
                </button>

                {planExpanded && (
                  <div className="ml-4 mt-1 space-y-1.5 text-xs">
                    {plan.project && (
                      <div>
                        <span className="text-muted-foreground">{t("ralph.plan.project")}: </span>
                        <span className="font-medium">{plan.project}</span>
                      </div>
                    )}
                    {plan.description && (
                      <div className="text-muted-foreground text-[10px]">{plan.description}</div>
                    )}
                    {plan.userStories && plan.userStories.length > 0 && (
                      <div className="space-y-1 mt-2">
                        <div className="text-muted-foreground font-medium">
                          {t("ralph.plan.stories")} ({plan.userStories.length})
                        </div>
                        {plan.userStories.map((story) => (
                          <div
                            key={story.id}
                            className={cn(
                              "rounded px-1.5 py-1 border-l-2",
                              story.passes
                                ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30"
                                : "border-muted bg-muted/30"
                            )}
                          >
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">{story.id}</span>
                              <span className="truncate">{story.title}</span>
                              {story.passes && (
                                <span className="ml-auto text-emerald-600 dark:text-emerald-400">
                                  ✓
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Progress Section */}
            {progress.length > 0 && (
              <div>
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setProgressExpanded(!progressExpanded)}
                >
                  {progressExpanded ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronRight className="size-3" />
                  )}
                  <FileText className="size-3" />
                  <span>progress.txt</span>
                  <span className="ml-1 text-[10px]">({progress.length})</span>
                </button>

                {progressExpanded && (
                  <div className="ml-4 mt-1 space-y-2 text-xs">
                    {progress.slice(0, 5).map((section, idx) => (
                      <div key={idx} className="rounded bg-muted/30 p-1.5">
                        <div className="font-medium text-[10px] text-muted-foreground truncate">
                          {section.title}
                        </div>
                        <div className="mt-0.5 text-[10px] line-clamp-3">
                          {section.content.slice(0, 3).map((line, lineIdx) => (
                            <div key={lineIdx} className="truncate">
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {progress.length > 5 && (
                      <div className="text-[10px] text-muted-foreground text-center">
                        +{progress.length - 5} {t("ralph.progress.more")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!plan && progress.length === 0 && !loading && (
              <div className="text-xs text-muted-foreground text-center py-2">
                {t("ralph.progress.empty")}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

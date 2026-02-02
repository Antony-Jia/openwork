import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useLanguage } from "@/lib/i18n"
import type { LoopConfig } from "@/types"
import { LoopConfigDialog } from "./LoopConfigDialog"

interface LoopStatus {
  running: boolean
  queueLength: number
}

export function LoopPanel({ threadId }: { threadId: string }): React.JSX.Element | null {
  const { t } = useLanguage()
  const [config, setConfig] = useState<LoopConfig | null>(null)
  const [status, setStatus] = useState<LoopStatus>({ running: false, queueLength: 0 })
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    const [cfg, st] = await Promise.all([
      window.api.loop.getConfig(threadId),
      window.api.loop.status(threadId)
    ])
    setConfig(cfg)
    setStatus(st)
    setLoading(false)
  }, [threadId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const cleanup = window.electron.ipcRenderer.on("threads:changed", () => {
      void load()
    })
    return () => {
      if (typeof cleanup === "function") cleanup()
    }
  }, [load])

  if (loading || !config) {
    return null
  }

  const handleStart = async (): Promise<void> => {
    try {
      await window.api.loop.start(threadId)
      await load()
    } catch (error) {
      console.error("[LoopPanel] Failed to start loop:", error)
    }
  }

  const handleStop = async (): Promise<void> => {
    try {
      await window.api.loop.stop(threadId)
      await load()
    } catch (error) {
      console.error("[LoopPanel] Failed to stop loop:", error)
    }
  }

  const statusLabel = config.enabled ? t("loop.status.running") : t("loop.status.paused")

  return (
    <div className="rounded-md border border-border bg-card/80 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {t("loop.panel_title")}
          </div>
          <Badge variant="outline">{statusLabel}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {config.enabled ? (
            <Button size="sm" variant="ghost" onClick={handleStop}>
              {t("loop.stop")}
            </Button>
          ) : (
            <Button size="sm" onClick={handleStart}>
              {t("loop.start")}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            {t("loop.edit")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
        <div>
          <div className="uppercase tracking-[0.15em] text-[10px]">{t("loop.trigger")}</div>
          <div className="text-sm text-foreground">{config.trigger.type}</div>
        </div>
        <div>
          <div className="uppercase tracking-[0.15em] text-[10px]">{t("loop.queue")}</div>
          <div className="text-sm text-foreground">{status.queueLength}</div>
        </div>
        <div>
          <div className="uppercase tracking-[0.15em] text-[10px]">{t("loop.last_run")}</div>
          <div className="text-sm text-foreground">
            {config.lastRunAt ? new Date(config.lastRunAt).toLocaleString() : "-"}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-[0.15em] text-[10px]">{t("loop.next_run")}</div>
          <div className="text-sm text-foreground">
            {config.nextRunAt ? new Date(config.nextRunAt).toLocaleString() : "-"}
          </div>
        </div>
      </div>

      {config.lastError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {config.lastError}
        </div>
      )}

      <LoopConfigDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        threadId={threadId}
        initialConfig={config}
      />
    </div>
  )
}

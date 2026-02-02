import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/lib/i18n"
import { useAppStore } from "@/lib/store"
import type { LoopConfig, LoopConditionOp, LoopTriggerType } from "@/types"

const DEFAULT_QUEUE_WINDOW_SEC = 300
const DEFAULT_PREVIEW_LINES = 200
const DEFAULT_PREVIEW_BYTES = 8192

const inputClass =
  "h-9 w-full rounded-sm border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
const textareaClass =
  "w-full rounded-sm border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

const defaultConfig: LoopConfig = {
  enabled: false,
  contentTemplate: "",
  trigger: { type: "schedule", cron: "*/5 * * * *" },
  queue: { policy: "strict", mergeWindowSec: DEFAULT_QUEUE_WINDOW_SEC }
}

function normalizeSuffixes(raw: string): string[] | undefined {
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith(".") ? p : `.${p}`))
  return parts.length > 0 ? parts : undefined
}

function parseJsonObject(text: string): Record<string, string> | Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON must be an object")
  }
  return parsed as Record<string, unknown>
}

interface LoopConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  threadId?: string
  initialConfig?: LoopConfig | null
  initialTitle?: string
}

export function LoopConfigDialog({
  open,
  onOpenChange,
  mode,
  threadId,
  initialConfig,
  initialTitle
}: LoopConfigDialogProps): React.JSX.Element {
  const { t } = useLanguage()
  const { createThread } = useAppStore()

  const config = initialConfig ?? defaultConfig
  const initialTriggerType = (config.trigger?.type || "schedule") as LoopTriggerType

  const [title, setTitle] = useState(initialTitle || "")
  const [triggerType, setTriggerType] = useState<LoopTriggerType>(initialTriggerType)
  const [contentTemplate, setContentTemplate] = useState(config.contentTemplate || "")

  const [cron, setCron] = useState(
    config.trigger.type === "schedule" || config.trigger.type === "api"
      ? config.trigger.cron
      : "*/5 * * * *"
  )

  const [apiUrl, setApiUrl] = useState(
    config.trigger.type === "api" ? config.trigger.url : ""
  )
  const [apiMethod, setApiMethod] = useState<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">(
    config.trigger.type === "api" ? config.trigger.method : "GET"
  )
  const [apiHeaders, setApiHeaders] = useState(
    config.trigger.type === "api" && config.trigger.headers
      ? JSON.stringify(config.trigger.headers, null, 2)
      : ""
  )
  const [apiBody, setApiBody] = useState(
    config.trigger.type === "api" && config.trigger.bodyJson
      ? JSON.stringify(config.trigger.bodyJson, null, 2)
      : ""
  )
  const [apiJsonPath, setApiJsonPath] = useState(
    config.trigger.type === "api" ? config.trigger.jsonPath : "$"
  )
  const [apiOp, setApiOp] = useState<LoopConditionOp>(
    config.trigger.type === "api" ? config.trigger.op : "truthy"
  )
  const [apiExpected, setApiExpected] = useState(
    config.trigger.type === "api" ? config.trigger.expected || "" : ""
  )

  const [watchPath, setWatchPath] = useState(
    config.trigger.type === "file" ? config.trigger.watchPath : ""
  )
  const [suffixes, setSuffixes] = useState(
    config.trigger.type === "file" && config.trigger.suffixes
      ? config.trigger.suffixes.join(",")
      : ""
  )
  const [previewLines, setPreviewLines] = useState(
    config.trigger.type === "file" ? String(config.trigger.previewMaxLines) : String(DEFAULT_PREVIEW_LINES)
  )

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(initialTitle || "")
    setTriggerType(initialTriggerType)
    setContentTemplate(config.contentTemplate || "")
    setCron(
      config.trigger.type === "schedule" || config.trigger.type === "api"
        ? config.trigger.cron
        : "*/5 * * * *"
    )
    setApiUrl(config.trigger.type === "api" ? config.trigger.url : "")
    setApiMethod(config.trigger.type === "api" ? config.trigger.method : "GET")
    setApiHeaders(
      config.trigger.type === "api" && config.trigger.headers
        ? JSON.stringify(config.trigger.headers, null, 2)
        : ""
    )
    setApiBody(
      config.trigger.type === "api" && config.trigger.bodyJson
        ? JSON.stringify(config.trigger.bodyJson, null, 2)
        : ""
    )
    setApiJsonPath(config.trigger.type === "api" ? config.trigger.jsonPath : "$")
    setApiOp(config.trigger.type === "api" ? config.trigger.op : "truthy")
    setApiExpected(config.trigger.type === "api" ? config.trigger.expected || "" : "")
    setWatchPath(config.trigger.type === "file" ? config.trigger.watchPath : "")
    setSuffixes(
      config.trigger.type === "file" && config.trigger.suffixes
        ? config.trigger.suffixes.join(",")
        : ""
    )
    setPreviewLines(
      config.trigger.type === "file" ? String(config.trigger.previewMaxLines) : String(DEFAULT_PREVIEW_LINES)
    )
    setError(null)
  }, [open, initialTitle, initialTriggerType, config])

  const canSave = useMemo(() => {
    if (!contentTemplate.trim()) return false
    if (triggerType === "schedule") return Boolean(cron.trim())
    if (triggerType === "api") return Boolean(cron.trim() && apiUrl.trim() && apiJsonPath.trim())
    if (triggerType === "file") return Boolean(watchPath.trim())
    return false
  }, [contentTemplate, triggerType, cron, apiUrl, apiJsonPath, watchPath])

  const handleSave = async (): Promise<void> => {
    setError(null)
    try {
      const queue: LoopConfig["queue"] = {
        policy: "strict",
        mergeWindowSec: DEFAULT_QUEUE_WINDOW_SEC
      }
      let nextTrigger: LoopConfig["trigger"]

      if (triggerType === "schedule") {
        nextTrigger = { type: "schedule", cron: cron.trim() }
      } else if (triggerType === "api") {
        const headers = parseJsonObject(apiHeaders)
        const body = parseJsonObject(apiBody)
        nextTrigger = {
          type: "api",
          cron: cron.trim(),
          url: apiUrl.trim(),
          method: apiMethod as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
          headers: headers ? (headers as Record<string, string>) : undefined,
          bodyJson: body ? (body as Record<string, unknown>) : null,
          jsonPath: apiJsonPath.trim(),
          op: apiOp,
          expected: apiExpected.trim() || undefined
        }
      } else {
        nextTrigger = {
          type: "file",
          watchPath: watchPath.trim(),
          suffixes: normalizeSuffixes(suffixes),
          previewMaxLines: Number.parseInt(previewLines, 10) || DEFAULT_PREVIEW_LINES,
          previewMaxBytes: DEFAULT_PREVIEW_BYTES
        }
      }

      const nextConfig: LoopConfig = {
        ...config,
        enabled: config.enabled ?? false,
        contentTemplate: contentTemplate.trim(),
        trigger: nextTrigger,
        queue
      }

      if (mode === "create") {
        await createThread({
          title: title.trim() || undefined,
          mode: "loop",
          loop: nextConfig
        })
      } else if (threadId) {
        await window.api.loop.updateConfig(threadId, nextConfig)
      }

      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save loop configuration."
      setError(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[640px] max-w-[90vw] max-h-[85vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
            {mode === "create" ? t("loop.create") : t("loop.edit")}
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6 pt-4 space-y-4 overflow-y-auto max-h-[70vh]">
          {mode === "create" && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{t("loop.title")}</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("loop.title_placeholder")}
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">{t("loop.content")}</label>
            <textarea
              className={textareaClass}
              rows={4}
              value={contentTemplate}
              onChange={(e) => setContentTemplate(e.target.value)}
              placeholder={t("loop.content_placeholder")}
            />
            <div className="text-[11px] text-muted-foreground">{t("loop.content_hint")}</div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">{t("loop.trigger")}</label>
            <select
              className={inputClass}
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as LoopTriggerType)}
            >
              <option value="schedule">{t("loop.trigger.schedule")}</option>
              <option value="api">{t("loop.trigger.api")}</option>
              <option value="file">{t("loop.trigger.file")}</option>
            </select>
          </div>

          {(triggerType === "schedule" || triggerType === "api") && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{t("loop.cron")}</label>
              <Input value={cron} onChange={(e) => setCron(e.target.value)} />
            </div>
          )}

          {triggerType === "api" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t("loop.api.url")}</label>
                <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t("loop.api.method")}</label>
                <select
                  className={inputClass}
                  value={apiMethod}
                  onChange={(e) =>
                    setApiMethod(e.target.value as "GET" | "POST" | "PUT" | "PATCH" | "DELETE")
                  }
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t("loop.api.headers")}</label>
                <textarea
                  className={textareaClass}
                  rows={3}
                  value={apiHeaders}
                  onChange={(e) => setApiHeaders(e.target.value)}
                  placeholder='{"Authorization": "Bearer ..."}'
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t("loop.api.body")}</label>
                <textarea
                  className={textareaClass}
                  rows={3}
                  value={apiBody}
                  onChange={(e) => setApiBody(e.target.value)}
                  placeholder='{"query": "status"}'
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t("loop.api.json_path")}</label>
                <Input value={apiJsonPath} onChange={(e) => setApiJsonPath(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t("loop.api.operator")}</label>
                <select
                  className={inputClass}
                  value={apiOp}
                  onChange={(e) => setApiOp(e.target.value as LoopConditionOp)}
                >
                  <option value="truthy">truthy</option>
                  <option value="equals">equals</option>
                  <option value="contains">contains</option>
                </select>
              </div>
              {(apiOp === "equals" || apiOp === "contains") && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">{t("loop.api.expected")}</label>
                  <Input value={apiExpected} onChange={(e) => setApiExpected(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {triggerType === "file" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t("loop.file.watch_path")}</label>
                <Input value={watchPath} onChange={(e) => setWatchPath(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t("loop.file.suffixes")}</label>
                <Input value={suffixes} onChange={(e) => setSuffixes(e.target.value)} placeholder=".md,.txt" />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t("loop.file.preview_lines")}</label>
                <Input
                  type="number"
                  value={previewLines}
                  onChange={(e) => setPreviewLines(e.target.value)}
                />
              </div>
            </div>
          )}

          {error && <div className="text-xs text-destructive">{error}</div>}
        </div>
        <DialogFooter className="px-6 pb-6 pt-2 flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {t("loop.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

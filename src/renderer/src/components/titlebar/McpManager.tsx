import { useCallback, useEffect, useMemo, useState } from "react"
import { Server, Plus, Pencil, Trash2, Play, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/lib/i18n"
import type { McpServerListItem, McpServerMode } from "@/types"

interface McpFormState {
  name: string
  mode: McpServerMode
  command: string
  argsText: string
  envText: string
  cwd: string
  url: string
  headersText: string
  autoStart: boolean
}

const emptyForm: McpFormState = {
  name: "",
  mode: "local",
  command: "",
  argsText: "",
  envText: "",
  cwd: "",
  url: "",
  headersText: "",
  autoStart: false
}

function serializeKeyValue(record?: Record<string, string>): string {
  if (!record) return ""
  return Object.entries(record)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
}

function parseKeyValue(text: string): Record<string, string> | undefined {
  const entries = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf("=")
      if (idx <= 0) return null
      const key = line.slice(0, idx).trim()
      const value = line.slice(idx + 1).trim()
      return key ? [key, value] : null
    })
    .filter((entry): entry is [string, string] => !!entry)

  if (entries.length === 0) {
    return undefined
  }
  return Object.fromEntries(entries)
}

function parseArgs(text: string): string[] | undefined {
  const args = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  return args.length ? args : undefined
}

export function McpManager(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [servers, setServers] = useState<McpServerListItem[]>([])
  const [mode, setMode] = useState<"list" | "create" | "edit">("list")
  const [form, setForm] = useState<McpFormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { t } = useLanguage()

  const loadServers = useCallback(async () => {
    const items = await window.api.mcp.list()
    setServers(items)
  }, [])

  useEffect(() => {
    if (!open) return
    loadServers()
  }, [open, loadServers])

  const resetForm = (): void => {
    setForm(emptyForm)
    setEditingId(null)
    setError(null)
    setMode("list")
  }

  const startCreate = (): void => {
    setForm(emptyForm)
    setEditingId(null)
    setError(null)
    setMode("create")
  }

  const startEdit = (item: McpServerListItem): void => {
    const config = item.config
    setForm({
      name: config.name,
      mode: config.mode,
      command: config.command ?? "",
      argsText: (config.args ?? []).join("\n"),
      envText: serializeKeyValue(config.env),
      cwd: config.cwd ?? "",
      url: config.url ?? "",
      headersText: serializeKeyValue(config.headers),
      autoStart: !!config.autoStart
    })
    setEditingId(config.id)
    setError(null)
    setMode("edit")
  }

  const handleSave = async (): Promise<void> => {
    try {
      setError(null)
      const payload = {
        name: form.name,
        mode: form.mode,
        command: form.mode === "local" ? form.command : undefined,
        args: form.mode === "local" ? parseArgs(form.argsText) : undefined,
        env: form.mode === "local" ? parseKeyValue(form.envText) : undefined,
        cwd: form.mode === "local" ? form.cwd.trim() || undefined : undefined,
        url: form.mode === "remote" ? form.url.trim() : undefined,
        headers: form.mode === "remote" ? parseKeyValue(form.headersText) : undefined,
        autoStart: form.autoStart
      }

      let targetId = editingId
      if (mode === "create") {
        const created = await window.api.mcp.create(payload)
        targetId = created.id
        if (payload.autoStart && targetId) {
          await window.api.mcp.start(targetId)
        }
      } else if (mode === "edit" && editingId) {
        await window.api.mcp.update({ id: editingId, updates: payload })
      }

      await loadServers()
      resetForm()
    } catch (e) {
      const message = e instanceof Error ? e.message : t("mcp.save_failed")
      setError(message)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    const confirmed = window.confirm(t("mcp.delete_confirm"))
    if (!confirmed) return
    await window.api.mcp.delete(id)
    await loadServers()
  }

  const handleToggleEnabled = async (id: string, enabled: boolean): Promise<void> => {
    await window.api.mcp.update({ id, updates: { enabled } })
    await loadServers()
  }

  const handleStart = async (id: string): Promise<void> => {
    setBusyId(id)
    try {
      await window.api.mcp.start(id)
      await loadServers()
    } catch (e) {
      const message = e instanceof Error ? e.message : t("mcp.start_failed")
      setError(message)
    } finally {
      setBusyId(null)
    }
  }

  const handleStop = async (id: string): Promise<void> => {
    setBusyId(id)
    try {
      await window.api.mcp.stop(id)
      await loadServers()
    } catch (e) {
      const message = e instanceof Error ? e.message : t("mcp.stop_failed")
      setError(message)
    } finally {
      setBusyId(null)
    }
  }

  const modeOptions = useMemo(
    () => [
      { value: "local", label: t("mcp.mode_local") },
      { value: "remote", label: t("mcp.mode_remote") }
    ],
    [t]
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn(
          "h-7 w-7 rounded-md border border-transparent",
          open
            ? "bg-background/70 text-foreground border-border/80"
            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
        )}
        title={t("titlebar.mcp")}
        aria-label={t("titlebar.mcp")}
        onClick={() => setOpen(true)}
      >
        <Server className="size-4" />
      </Button>

      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
            {t("mcp.title")}
          </DialogTitle>
        </DialogHeader>

        {mode === "list" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t("mcp.hint")}</span>
              <Button size="sm" onClick={startCreate}>
                <Plus className="size-3.5" />
                {t("mcp.add")}
              </Button>
            </div>

            {servers.length === 0 ? (
              <div className="rounded-sm border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {t("mcp.empty")}
              </div>
            ) : (
              <div className="space-y-2">
                {servers.map((item) => (
                  <div
                    key={item.config.id}
                    className="flex items-start justify-between gap-3 rounded-sm border border-border p-3"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{item.config.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.config.mode === "local"
                          ? t("mcp.mode_local")
                          : t("mcp.mode_remote")}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {t("mcp.tools_count")}: {item.status.toolsCount}
                      </div>
                      {item.config.enabled === false && (
                        <div className="text-[10px] text-muted-foreground">
                          {t("mcp.disabled_hint")}
                        </div>
                      )}
                      {item.status.lastError && (
                        <div className="text-[10px] text-status-critical">
                          {item.status.lastError}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleEnabled(item.config.id, !(item.config.enabled ?? true))
                          }
                          className={cn(
                            "text-[10px] uppercase tracking-[0.2em] transition-colors",
                            item.config.enabled !== false
                              ? "text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {item.config.enabled !== false
                            ? t("tools.enabled")
                            : t("tools.disabled")}
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(item)}
                        >
                          <Pencil className="size-3.5" />
                          {t("mcp.edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(item.config.id)}
                        >
                          <Trash2 className="size-3.5" />
                          {t("mcp.delete")}
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant={item.status.running ? "secondary" : "default"}
                        onClick={() =>
                          item.status.running
                            ? handleStop(item.config.id)
                            : handleStart(item.config.id)
                        }
                        disabled={busyId === item.config.id}
                      >
                        {item.status.running ? (
                          <>
                            <Square className="size-3.5" />
                            {t("mcp.stop")}
                          </>
                        ) : (
                          <>
                            <Play className="size-3.5" />
                            {t("mcp.start")}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && <div className="text-xs text-status-critical">{error}</div>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{t("mcp.name")}</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t("mcp.name_placeholder")}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{t("mcp.mode")}</label>
              <div className="flex gap-2">
                {modeOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={form.mode === option.value ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() =>
                      setForm((prev) => ({ ...prev, mode: option.value as McpServerMode }))
                    }
                    className="h-7 text-xs flex-1"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {form.mode === "local" ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">{t("mcp.command")}</label>
                  <Input
                    value={form.command}
                    onChange={(e) => setForm((prev) => ({ ...prev, command: e.target.value }))}
                    placeholder={t("mcp.command_placeholder")}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">{t("mcp.args")}</label>
                  <textarea
                    value={form.argsText}
                    onChange={(e) => setForm((prev) => ({ ...prev, argsText: e.target.value }))}
                    placeholder={t("mcp.args_placeholder")}
                    className="w-full min-h-[90px] rounded-md border border-border/60 bg-background/60 px-2 py-2 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">{t("mcp.env")}</label>
                  <textarea
                    value={form.envText}
                    onChange={(e) => setForm((prev) => ({ ...prev, envText: e.target.value }))}
                    placeholder={t("mcp.env_placeholder")}
                    className="w-full min-h-[90px] rounded-md border border-border/60 bg-background/60 px-2 py-2 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">{t("mcp.cwd")}</label>
                  <Input
                    value={form.cwd}
                    onChange={(e) => setForm((prev) => ({ ...prev, cwd: e.target.value }))}
                    placeholder={t("mcp.cwd_placeholder")}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">{t("mcp.url")}</label>
                  <Input
                    value={form.url}
                    onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
                    placeholder={t("mcp.url_placeholder")}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">{t("mcp.headers")}</label>
                  <textarea
                    value={form.headersText}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, headersText: e.target.value }))
                    }
                    placeholder={t("mcp.headers_placeholder")}
                    className="w-full min-h-[90px] rounded-md border border-border/60 bg-background/60 px-2 py-2 text-xs"
                  />
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={form.autoStart}
                onChange={(e) => setForm((prev) => ({ ...prev, autoStart: e.target.checked }))}
              />
              {t("mcp.auto_start")}
            </label>

            {error && <div className="text-xs text-status-critical">{error}</div>}

            <DialogFooter>
              <Button variant="ghost" onClick={resetForm}>
                {t("mcp.cancel")}
              </Button>
              <Button onClick={handleSave}>{t("mcp.save")}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

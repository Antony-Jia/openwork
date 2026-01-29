import { useCallback, useEffect, useState } from "react"
import { Eye, EyeOff, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/lib/i18n"
import type { ToolInfo } from "@/types"

export function ToolsManager(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [toggling, setToggling] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const { t } = useLanguage()

  const loadTools = useCallback(async () => {
    try {
      if (!window.api?.tools?.list) {
        setError(t("tools.load_failed"))
        return
      }
      const items = await window.api.tools.list()
      setTools(items)
    } catch (e) {
      const message = e instanceof Error ? e.message : t("tools.load_failed")
      setError(message)
    }
  }, [t])

  useEffect(() => {
    if (!open) return
    loadTools()
  }, [open, loadTools])

  const resetState = (): void => {
    setKeyInputs({})
    setShowKeys({})
    setSaving({})
    setToggling({})
    setError(null)
  }

  const handleOpenChange = (next: boolean): void => {
    if (!next) {
      resetState()
    }
    setOpen(next)
  }

  const handleSave = async (tool: ToolInfo, clear = false): Promise<void> => {
    setError(null)
    setSaving((prev) => ({ ...prev, [tool.name]: true }))

    try {
      if (!window.api?.tools?.setKey) {
        setError(t("tools.save_failed"))
        return
      }
      const raw = clear ? "" : keyInputs[tool.name] || ""
      const trimmed = raw.trim()
      await window.api.tools.setKey({ name: tool.name, key: trimmed ? trimmed : null })
      setKeyInputs((prev) => ({ ...prev, [tool.name]: "" }))
      await loadTools()
    } catch (e) {
      const message = e instanceof Error ? e.message : t("tools.save_failed")
      setError(message)
    } finally {
      setSaving((prev) => ({ ...prev, [tool.name]: false }))
    }
  }

  const handleToggle = async (tool: ToolInfo): Promise<void> => {
    setError(null)
    setToggling((prev) => ({ ...prev, [tool.name]: true }))

    try {
      if (!window.api?.tools?.setEnabled) {
        setError(t("tools.save_failed"))
        return
      }
      await window.api.tools.setEnabled({ name: tool.name, enabled: !tool.enabled })
      await loadTools()
    } catch (e) {
      const message = e instanceof Error ? e.message : t("tools.save_failed")
      setError(message)
    } finally {
      setToggling((prev) => ({ ...prev, [tool.name]: false }))
    }
  }

  const handleKeyChange = (toolName: string, value: string): void => {
    setKeyInputs((prev) => ({ ...prev, [toolName]: value }))
  }

  const toggleShowKey = (toolName: string): void => {
    setShowKeys((prev) => ({ ...prev, [toolName]: !prev[toolName] }))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn(
          "h-7 w-7 rounded-md border border-transparent",
          open
            ? "bg-background/70 text-foreground border-border/80"
            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
        )}
        title={t("titlebar.tools")}
        aria-label={t("titlebar.tools")}
        onClick={() => setOpen(true)}
      >
        <Wrench className="size-4" />
      </Button>

      <DialogContent className="w-[900px] h-[640px] max-w-[90vw] max-h-[85vh] p-0 overflow-hidden">
        <div className="flex h-full flex-col">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
              {t("tools.title")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
            <div className="space-y-4">
              {tools.length === 0 ? (
                <div className="rounded-sm border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {t("tools.empty")}
                </div>
              ) : (
                <div className="space-y-3">
                  {tools.map((tool) => (
                    <div key={tool.name} className="rounded-sm border border-border p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm font-medium">{tool.label}</div>
                          <div className="text-xs text-muted-foreground">{tool.description}</div>
                          {tool.envVar && (
                            <div className="text-[10px] text-muted-foreground">
                              {t("tools.env_var")}: {tool.envVar}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            type="button"
                            disabled={toggling[tool.name]}
                            onClick={() => handleToggle(tool)}
                            className={cn(
                              "text-[10px] uppercase tracking-[0.2em] transition-colors",
                              tool.enabled
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {tool.enabled ? t("tools.enabled") : t("tools.disabled")}
                          </button>
                          <span
                            className={cn(
                              "text-[10px] uppercase tracking-[0.2em]",
                              tool.hasKey ? "text-status-success" : "text-muted-foreground"
                            )}
                          >
                            {tool.hasKey ? t("tools.status_configured") : t("tools.status_missing")}
                          </span>
                        </div>
                      </div>

                      {tool.requiresKey !== false && (
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">
                            {tool.keyLabel || t("tools.key")}
                          </label>
                          <div className="relative">
                            <Input
                              type={showKeys[tool.name] ? "text" : "password"}
                              value={keyInputs[tool.name] ?? ""}
                              onChange={(e) => handleKeyChange(tool.name, e.target.value)}
                              placeholder={t("tools.key_placeholder")}
                              className="pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => toggleShowKey(tool.name)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {showKeys[tool.name] ? (
                                <EyeOff className="size-4" />
                              ) : (
                                <Eye className="size-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {!tool.enabled && (
                        <div className="text-xs text-muted-foreground">
                          {t("tools.disabled_hint")}
                        </div>
                      )}
                      {tool.requiresKey !== false && (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSave(tool, true)}
                            disabled={saving[tool.name]}
                          >
                            {t("tools.clear")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSave(tool)}
                            disabled={saving[tool.name]}
                          >
                            {t("tools.save")}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {error && <div className="text-xs text-status-critical">{error}</div>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

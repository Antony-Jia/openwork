import { useCallback, useState } from "react"
import { Bot, Plus, Pencil, Trash2 } from "lucide-react"
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
import type { MiddlewareDefinition, SubagentConfig, ToolInfo } from "@/types"

interface SubagentFormState {
  name: string
  description: string
  systemPrompt: string
  interruptOn: boolean
  tools: string[]
  middleware: string[]
}

const emptyForm: SubagentFormState = {
  name: "",
  description: "",
  systemPrompt: "",
  interruptOn: false,
  tools: [],
  middleware: []
}

export function SubagentManager(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [subagents, setSubagents] = useState<SubagentConfig[]>([])
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [middleware, setMiddleware] = useState<MiddlewareDefinition[]>([])
  const [mode, setMode] = useState<"list" | "create" | "edit">("list")
  const [form, setForm] = useState<SubagentFormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { t } = useLanguage()

  const loadSubagents = useCallback(async () => {
    const items = await window.api.subagents.list()
    setSubagents(items)
  }, [])

  const loadTools = useCallback(async () => {
    try {
      console.log("[SubagentManager] loadTools calling...")
      const items = await window.api.tools.list()
      console.log("[SubagentManager] loadTools received:", items, "length:", items?.length)
      if (items && Array.isArray(items)) {
        setTools(items)
      } else {
        console.error("[SubagentManager] loadTools received invalid data:", items)
      }
    } catch (e) {
      console.error("[SubagentManager] loadTools error:", e)
    }
  }, [])

  const loadMiddleware = useCallback(async () => {
    const items = await window.api.middleware.list()
    setMiddleware(items)
  }, [])

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

  const startEdit = (agent: SubagentConfig): void => {
    setForm({
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      interruptOn: agent.interruptOn ?? false,
      tools: agent.tools ?? [],
      middleware: agent.middleware ?? []
    })
    setEditingId(agent.id)
    setError(null)
    setMode("edit")
  }

  const toggleTool = (name: string): void => {
    setForm((prev) => {
      const exists = prev.tools.includes(name)
      const nextTools = exists ? prev.tools.filter((tool) => tool !== name) : [...prev.tools, name]
      return { ...prev, tools: nextTools }
    })
  }

  const toggleMiddleware = (id: string): void => {
    setForm((prev) => {
      const exists = prev.middleware.includes(id)
      const nextMiddleware = exists
        ? prev.middleware.filter((item) => item !== id)
        : [...prev.middleware, id]
      return { ...prev, middleware: nextMiddleware }
    })
  }

  const handleSave = async (): Promise<void> => {
    try {
      setError(null)
      if (mode === "create") {
        await window.api.subagents.create({
          name: form.name,
          description: form.description,
          systemPrompt: form.systemPrompt,
          tools: form.tools,
          middleware: form.middleware,
          interruptOn: form.interruptOn
        })
      } else if (mode === "edit" && editingId) {
        await window.api.subagents.update(editingId, {
          name: form.name,
          description: form.description,
          systemPrompt: form.systemPrompt,
          tools: form.tools,
          middleware: form.middleware,
          interruptOn: form.interruptOn
        })
      }
      await loadSubagents()
      resetForm()
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save subagent."
      setError(message)
    }
  }

  const handleDelete = async (agent: SubagentConfig): Promise<void> => {
    const confirmed = window.confirm(`${t("subagents.delete")}: ${agent.name}?`)
    if (!confirmed) return
    await window.api.subagents.delete(agent.id)
    await loadSubagents()
  }

  const handleOpenChange = (next: boolean): void => {
    if (!next) {
      resetForm()
      setOpen(next)
      return
    }
    setOpen(next)
    void loadSubagents()
    void loadTools()
    void loadMiddleware()
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
        title={t("titlebar.subagents")}
        aria-label={t("titlebar.subagents")}
        onClick={() => handleOpenChange(true)}
      >
        <Bot className="size-4" />
      </Button>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
            {t("subagents.title")}
          </DialogTitle>
        </DialogHeader>

        {mode === "list" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t("subagents.model_hint")}</span>
              <Button size="sm" onClick={startCreate}>
                <Plus className="size-3.5" />
                {t("subagents.add")}
              </Button>
            </div>

            {subagents.length === 0 ? (
              <div className="rounded-sm border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {t("subagents.empty")}
              </div>
            ) : (
              <div className="space-y-2">
                {subagents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-start justify-between gap-3 rounded-sm border border-border p-3"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{agent.name}</div>
                      <div className="text-xs text-muted-foreground">{agent.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(agent)}>
                        <Pencil className="size-3.5" />
                        {t("subagents.edit")}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(agent)}>
                        <Trash2 className="size-3.5" />
                        {t("subagents.delete")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{t("subagents.name")}</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{t("subagents.description")}</label>
              <Input
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                {t("subagents.system_prompt")}
              </label>
              <textarea
                value={form.systemPrompt}
                onChange={(e) => setForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                className="w-full min-h-[120px] rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">
                  {t("subagents.tools")} ({tools.length})
                </label>
                {tools.length === 0 ? (
                  <div className="rounded-sm border border-dashed border-border p-3 text-xs text-muted-foreground">
                    {t("subagents.tools_empty")}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                    {tools.map((tool) => {
                      const isSelected = form.tools.includes(tool.name)
                      return (
                        <div
                          key={tool.name}
                          onClick={() => toggleTool(tool.name)}
                          className={cn(
                            "rounded-sm border p-2 cursor-pointer transition-colors",
                            isSelected
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50 hover:bg-muted/50"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleTool(tool.name)}
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0"
                              />
                              <span className="text-xs font-medium text-foreground truncate">
                                {tool.label}
                              </span>
                            </div>
                            {!tool.enabled && (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {t("tools.disabled")}
                              </span>
                            )}
                          </div>
                          {tool.description && (
                            <div className="text-[10px] text-muted-foreground mt-1 pl-5 line-clamp-2">
                              {tool.description}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t("subagents.middleware")}</label>
                {middleware.length === 0 ? (
                  <div className="rounded-sm border border-dashed border-border p-3 text-xs text-muted-foreground">
                    {t("subagents.middleware_empty")}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                    {middleware.map((item) => {
                      const isSelected = form.middleware.includes(item.id)
                      return (
                        <div
                          key={item.id}
                          onClick={() => toggleMiddleware(item.id)}
                          className={cn(
                            "rounded-sm border p-2 cursor-pointer transition-colors",
                            isSelected
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50 hover:bg-muted/50"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleMiddleware(item.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0"
                            />
                            <span className="text-xs font-medium text-foreground truncate">
                              {item.label}
                            </span>
                          </div>
                          {item.description && (
                            <div className="text-[10px] text-muted-foreground mt-1 pl-5 line-clamp-2">
                              {item.description}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={form.interruptOn}
                onChange={(e) => setForm((prev) => ({ ...prev, interruptOn: e.target.checked }))}
              />
              {t("subagents.interrupt_on")}
            </label>
            {error && <div className="text-xs text-status-critical">{error}</div>}
          </div>
        )}

        {mode !== "list" && (
          <DialogFooter>
            <Button variant="ghost" onClick={resetForm}>
              {t("subagents.cancel")}
            </Button>
            <Button onClick={handleSave}>{t("subagents.save")}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

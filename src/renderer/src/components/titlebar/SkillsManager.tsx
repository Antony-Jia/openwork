import { useCallback, useEffect, useState } from "react"
import { Puzzle, Plus, Pencil, Trash2, Folder } from "lucide-react"
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
import type { SkillItem } from "@/types"

interface SkillFormState {
  name: string
  description: string
  content: string
}

const emptyForm: SkillFormState = {
  name: "",
  description: "",
  content: ""
}

export function SkillsManager(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [mode, setMode] = useState<"list" | "create" | "install" | "edit">("list")
  const [form, setForm] = useState<SkillFormState>(emptyForm)
  const [installPath, setInstallPath] = useState("")
  const [editingName, setEditingName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { t } = useLanguage()

  const loadSkills = useCallback(async () => {
    const items = await window.api.skills.list()
    setSkills(items)
  }, [])

  useEffect(() => {
    if (!open) return
    ;(async () => {
      const items = await window.api.skills.list()
      setSkills(items)
    })()
  }, [open])

  const resetForm = (): void => {
    setForm(emptyForm)
    setInstallPath("")
    setEditingName(null)
    setError(null)
    setMode("list")
  }

  const startCreate = (): void => {
    setForm(emptyForm)
    setMode("create")
    setError(null)
  }

  const startInstall = (): void => {
    setInstallPath("")
    setMode("install")
    setError(null)
  }

  const startEdit = async (skill: SkillItem): Promise<void> => {
    const content = await window.api.skills.getContent(skill.name)
    setForm({
      name: skill.name,
      description: skill.description,
      content
    })
    setEditingName(skill.name)
    setMode("edit")
    setError(null)
  }

  const handleSave = async (): Promise<void> => {
    try {
      setError(null)
      if (mode === "create") {
        await window.api.skills.create({
          name: form.name,
          description: form.description,
          content: form.content || undefined
        })
      } else if (mode === "install") {
        await window.api.skills.install({ path: installPath })
      } else if (mode === "edit" && editingName) {
        await window.api.skills.saveContent({ name: editingName, content: form.content })
      }
      await loadSkills()
      resetForm()
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save skill."
      setError(message)
    }
  }

  const handleDelete = async (skill: SkillItem): Promise<void> => {
    const confirmed = window.confirm(`${t("skills.delete")}: ${skill.name}?`)
    if (!confirmed) return
    await window.api.skills.delete(skill.name)
    await loadSkills()
  }

  const handleToggleEnabled = async (skill: SkillItem): Promise<void> => {
    await window.api.skills.setEnabled({ name: skill.name, enabled: !skill.enabled })
    await loadSkills()
  }

  const handleOpenChange = (next: boolean): void => {
    if (!next) {
      resetForm()
    }
    setOpen(next)
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
        title={t("titlebar.skills")}
        aria-label={t("titlebar.skills")}
        onClick={() => setOpen(true)}
      >
        <Puzzle className="size-4" />
      </Button>

      <DialogContent className="w-[900px] h-[640px] max-w-[90vw] max-h-[85vh] p-0 overflow-hidden">
        <div className="flex h-full flex-col">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
              {t("skills.title")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
            {mode === "list" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Folder className="size-3.5" />
                    <span>{t("skills.path")}: .openwork/skills</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={startInstall}>
                      {t("skills.install")}
                    </Button>
                    <Button size="sm" onClick={startCreate}>
                      <Plus className="size-3.5" />
                      {t("skills.create")}
                    </Button>
                  </div>
                </div>

                {skills.length === 0 ? (
                  <div className="rounded-sm border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    {t("skills.empty")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {skills.map((skill) => (
                      <div
                        key={skill.name}
                        className="flex items-start justify-between gap-3 rounded-sm border border-border p-3"
                      >
                        <div className="space-y-1">
                          <div className="text-sm font-medium">{skill.name}</div>
                          <div className="text-xs text-muted-foreground">{skill.description}</div>
                          <div className="text-[10px] text-muted-foreground">{skill.path}</div>
                          {!skill.enabled && (
                            <div className="text-[10px] text-muted-foreground">
                              {t("skills.disabled_hint")}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleEnabled(skill)}
                            className={cn(
                              "text-[10px] uppercase tracking-[0.2em] transition-colors",
                              skill.enabled
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {skill.enabled ? t("tools.enabled") : t("tools.disabled")}
                          </button>
                          <Button variant="ghost" size="sm" onClick={() => startEdit(skill)}>
                            <Pencil className="size-3.5" />
                            {t("skills.edit")}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(skill)}>
                            <Trash2 className="size-3.5" />
                            {t("skills.delete")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : mode === "install" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    {t("skills.install_path")}
                  </label>
                  <Input
                    value={installPath}
                    onChange={(e) => setInstallPath(e.target.value)}
                    placeholder={t("skills.install_hint")}
                  />
                </div>
                {error && <div className="text-xs text-status-critical">{error}</div>}
              </div>
            ) : (
              <div className="space-y-4">
                {mode === "create" && (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">{t("skills.name")}</label>
                      <Input
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder={t("skills.name_hint")}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">
                        {t("skills.description")}
                      </label>
                      <Input
                        value={form.description}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, description: e.target.value }))
                        }
                      />
                    </div>
                  </>
                )}
                {mode === "edit" && (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">{t("skills.name")}</label>
                    <Input value={form.name} disabled />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">{t("skills.content")}</label>
                  <textarea
                    value={form.content}
                    onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                    placeholder={t("skills.content_placeholder")}
                    className="w-full min-h-[160px] rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                {error && <div className="text-xs text-status-critical">{error}</div>}
              </div>
            )}
          </div>

          {mode !== "list" && (
            <DialogFooter className="px-6 pb-6 pt-2">
              <Button variant="ghost" onClick={resetForm}>
                {t("skills.cancel")}
              </Button>
              <Button onClick={handleSave}>{t("skills.save")}</Button>
            </DialogFooter>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

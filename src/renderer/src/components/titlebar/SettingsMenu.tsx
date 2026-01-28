import { useState, useEffect, useCallback } from "react"
import { Settings2, Check } from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AppSettings, ProviderConfig, SimpleProviderId } from "@/types"

interface SettingsMenuProps {
  threadId: string | null
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function SettingsMenu(_props: SettingsMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"general" | "provider" | "ralph" | "email">("general")
  const { language, setLanguage, theme, setTheme, t } = useLanguage()

  // Provider configuration state
  const [providerType, setProviderType] = useState<SimpleProviderId>("ollama")
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434")
  const [ollamaModel, setOllamaModel] = useState("")
  const [openaiUrl, setOpenaiUrl] = useState("https://api.openai.com/v1")
  const [openaiKey, setOpenaiKey] = useState("")
  const [openaiModel, setOpenaiModel] = useState("")
  const [hasConfig, setHasConfig] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  // Ralph settings
  const [ralphIterations, setRalphIterations] = useState("5")

  // Email settings
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [emailFrom, setEmailFrom] = useState("")
  const [emailTo, setEmailTo] = useState("")
  const [smtpHost, setSmtpHost] = useState("")
  const [smtpPort, setSmtpPort] = useState("587")
  const [smtpSecure, setSmtpSecure] = useState(false)
  const [smtpUser, setSmtpUser] = useState("")
  const [smtpPass, setSmtpPass] = useState("")
  const [imapHost, setImapHost] = useState("")
  const [imapPort, setImapPort] = useState("993")
  const [imapSecure, setImapSecure] = useState(true)
  const [imapUser, setImapUser] = useState("")
  const [imapPass, setImapPass] = useState("")
  const [defaultWorkspacePath, setDefaultWorkspacePath] = useState("")

  // Load current config on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const config = (await window.api.provider.getConfig()) as ProviderConfig | null
        if (config) {
          setHasConfig(true)
          setProviderType(config.type === "ollama" ? "ollama" : "openai-compatible")
          if (config.type === "ollama") {
            setOllamaUrl(config.url)
            setOllamaModel(config.model)
          } else {
            setOpenaiUrl(config.url)
            setOpenaiKey(config.apiKey)
            setOpenaiModel(config.model)
          }
        }
        const settings = (await window.api.settings.get()) as AppSettings
        if (settings) {
          setRalphIterations(String(settings.ralphIterations || 5))
          setDefaultWorkspacePath(settings.defaultWorkspacePath || "")
          setEmailEnabled(!!settings.email?.enabled)
          setEmailFrom(settings.email?.from || "")
          setEmailTo((settings.email?.to || []).join(", "))
          setSmtpHost(settings.email?.smtp?.host || "")
          setSmtpPort(String(settings.email?.smtp?.port || 587))
          setSmtpSecure(!!settings.email?.smtp?.secure)
          setSmtpUser(settings.email?.smtp?.user || "")
          setSmtpPass(settings.email?.smtp?.pass || "")
          setImapHost(settings.email?.imap?.host || "")
          setImapPort(String(settings.email?.imap?.port || 993))
          setImapSecure(settings.email?.imap?.secure ?? true)
          setImapUser(settings.email?.imap?.user || "")
          setImapPass(settings.email?.imap?.pass || "")
        }
      } catch (e) {
        console.error("Failed to load provider config:", e)
      }
    }
    loadConfig()
  }, [])

  const handleSaveSettings = useCallback(async () => {
    const iterationsValue = Number.parseInt(ralphIterations, 10)
    const smtpPortValue = Number.parseInt(smtpPort, 10)
    const imapPortValue = Number.parseInt(imapPort, 10)
    const toList = emailTo
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean)

    try {
      await window.api.settings.update({
        updates: {
          ralphIterations:
            Number.isFinite(iterationsValue) && iterationsValue > 0 ? iterationsValue : 5,
          defaultWorkspacePath: defaultWorkspacePath.trim() || null,
          email: {
            enabled: emailEnabled,
            from: emailFrom.trim(),
            to: toList,
            smtp: {
              host: smtpHost.trim(),
              port: Number.isFinite(smtpPortValue) ? smtpPortValue : 587,
              secure: smtpSecure,
              user: smtpUser.trim(),
              pass: smtpPass
            },
            imap: {
              host: imapHost.trim(),
              port: Number.isFinite(imapPortValue) ? imapPortValue : 993,
              secure: imapSecure,
              user: imapUser.trim(),
              pass: imapPass
            }
          }
        }
      })
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2000)
    } catch (e) {
      console.error("Failed to save settings:", e)
    }
  }, [
    ralphIterations,
    defaultWorkspacePath,
    emailEnabled,
    emailFrom,
    emailTo,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    imapHost,
    imapPort,
    imapSecure,
    imapUser,
    imapPass
  ])

  const handleSelectDefaultWorkspace = useCallback(async () => {
    try {
      const selectedPath = await window.api.workspace.select()
      if (selectedPath) {
        setDefaultWorkspacePath(selectedPath)
      }
    } catch (e) {
      console.error("Failed to select default workspace:", e)
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(
            "h-7 w-7 rounded-md border border-transparent",
            open
              ? "bg-background/70 text-foreground border-border/80"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          )}
          title={t("settings.title")}
          aria-label="Settings"
        >
          <Settings2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[900px] h-[640px] max-w-[90vw] max-h-[85vh] p-0 border-border/80 bg-background/95 backdrop-blur overflow-hidden">
        <div className="flex h-full flex-col">
          <DialogHeader className="px-4 py-3 border-b border-border/70 bg-background/70">
            <DialogTitle className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {t("settings.title")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-1 px-4 py-2 border-b border-border/70">
            {(
              [
                { id: "general", label: t("settings.tabs.general") },
                { id: "provider", label: t("settings.tabs.provider") },
                { id: "ralph", label: t("settings.tabs.ralph") },
                { id: "email", label: t("settings.tabs.email") }
              ] as const
            ).map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveTab(tab.id)}
                className={cn("h-7 text-xs", activeTab === tab.id && "bg-secondary")}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === "general" && (
              <>
                {/* Default Workspace */}
                <div className="px-4 py-3 border-b border-border/70 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {t("settings.general.default_workspace")}
                    </div>
                    <div
                      className="text-[10px] text-muted-foreground truncate"
                      title={defaultWorkspacePath || undefined}
                    >
                      {defaultWorkspacePath || t("settings.general.default_workspace_empty")}
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={handleSelectDefaultWorkspace}>
                    {t("settings.general.default_workspace_choose")}
                  </Button>
                </div>

                {/* Language Selection */}
                <div className="px-4 py-3 border-b border-border/70 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("settings.language")}</span>
                  <div className="flex gap-2">
                    <Button
                      variant={language === "en" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setLanguage("en")}
                      className="h-6 text-xs"
                    >
                      {t("settings.language.english")}
                    </Button>
                    <Button
                      variant={language === "zh" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setLanguage("zh")}
                      className="h-6 text-xs"
                    >
                      {t("settings.language.chinese")}
                    </Button>
                  </div>
                </div>

                {/* Theme Selection */}
                <div className="px-4 py-3 border-b border-border/70 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("settings.theme")}</span>
                  <div className="flex gap-2">
                    <Button
                      variant={theme === "dark" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setTheme("dark")}
                      className={cn(
                        "h-6 text-xs",
                        theme === "dark" && "bg-secondary text-secondary-foreground"
                      )}
                    >
                      {t("settings.theme.dark")}
                    </Button>
                    <Button
                      variant={theme === "light" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setTheme("light")}
                      className={cn(
                        "h-6 text-xs",
                        theme === "light" && "bg-secondary text-secondary-foreground"
                      )}
                    >
                      {t("settings.theme.light")}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {activeTab === "provider" && (
              <div className="px-4 py-3 border-b border-border/70">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t("provider.title")}
                  </span>
                  {hasConfig ? (
                    <span className="text-[10px] text-green-500">{t("provider.saved")}</span>
                  ) : (
                    <span className="text-[10px] text-status-warning">
                      {t("provider.not_configured")}
                    </span>
                  )}
                </div>

                {/* Provider Type Selection */}
                <div className="flex gap-2 mb-3">
                  <Button
                    variant={providerType === "ollama" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setProviderType("ollama")}
                    className="h-7 text-xs flex-1"
                  >
                    {t("provider.ollama")}
                  </Button>
                  <Button
                    variant={providerType === "openai-compatible" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setProviderType("openai-compatible")}
                    className="h-7 text-xs flex-1"
                  >
                    {t("provider.openai_compatible")}
                  </Button>
                </div>

                {/* Ollama Configuration */}
                {providerType === "ollama" && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">
                        {t("provider.url")}
                      </label>
                      <input
                        type="text"
                        value={ollamaUrl}
                        onChange={(e) => setOllamaUrl(e.target.value)}
                        placeholder={t("provider.url_placeholder_ollama")}
                        className="w-full h-7 px-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">
                        {t("provider.model")}
                      </label>
                      <input
                        type="text"
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        placeholder={t("provider.model_placeholder")}
                        className="w-full h-7 px-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  </div>
                )}

                {/* OpenAI Compatible Configuration */}
                {providerType === "openai-compatible" && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">
                        {t("provider.url")}
                      </label>
                      <input
                        type="text"
                        value={openaiUrl}
                        onChange={(e) => setOpenaiUrl(e.target.value)}
                        placeholder={t("provider.url_placeholder_openai")}
                        className="w-full h-7 px-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">
                        {t("provider.api_key")}
                      </label>
                      <input
                        type="password"
                        value={openaiKey}
                        onChange={(e) => setOpenaiKey(e.target.value)}
                        placeholder={t("provider.key_placeholder")}
                        className="w-full h-7 px-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">
                        {t("provider.model")}
                      </label>
                      <input
                        type="text"
                        value={openaiModel}
                        onChange={(e) => setOpenaiModel(e.target.value)}
                        placeholder={t("provider.model_placeholder")}
                        className="w-full h-7 px-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "ralph" && (
              <div className="px-4 py-3 border-b border-border/70">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t("settings.ralph.title")}
                  </span>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">
                    {t("settings.ralph.iterations")}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={ralphIterations}
                    onChange={(e) => setRalphIterations(e.target.value)}
                    className="w-full h-7 px-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            )}

            {activeTab === "email" && (
              <div className="px-4 py-3 border-b border-border/70 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t("settings.email.title")}
                  </span>
                  {settingsSaved ? (
                    <span className="text-[10px] text-green-500">{t("settings.saved")}</span>
                  ) : null}
                </div>

                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                  />
                  {t("settings.email.enabled")}
                </label>

                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground block">
                    {t("settings.email.from")}
                  </label>
                  <input
                    type="text"
                    value={emailFrom}
                    onChange={(e) => setEmailFrom(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-7 px-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground block">
                    {t("settings.email.to")}
                  </label>
                  <textarea
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="recipient@example.com"
                    className="w-full min-h-[70px] px-2 py-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t("settings.email.smtp")}
                  </div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder="smtp.example.com"
                      className="w-full h-7 px-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(e.target.value)}
                        placeholder="587"
                        className="w-full h-7 px-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={smtpSecure}
                          onChange={(e) => setSmtpSecure(e.target.checked)}
                        />
                        {t("settings.email.secure")}
                      </label>
                    </div>
                    <input
                      type="text"
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                      placeholder={t("settings.email.username")}
                      className="w-full h-7 px-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <input
                      type="password"
                      value={smtpPass}
                      onChange={(e) => setSmtpPass(e.target.value)}
                      placeholder={t("settings.email.password")}
                      className="w-full h-7 px-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t("settings.email.imap")}
                  </div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={imapHost}
                      onChange={(e) => setImapHost(e.target.value)}
                      placeholder="imap.example.com"
                      className="w-full h-7 px-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={imapPort}
                        onChange={(e) => setImapPort(e.target.value)}
                        placeholder="993"
                        className="w-full h-7 px-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={imapSecure}
                          onChange={(e) => setImapSecure(e.target.checked)}
                        />
                        {t("settings.email.secure")}
                      </label>
                    </div>
                    <input
                      type="text"
                      value={imapUser}
                      onChange={(e) => setImapUser(e.target.value)}
                      placeholder={t("settings.email.username")}
                      className="w-full h-7 px-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <input
                      type="password"
                      value={imapPass}
                      onChange={(e) => setImapPass(e.target.value)}
                      placeholder={t("settings.email.password")}
                      className="w-full h-7 px-2 text-xs bg-muted/50 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/70 bg-background/70">
            <div className="flex items-center gap-2">
              {settingsSaved ? (
                <span className="text-[10px] text-green-500">{t("settings.saved")}</span>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" onClick={handleSaveSettings}>
                <Check className={cn("size-3.5", settingsSaved ? "opacity-100" : "opacity-70")} />
                {t("settings.save")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

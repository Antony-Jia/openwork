import { useState, useEffect, useCallback } from "react"
import { Settings2, Check } from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ProviderConfig, SimpleProviderId } from "@/types"

interface SettingsMenuProps {
  threadId: string | null
}

export function SettingsMenu({ threadId: _threadId }: SettingsMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const { language, setLanguage, theme, setTheme, t } = useLanguage()

  // Provider configuration state
  const [providerType, setProviderType] = useState<SimpleProviderId>("ollama")
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434")
  const [ollamaModel, setOllamaModel] = useState("")
  const [openaiUrl, setOpenaiUrl] = useState("https://api.openai.com/v1")
  const [openaiKey, setOpenaiKey] = useState("")
  const [openaiModel, setOpenaiModel] = useState("")
  const [saved, setSaved] = useState(false)
  const [hasConfig, setHasConfig] = useState(false)

  // Load current config on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const config = await window.api.provider.getConfig() as ProviderConfig | null
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
      } catch (e) {
        console.error("Failed to load provider config:", e)
      }
    }
    loadConfig()
  }, [])

  const handleSave = useCallback(async () => {
    const config: ProviderConfig = providerType === "ollama"
      ? { type: "ollama", url: ollamaUrl, model: ollamaModel }
      : { type: "openai-compatible", url: openaiUrl, apiKey: openaiKey, model: openaiModel }

    try {
      await window.api.provider.setConfig(config)
      setHasConfig(true)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error("Failed to save provider config:", e)
    }
  }, [providerType, ollamaUrl, ollamaModel, openaiUrl, openaiKey, openaiModel])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      <PopoverContent
        className="w-[380px] p-0 overflow-hidden border-border/80 bg-background/95 backdrop-blur"
        align="start"
        sideOffset={10}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/70 bg-background/70">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {t("settings.title")}
          </span>
        </div>

        {/* Language Selection */}
        <div className="px-3 py-2 border-b border-border/70 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t("settings.language")}</span>
          <div className="flex gap-2">
            <Button
              variant={language === 'en' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setLanguage('en')}
              className="h-6 text-xs"
            >
              {t("settings.language.english")}
            </Button>
            <Button
              variant={language === 'zh' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setLanguage('zh')}
              className="h-6 text-xs"
            >
              {t("settings.language.chinese")}
            </Button>
          </div>
        </div>

        {/* Theme Selection */}
        <div className="px-3 py-2 border-b border-border/70 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t("settings.theme")}</span>
          <div className="flex gap-2">
            <Button
              variant={theme === 'dark' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTheme('dark')}
              className={cn("h-6 text-xs", theme === 'dark' && "bg-secondary text-secondary-foreground")}
            >
              {t("settings.theme.dark")}
            </Button>
            <Button
              variant={theme === 'light' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTheme('light')}
              className={cn("h-6 text-xs", theme === 'light' && "bg-secondary text-secondary-foreground")}
            >
              {t("settings.theme.light")}
            </Button>
          </div>
        </div>

        {/* Provider Configuration */}
        <div className="px-3 py-2 border-b border-border/70">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {t("provider.title")}
            </span>
            {hasConfig ? (
              <span className="text-[10px] text-green-500">{t("provider.saved")}</span>
            ) : (
              <span className="text-[10px] text-status-warning">{t("provider.not_configured")}</span>
            )}
          </div>

          {/* Provider Type Selection */}
          <div className="flex gap-2 mb-3">
            <Button
              variant={providerType === 'ollama' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setProviderType('ollama')}
              className="h-7 text-xs flex-1"
            >
              {t("provider.ollama")}
            </Button>
            <Button
              variant={providerType === 'openai-compatible' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setProviderType('openai-compatible')}
              className="h-7 text-xs flex-1"
            >
              {t("provider.openai_compatible")}
            </Button>
          </div>

          {/* Ollama Configuration */}
          {providerType === 'ollama' && (
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
          {providerType === 'openai-compatible' && (
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

          {/* Save Button */}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saved}
            className="w-full mt-3 h-7 text-xs"
          >
            {saved ? (
              <>
                <Check className="size-3 mr-1" />
                {t("provider.saved")}
              </>
            ) : (
              t("provider.save")
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

import { useEffect, useMemo, useState } from "react"
import { Box, Trash2, Plus, FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/lib/i18n"
import type { DockerConfig, DockerMount, DockerPort, DockerSessionStatus } from "@/types"

interface ContainerManagerProps {
  threadId: string | null
}

const defaultMount: DockerMount = {
  hostPath: "",
  containerPath: "/workspace",
  readOnly: false
}

const defaultConfig: DockerConfig = {
  enabled: false,
  image: "python:3.13-alpine",
  mounts: [defaultMount],
  resources: {},
  ports: []
}

export function ContainerManager({ threadId: _threadId }: ContainerManagerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [available, setAvailable] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const { t } = useLanguage()
  const [sessionStatus, setSessionStatus] = useState<DockerSessionStatus>({
    enabled: false,
    running: false
  })
  const [image, setImage] = useState(defaultConfig.image)
  const [cpu, setCpu] = useState("")
  const [memory, setMemory] = useState("")
  const [mounts, setMounts] = useState<DockerMount[]>([defaultMount])
  const [ports, setPorts] = useState<DockerPort[]>([])

  const canUseDocker = useMemo(() => {
    return window.electron?.process?.platform === "win32"
  }, [])

  useEffect(() => {
    if (!open) return

    async function refresh(): Promise<void> {
      console.log("[ContainerManager] Checking docker status...")
      setChecking(true)
      setStatusError(null)

      try {
        if (!canUseDocker) {
          console.warn("[ContainerManager] Docker check skipped (non-Windows).")
          setAvailable(false)
          setStatusError("Docker is supported on Windows only.")
          return
        }

        if (!window.api?.docker?.check) {
          console.warn("[ContainerManager] window.api.docker.check not available.")
          setAvailable(false)
          setStatusError("Docker check is unavailable. Please restart the app.")
          return
        }

        const status = await window.api.docker.check()
        console.log("[ContainerManager] Docker check result:", status)
        setAvailable(status.available)
        setStatusError(status.error ?? null)
      } catch (error) {
        console.error("[ContainerManager] Docker check failed:", error)
        const message = error instanceof Error ? error.message : "Docker check failed."
        setAvailable(false)
        setStatusError(message)
      } finally {
        setChecking(false)
      }
    }

    async function loadConfig(): Promise<void> {
      const config = (await window.api.docker.getConfig()) as DockerConfig
      setImage(config.image || defaultConfig.image)
      setMounts(config.mounts?.length ? config.mounts : [defaultMount])
      setPorts(config.ports ?? [])
      setCpu(config.resources?.cpu ? String(config.resources.cpu) : "")
      setMemory(config.resources?.memoryMb ? String(config.resources.memoryMb) : "")
    }

    async function loadStatus(): Promise<void> {
      const status = (await window.api.docker.status()) as DockerSessionStatus
      setSessionStatus(status)
    }

    refresh()
    loadConfig()
    loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canUseDocker])

  const handleSave = async (): Promise<void> => {
    const cpuValue = Number.parseFloat(cpu)
    const memoryValue = Number.parseInt(memory, 10)

    const nextConfig: DockerConfig = {
      enabled: false,
      image: image.trim() || defaultConfig.image,
      mounts: mounts.filter((m) => m.hostPath && m.containerPath),
      resources: {
        ...(Number.isFinite(cpuValue) && cpuValue > 0 ? { cpu: cpuValue } : {}),
        ...(Number.isFinite(memoryValue) && memoryValue > 0 ? { memoryMb: memoryValue } : {})
      },
      ports: ports.filter((p) => p.host && p.container)
    }

    await window.api.docker.setConfig(nextConfig)
    window.dispatchEvent(new Event("docker:updated"))
    setOpen(false)
  }

  const handleEnter = async (): Promise<void> => {
    const next = (await window.api.docker.enter()) as DockerSessionStatus
    setSessionStatus(next)
    window.dispatchEvent(new Event("docker:updated"))
  }

  const handleExit = async (): Promise<void> => {
    const next = (await window.api.docker.exit()) as DockerSessionStatus
    setSessionStatus(next)
    window.dispatchEvent(new Event("docker:updated"))
  }

  const handleRestart = async (): Promise<void> => {
    const next = (await window.api.docker.restart()) as DockerSessionStatus
    setSessionStatus(next)
    window.dispatchEvent(new Event("docker:updated"))
  }

  const updateMount = (index: number, updates: Partial<DockerMount>): void => {
    setMounts((prev) => prev.map((mount, i) => (i === index ? { ...mount, ...updates } : mount)))
  }

  const updatePort = (index: number, updates: Partial<DockerPort>): void => {
    setPorts((prev) => prev.map((port, i) => (i === index ? { ...port, ...updates } : port)))
  }

  const handleSelectMountPath = async (index: number): Promise<void> => {
    if (!window.api?.docker?.selectMountPath) return
    const currentPath = mounts[index]?.hostPath || undefined
    const selectedPath = await window.api.docker.selectMountPath(currentPath)
    if (selectedPath) {
      updateMount(index, { hostPath: selectedPath })
    }
  }

  const removeMount = (index: number): void => {
    setMounts((prev) => prev.filter((_, i) => i !== index))
  }

  const removePort = (index: number): void => {
    setPorts((prev) => prev.filter((_, i) => i !== index))
  }

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
        title={t("titlebar.container")}
        aria-label={t("titlebar.container")}
        onClick={() => setOpen(true)}
      >
        <Box className="size-4" />
      </Button>

      <DialogContent className="w-[900px] h-[640px] max-w-[90vw] max-h-[85vh] p-0 overflow-hidden">
        <div className="flex h-full flex-col">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
              {t("container.title")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("container.status")}</span>
                <span className={cn(available ? "text-status-nominal" : "text-status-critical")}>
                  {checking
                    ? t("common.loading")
                    : available
                      ? t("container.available")
                      : t("container.unavailable")}
                </span>
              </div>
              {statusError && <div className="text-xs text-status-critical">{statusError}</div>}
              {sessionStatus.error && (
                <div className="text-xs text-status-critical">{sessionStatus.error}</div>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("container.mode")}</span>
                <span className={cn(sessionStatus.enabled ? "text-status-info" : "")}>
                  {sessionStatus.enabled ? t("container.mode_on") : t("container.mode_off")}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {!sessionStatus.enabled ? (
                  <Button onClick={handleEnter} disabled={!available}>
                    {t("container.enter")}
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" onClick={handleRestart} disabled={!available}>
                      {t("container.restart")}
                    </Button>
                    <Button variant="secondary" onClick={handleExit} disabled={!available}>
                      {t("container.exit")}
                    </Button>
                  </>
                )}
                {sessionStatus.containerId && (
                  <span className="text-xs text-muted-foreground">
                    {t("container.running")} {sessionStatus.containerId.slice(0, 12)}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">{t("container.image")}</label>
                <Input
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  disabled={sessionStatus.running}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">{t("container.cpu")}</label>
                  <Input
                    value={cpu}
                    onChange={(e) => setCpu(e.target.value)}
                    disabled={sessionStatus.running}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">{t("container.memory")}</label>
                  <Input
                    value={memory}
                    onChange={(e) => setMemory(e.target.value)}
                    disabled={sessionStatus.running}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("container.mounts")}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMounts((prev) => [...prev, { ...defaultMount }])}
                    disabled={sessionStatus.running}
                  >
                    <Plus className="size-3.5" />
                    {t("container.add_mount")}
                  </Button>
                </div>
                {mounts.map((mount, index) => (
                  <div key={`mount-${index}`} className="grid grid-cols-12 gap-2">
                    <Input
                      className="col-span-4"
                      value={mount.hostPath}
                      onChange={(e) => updateMount(index, { hostPath: e.target.value })}
                      placeholder={t("container.host_path")}
                      disabled={sessionStatus.running}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="col-span-1"
                      onClick={() => void handleSelectMountPath(index)}
                      title={t("container.select_path")}
                      aria-label={t("container.select_path")}
                      disabled={sessionStatus.running}
                    >
                      <FolderOpen className="size-3.5" />
                    </Button>
                    <Input
                      className="col-span-4"
                      value={mount.containerPath}
                      onChange={(e) => updateMount(index, { containerPath: e.target.value })}
                      placeholder={t("container.container_path")}
                      disabled={sessionStatus.running}
                    />
                    <label className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={!!mount.readOnly}
                        onChange={(e) => updateMount(index, { readOnly: e.target.checked })}
                        disabled={sessionStatus.running}
                      />
                      {t("container.read_only")}
                    </label>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="col-span-1"
                      onClick={() => removeMount(index)}
                      disabled={sessionStatus.running}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("container.ports")}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPorts((prev) => [...prev, { host: 0, container: 0, protocol: "tcp" }])
                    }
                    disabled={sessionStatus.running}
                  >
                    <Plus className="size-3.5" />
                    {t("container.add_port")}
                  </Button>
                </div>
                {ports.map((port, index) => (
                  <div key={`port-${index}`} className="grid grid-cols-12 gap-2">
                    <Input
                      className="col-span-3"
                      value={port.host ? String(port.host) : ""}
                      onChange={(e) => updatePort(index, { host: Number(e.target.value) || 0 })}
                      placeholder={t("container.port_host")}
                      disabled={sessionStatus.running}
                    />
                    <Input
                      className="col-span-3"
                      value={port.container ? String(port.container) : ""}
                      onChange={(e) =>
                        updatePort(index, { container: Number(e.target.value) || 0 })
                      }
                      placeholder={t("container.port_container")}
                      disabled={sessionStatus.running}
                    />
                    <select
                      className="col-span-4 h-9 rounded-md border border-input bg-background px-2 text-xs"
                      value={port.protocol || "tcp"}
                      onChange={(e) =>
                        updatePort(index, { protocol: e.target.value as "tcp" | "udp" })
                      }
                      disabled={sessionStatus.running}
                    >
                      <option value="tcp">{t("container.protocol")} TCP</option>
                      <option value="udp">{t("container.protocol")} UDP</option>
                    </select>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="col-span-2"
                      onClick={() => removePort(index)}
                      disabled={sessionStatus.running}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              {sessionStatus.running && (
                <div className="text-xs text-muted-foreground">
                  {t("container.edit_disabled")}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={!available || sessionStatus.running}>
                  {t("container.save")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

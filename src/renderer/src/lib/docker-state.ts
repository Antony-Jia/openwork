import { useCallback, useEffect, useState } from "react"
import type { DockerConfig, DockerSessionStatus } from "@/types"

const EMPTY_STATUS: DockerSessionStatus = {
  enabled: false,
  running: false
}

export function useDockerState(): {
  status: DockerSessionStatus
  config: DockerConfig | null
  refresh: () => Promise<void>
} {
  const [status, setStatus] = useState<DockerSessionStatus>(EMPTY_STATUS)
  const [config, setConfig] = useState<DockerConfig | null>(null)

  const refresh = useCallback(async () => {
    if (!window.api?.docker?.status || !window.api?.docker?.getConfig) return
    try {
      const [nextStatus, nextConfig] = await Promise.all([
        window.api.docker.status(),
        window.api.docker.getConfig()
      ])
      setStatus(nextStatus)
      setConfig(nextConfig)
    } catch (error) {
      console.warn("[DockerState] Failed to refresh:", error)
    }
  }, [])

  useEffect(() => {
    refresh()
    const onUpdate = (): void => {
      refresh()
    }
    window.addEventListener("docker:updated", onUpdate)
    const interval = window.setInterval(refresh, 5000)
    return () => {
      window.removeEventListener("docker:updated", onUpdate)
      window.clearInterval(interval)
    }
  }, [refresh])

  return { status, config, refresh }
}

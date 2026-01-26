import React from "react"
import { SettingsMenu } from "./SettingsMenu"
import { SubagentManager } from "./SubagentManager"
import { SkillsManager } from "./SkillsManager"
import { ToolsManager } from "./ToolsManager"
import { ContainerManager } from "./ContainerManager"
import { WindowControls } from "./WindowControls"
import { useLanguage } from "@/lib/i18n"

interface TitleBarProps {
  threadId: string | null
}

export function TitleBar({ threadId }: TitleBarProps): React.JSX.Element {
  const { t } = useLanguage()

  return (
    <div className="app-titlebar flex h-[40px] w-full shrink-0 items-center justify-between px-3 app-drag-region select-none z-50">
      {/* Left: Settings */}
      <div className="flex items-center gap-2 app-no-drag">
        <SettingsMenu threadId={threadId} />
        <SubagentManager />
        <SkillsManager />
        <ToolsManager />
        <ContainerManager threadId={threadId} />
      </div>

      {/* Center: Title */}
      <div className="text-[11px] font-medium text-muted-foreground/60 tracking-[0.2em] uppercase">
        {t("app.title")}
      </div>

      {/* Right: Window Controls */}
      <div className="flex items-center gap-2 app-no-drag">
        <WindowControls />
      </div>
    </div>
  )
}

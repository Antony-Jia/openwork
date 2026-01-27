import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getOpenworkDir } from "../storage"

const SKILLS_CONFIG_FILE = join(getOpenworkDir(), "skills.json")

interface SkillsConfigStore {
  [skillName: string]: {
    enabled?: boolean
  }
}

function readSkillsConfig(): SkillsConfigStore {
  if (!existsSync(SKILLS_CONFIG_FILE)) {
    return {}
  }

  try {
    const raw = readFileSync(SKILLS_CONFIG_FILE, "utf-8")
    const parsed = JSON.parse(raw) as SkillsConfigStore
    return typeof parsed === "object" && parsed ? parsed : {}
  } catch {
    return {}
  }
}

function writeSkillsConfig(config: SkillsConfigStore): void {
  const data = JSON.stringify(config, null, 2)
  writeFileSync(SKILLS_CONFIG_FILE, data)
}

export function isSkillEnabled(skillName: string): boolean {
  const config = readSkillsConfig()
  const enabled = config[skillName]?.enabled
  return enabled ?? true
}

export function setSkillEnabled(skillName: string, enabled: boolean): void {
  const config = readSkillsConfig()
  const existing = config[skillName] ?? {}

  if (enabled) {
    delete existing.enabled
  } else {
    existing.enabled = false
  }

  if (existing.enabled === undefined) {
    delete config[skillName]
  } else {
    config[skillName] = existing
  }

  writeSkillsConfig(config)
}

export function removeSkillConfig(skillName: string): void {
  const config = readSkillsConfig()
  if (config[skillName]) {
    delete config[skillName]
    writeSkillsConfig(config)
  }
}

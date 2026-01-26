import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getOpenworkDir } from "./storage"
import type { AppSettings } from "./types"

const SETTINGS_FILE = join(getOpenworkDir(), "settings.json")

const defaultSettings: AppSettings = {
  ralphIterations: 5,
  email: {
    enabled: false,
    from: "",
    to: [],
    smtp: {
      host: "",
      port: 587,
      secure: false,
      user: "",
      pass: ""
    },
    imap: {
      host: "",
      port: 993,
      secure: true,
      user: "",
      pass: ""
    }
  }
}

function readSettingsFile(): AppSettings {
  if (!existsSync(SETTINGS_FILE)) {
    return defaultSettings
  }
  try {
    const raw = readFileSync(SETTINGS_FILE, "utf-8")
    const parsed = JSON.parse(raw) as AppSettings
    return {
      ...defaultSettings,
      ...parsed,
      email: {
        ...defaultSettings.email,
        ...(parsed?.email ?? {}),
        smtp: {
          ...defaultSettings.email.smtp,
          ...(parsed?.email?.smtp ?? {})
        },
        imap: {
          ...defaultSettings.email.imap,
          ...(parsed?.email?.imap ?? {})
        }
      }
    }
  } catch {
    return defaultSettings
  }
}

function writeSettingsFile(settings: AppSettings): void {
  getOpenworkDir()
  const data = JSON.stringify(settings, null, 2)
  writeFileSync(SETTINGS_FILE, data)
}

export function getSettings(): AppSettings {
  return readSettingsFile()
}

export function updateSettings(updates: Partial<AppSettings>): AppSettings {
  const current = readSettingsFile()
  const next: AppSettings = {
    ...current,
    ...updates,
    email: {
      ...current.email,
      ...(updates.email ?? {}),
      smtp: {
        ...current.email.smtp,
        ...(updates.email?.smtp ?? {})
      },
      imap: {
        ...current.email.imap,
        ...(updates.email?.imap ?? {})
      }
    }
  }

  writeSettingsFile(next)
  return next
}

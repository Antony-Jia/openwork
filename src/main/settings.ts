import type { AppSettings } from "./types"
import { getDb, markDbDirty } from "./db"

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
  },
  dockerConfig: {
    enabled: false,
    image: "python:3.13-alpine",
    mounts: [
      {
        hostPath: "",
        containerPath: "/workspace",
        readOnly: false
      }
    ],
    resources: {},
    ports: []
  }
}

function readSettings(): AppSettings {
  const database = getDb()
  const stmt = database.prepare("SELECT data FROM app_settings WHERE id = 1")
  const hasRow = stmt.step()
  if (!hasRow) {
    stmt.free()
    return defaultSettings
  }
  const row = stmt.getAsObject() as { data?: string }
  stmt.free()

  try {
    const parsed = JSON.parse(row.data ?? "{}") as AppSettings
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

function writeSettings(settings: AppSettings): void {
  const database = getDb()
  const data = JSON.stringify(settings, null, 2)
  database.run("INSERT OR REPLACE INTO app_settings (id, data) VALUES (1, ?)", [data])
  markDbDirty()
}

export function getSettings(): AppSettings {
  return readSettings()
}

export function updateSettings(updates: Partial<AppSettings>): AppSettings {
  const current = readSettings()
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
    },
    dockerConfig: updates.dockerConfig ?? current.dockerConfig
  }

  writeSettings(next)
  return next
}

import * as nodemailer from "nodemailer"
import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"
import { getSettings } from "../settings"
import type { EmailSettings } from "../types"

export interface EmailTask {
  id: string
  subject: string
  from: string
  text: string
  threadId?: string | null
}

function getTaskTag(): string {
  const settings = getSettings()
  return settings.email.taskTag || "<OpenworkTask>"
}

export function normalizeSubject(subject: string): string {
  return subject.replace(/^(?:\s*(?:re|fwd|fw):\s*)+/gi, "").trim()
}

export function buildEmailSubject(threadId: string, suffix: string): string {
  const cleaned = suffix.trim()
  const tag = getTaskTag()
  return `${tag} [${threadId}] ${cleaned}`.trim()
}

export function stripEmailSubjectPrefix(subject: string): string {
  const normalized = normalizeSubject(subject)
  const tag = getTaskTag()
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(`^${escapedTag}\\s*(\\[[^\\]]+\\]\\s*)?`, "i")
  return normalized.replace(regex, "").trim()
}

function getEmailSettings(): EmailSettings {
  const settings = getSettings()
  return settings.email
}

function normalizeEmail(value?: string | null): string {
  return value?.trim().toLowerCase() ?? ""
}

function isSelfSender(parsed: { from?: { text?: string; value?: Array<{ address?: string | null }> } }, settings: EmailSettings): boolean {
  const selfAddresses = [settings.from, settings.smtp.user, settings.imap.user]
    .map((addr) => normalizeEmail(addr))
    .filter(Boolean)

  if (selfAddresses.length === 0) return false

  const fromAddresses =
    parsed.from?.value?.map((entry) => normalizeEmail(entry.address))?.filter(Boolean) ?? []

  if (fromAddresses.some((addr) => selfAddresses.includes(addr))) {
    return true
  }

  const fromText = normalizeEmail(parsed.from?.text)
  if (fromText && selfAddresses.some((addr) => fromText.includes(addr))) {
    return true
  }

  return false
}

function ensureEmailEnabled(settings: EmailSettings): void {
  if (!settings.enabled) {
    throw new Error("Email integration is disabled.")
  }
  if (!settings.smtp.host || !settings.smtp.user || !settings.smtp.pass) {
    throw new Error("SMTP settings are incomplete.")
  }
  if (!settings.imap.host || !settings.imap.user || !settings.imap.pass) {
    throw new Error("IMAP settings are incomplete.")
  }
  if (!settings.from || settings.to.length === 0) {
    throw new Error("Email sender or recipient is missing.")
  }
}

export function canSendEmail(): boolean {
  const settings = getEmailSettings()
  if (!settings.enabled) return false
  if (!settings.smtp.host || !settings.smtp.user || !settings.smtp.pass) return false
  if (!settings.from || settings.to.length === 0) return false
  return true
}

export async function sendEmail({
  subject,
  text,
  attachments
}: {
  subject: string
  text: string
  attachments?: Array<{ path: string; filename?: string; contentType?: string }>
}): Promise<void> {
  const settings = getEmailSettings()
  ensureEmailEnabled(settings)

  const transporter = nodemailer.createTransport({
    host: settings.smtp.host,
    port: settings.smtp.port,
    secure: settings.smtp.secure,
    auth: {
      user: settings.smtp.user,
      pass: settings.smtp.pass
    }
  })

  await transporter.sendMail({
    from: settings.from,
    to: settings.to.join(", "),
    subject,
    text,
    attachments
  })
}

function extractThreadIdFromSubject(subject: string): string | null {
  const normalized = normalizeSubject(subject)
  const tag = getTaskTag()
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(`${escapedTag}\\s*\\[([^\\]]+)\\]`, "i")
  const match = normalized.match(regex)
  return match ? match[1] : null
}

export function isStartWorkSubject(subject: string): boolean {
  const normalized = normalizeSubject(subject)
  const tag = getTaskTag()
  if (!normalized.toLowerCase().includes(tag.toLowerCase())) {
    return false
  }
  if (extractThreadIdFromSubject(normalized)) {
    return false
  }
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(`^${escapedTag}\\s*startwork\\b`, "i")
  return regex.test(normalized)
}

export async function fetchUnreadEmailTasks(threadId?: string): Promise<EmailTask[]> {
  const settings = getEmailSettings()
  ensureEmailEnabled(settings)

  const client = new ImapFlow({
    host: settings.imap.host,
    port: settings.imap.port,
    secure: settings.imap.secure,
    auth: {
      user: settings.imap.user,
      pass: settings.imap.pass
    }
  })

  const tasks: EmailTask[] = []

  try {
    await client.connect()
    await client.mailboxOpen("INBOX")

    const tag = getTaskTag()
    const uids = await client.search({
      seen: false,
      header: { subject: tag }
    })

    if (!uids || uids.length === 0) {
      return tasks
    }

    for await (const message of client.fetch(uids as number[], { source: true, envelope: true })) {
      if (!message.source) continue
      try {
        const parsed = await simpleParser(message.source)
        const subject = parsed.subject ?? ""
        if (!subject.toLowerCase().includes(tag.toLowerCase())) {
          continue
        }
        if (isSelfSender(parsed, settings)) {
          continue
        }
        if (threadId) {
          const extracted = extractThreadIdFromSubject(subject)
          if (extracted !== threadId) {
            continue
          }
        }

        const from = parsed.from?.text ?? ""
        const text = parsed.text ?? ""
        const extractedThreadId = extractThreadIdFromSubject(subject)
        tasks.push({
          id: String(message.uid),
          subject,
          from,
          text,
          threadId: extractedThreadId
        })
      } finally {
        if (message.uid) {
          try {
            await client.messageFlagsAdd(message.uid, ["\\Seen"])
          } catch (markError) {
            console.warn("[EmailService] Failed to mark email as read:", markError)
          }
        }
      }
    }
  } finally {
    try {
      await client.logout()
    } catch {
      // ignore logout errors
    }
  }

  return tasks
}

export async function markEmailTaskRead(taskId: string): Promise<void> {
  const settings = getEmailSettings()
  ensureEmailEnabled(settings)

  const uid = Number.parseInt(taskId, 10)
  if (!Number.isFinite(uid)) {
    throw new Error(`Invalid email task id: ${taskId}`)
  }

  const client = new ImapFlow({
    host: settings.imap.host,
    port: settings.imap.port,
    secure: settings.imap.secure,
    auth: {
      user: settings.imap.user,
      pass: settings.imap.pass
    }
  })

  try {
    await client.connect()
    await client.mailboxOpen("INBOX")
    await client.messageFlagsAdd(uid, ["\\Seen"])
  } finally {
    try {
      await client.logout()
    } catch {
      // ignore logout errors
    }
  }
}

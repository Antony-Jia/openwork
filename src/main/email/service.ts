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
}

const OPENWORK_SUBJECT_TAG = "<OpenworkTask>"

function getEmailSettings(): EmailSettings {
  const settings = getSettings()
  return settings.email
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

export async function sendEmail({
  subject,
  text
}: {
  subject: string
  text: string
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
    text
  })
}

function extractThreadIdFromSubject(subject: string): string | null {
  const match = subject.match(/<OpenworkTask>\s*\[([^\]]+)\]/)
  return match ? match[1] : null
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

    const uids = await client.search({
      seen: false,
      header: ["subject", OPENWORK_SUBJECT_TAG]
    })

    if (uids.length === 0) {
      return tasks
    }

    for await (const message of client.fetch(uids, { source: true, envelope: true })) {
      if (!message.source) continue
      const parsed = await simpleParser(message.source)
      const subject = parsed.subject ?? ""
      if (!subject.includes(OPENWORK_SUBJECT_TAG)) {
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
      tasks.push({
        id: String(message.uid),
        subject,
        from,
        text
      })
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

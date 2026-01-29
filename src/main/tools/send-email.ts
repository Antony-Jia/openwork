import { existsSync } from "node:fs"
import { tool } from "langchain"
import { z } from "zod"
import { buildEmailSubject, sendEmail } from "../email/service"
import type { ToolDefinition } from "../types"

export const sendEmailDefinition: ToolDefinition = {
  name: "send_email",
  label: "Send Email",
  description: "Send an email using Email settings",
  requiresKey: false
}

const attachmentSchema = z.object({
  path: z.string().describe("Absolute path to attachment file"),
  filename: z.string().optional().describe("Optional filename override"),
  contentType: z.string().optional().describe("Optional MIME type")
})

const payloadSchema = z
  .object({
    threadId: z.string().optional(),
    suffix: z.string().optional(),
    subject: z.string().optional(),
    text: z.string().min(1),
    attachments: z.array(attachmentSchema).optional()
  })
  .refine((data) => !!data.subject || (!!data.threadId && !!data.suffix), {
    message: "Provide subject or threadId and suffix."
  })

export const sendEmailTool = tool(
  async ({
    threadId,
    suffix,
    subject,
    text,
    attachments
  }: z.infer<typeof payloadSchema>) => {
    const trimmedSubject = subject?.trim()
    const trimmedThreadId = threadId?.trim()
    const trimmedSuffix = suffix?.trim()
    const resolvedSubject =
      trimmedSubject ||
      buildEmailSubject(trimmedThreadId || "", trimmedSuffix || "").trim()

    if (!resolvedSubject || (!trimmedSubject && (!trimmedThreadId || !trimmedSuffix))) {
      throw new Error("Email subject is required.")
    }

    if (attachments?.length) {
      for (const attachment of attachments) {
        if (!attachment.path || !existsSync(attachment.path)) {
          throw new Error(`Attachment not found: ${attachment.path}`)
        }
      }
    }

    await sendEmail({
      subject: resolvedSubject,
      text,
      attachments
    })

    return { ok: true, subject: resolvedSubject }
  },
  {
    name: sendEmailDefinition.name,
    description: sendEmailDefinition.description,
    schema: payloadSchema
  }
)

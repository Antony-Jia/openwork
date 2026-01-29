export function buildEmailModePrompt(threadId: string): string {
  return [
    "Email conversation mode:",
    `- After completing the task, ALWAYS call the send_email tool with threadId="${threadId}".`,
    '- Set suffix to something like "Completed - <short summary of the task>".',
    "- Put the full completion content in the email body (not a placeholder).",
    "- If the user asked for files or artifacts, attach them using send_email.attachments.",
    "- Keep the chat response brief since the email is the primary delivery channel."
  ].join("\n")
}

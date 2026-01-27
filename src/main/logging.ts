export type LogDetails = Record<string, unknown>

function formatDetails(details?: LogDetails): LogDetails | undefined {
  if (!details || Object.keys(details).length === 0) return undefined
  return details
}

export function logEntry(scope: string, action: string, details?: LogDetails): void {
  const payload = formatDetails(details)
  if (payload) {
    console.log(`[Trace][${scope}] ${action} start`, payload)
  } else {
    console.log(`[Trace][${scope}] ${action} start`)
  }
}

export function logExit(
  scope: string,
  action: string,
  details?: LogDetails,
  durationMs?: number
): void {
  const payload = formatDetails({
    ...(details ?? {}),
    ...(durationMs !== undefined ? { durationMs } : {})
  })
  if (payload) {
    console.log(`[Trace][${scope}] ${action} end`, payload)
  } else {
    console.log(`[Trace][${scope}] ${action} end`)
  }
}

export async function withSpan<T>(
  scope: string,
  action: string,
  details: LogDetails | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now()
  logEntry(scope, action, details)
  try {
    const result = await fn()
    logExit(scope, action, { ok: true }, Date.now() - start)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"
    logExit(scope, action, { ok: false, error: message }, Date.now() - start)
    throw error
  }
}

export function summarizeArgs(args: Record<string, unknown> | null | undefined): LogDetails {
  if (!args) return { keyCount: 0, keys: [] }
  const keys = Object.keys(args)
  return { keyCount: keys.length, keys: keys.slice(0, 10) }
}

export function summarizeList(items: Array<string> | null | undefined, max = 10): LogDetails {
  const list = items ?? []
  return { count: list.length, names: list.slice(0, max) }
}

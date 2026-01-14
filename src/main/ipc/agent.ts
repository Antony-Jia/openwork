import { IpcMain, BrowserWindow } from 'electron'
import { HumanMessage } from '@langchain/core/messages'
import { createAgentRuntime } from '../agent/runtime'
import type { HITLDecision } from '../types'

// Track active runs for cancellation
const activeRuns = new Map<string, AbortController>()

export function registerAgentHandlers(ipcMain: IpcMain): void {
  console.log('[Agent] Registering agent handlers...')

  // Handle agent invocation with streaming
  ipcMain.on(
    'agent:invoke',
    async (event, { threadId, message }: { threadId: string; message: string }) => {
      const channel = `agent:stream:${threadId}`
      const window = BrowserWindow.fromWebContents(event.sender)

      console.log('[Agent] Received invoke request:', {
        threadId,
        message: message.substring(0, 50)
      })

      if (!window) {
        console.error('[Agent] No window found')
        return
      }

      const abortController = new AbortController()
      activeRuns.set(threadId, abortController)

      try {
        const agent = await createAgentRuntime()
        const humanMessage = new HumanMessage(message)

        // Stream with both modes:
        // - 'messages' for real-time token streaming
        // - 'values' for full state (todos, files, etc.)
        const stream = await agent.stream(
          { messages: [humanMessage] },
          {
            configurable: { thread_id: threadId },
            signal: abortController.signal,
            streamMode: ['messages', 'values'],
            recursionLimit: 1000
          }
        )

        for await (const chunk of stream) {
          if (abortController.signal.aborted) break

          console.log('[Agent] Stream chunk:', chunk)

          // With multiple stream modes, chunks are tuples: [mode, data]
          const [mode, data] = chunk as [string, unknown]

          // Forward raw stream events - transport layer handles parsing
          // Serialize to plain objects for IPC (class instances don't transfer)
          window.webContents.send(channel, {
            type: 'stream',
            mode,
            data: JSON.parse(JSON.stringify(data))
          })
        }

        // Send done event
        window.webContents.send(channel, { type: 'done' })
      } catch (error) {
        console.error('[Agent] Error:', error)
        window.webContents.send(channel, {
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      } finally {
        activeRuns.delete(threadId)
      }
    }
  )

  // Handle HITL interrupt response
  ipcMain.handle(
    'agent:interrupt',
    async (_event, { threadId, decision }: { threadId: string; decision: HITLDecision }) => {
      const agent = await createAgentRuntime()
      const config = { configurable: { thread_id: threadId } }

      if (decision.type === 'approve') {
        await agent.invoke(null, config)
      }
      // reject and edit handled by Command in future
    }
  )

  // Handle cancellation
  ipcMain.handle('agent:cancel', async (_event, { threadId }: { threadId: string }) => {
    const controller = activeRuns.get(threadId)
    if (controller) {
      controller.abort()
      activeRuns.delete(threadId)
    }
  })
}

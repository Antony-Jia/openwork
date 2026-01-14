import type { UseStreamTransport } from '@langchain/langgraph-sdk/react'
import type { StreamPayload, StreamEvent, IPCEvent, IPCStreamEvent } from '../../../types'
import type { Subagent } from '../types'

// Types for serialized LangGraph message chunks
// LangChain uses a special serialization format:
// { lc: 1, type: "constructor", id: ["langchain_core", "messages", "AIMessageChunk"], kwargs: { ... } }
interface SerializedMessageChunk {
  // LangChain serialization marker
  lc?: number
  type?: string
  // Class identifier array like ['langchain_core', 'messages', 'AIMessageChunk']
  id?: string[]
  // Actual message data is in kwargs
  kwargs?: {
    id?: string
    content?: string | Array<{ type: string; text?: string }>
    tool_calls?: Array<{
      id?: string
      name?: string
      args?: Record<string, unknown>
      type?: string
    }>
    tool_call_chunks?: Array<{
      id?: string
      name?: string
      args?: string
      index?: number
      type?: string
    }>
    tool_call_id?: string
    name?: string
  }
}

interface MessageMetadata {
  langgraph_node?: string
  langgraph_checkpoint_ns?: string
  checkpoint_ns?: string
  name?: string
}

// Accumulated tool call data (for streaming tool calls)
interface AccumulatedToolCall {
  id: string
  name: string
  args: string // Accumulated JSON string
}

/**
 * Custom transport for useStream that uses Electron IPC instead of HTTP.
 * This allows useStream to work seamlessly in an Electron app where the
 * LangGraph agent runs in the main process.
 */
export class ElectronIPCTransport implements UseStreamTransport {
  // Track current message ID for grouping tokens across chunks
  private currentMessageId: string | null = null

  // Track active subagents by their tool_call_id
  private activeSubagents: Map<string, Subagent> = new Map()

  // Track accumulated tool call chunks (for streaming tool calls)
  private accumulatedToolCalls: Map<string, AccumulatedToolCall> = new Map()

  async stream(payload: StreamPayload): Promise<AsyncGenerator<StreamEvent>> {
    // Reset state for new stream
    this.currentMessageId = null
    this.activeSubagents.clear()
    this.accumulatedToolCalls.clear()
    // Extract thread ID from config
    const threadId = payload.config?.configurable?.thread_id
    if (!threadId) {
      return this.createErrorGenerator('MISSING_THREAD_ID', 'Thread ID is required')
    }

    // Extract the message content from input
    const input = payload.input as
      | { messages?: Array<{ content: string; type: string }> }
      | null
      | undefined
    const messages = input?.messages ?? []
    const lastHumanMessage = messages.find((m) => m.type === 'human')
    const messageContent = lastHumanMessage?.content ?? ''

    if (!messageContent) {
      return this.createErrorGenerator('MISSING_MESSAGE', 'Message content is required')
    }

    // Create an async generator that bridges IPC events
    return this.createStreamGenerator(threadId, messageContent, payload.command, payload.signal)
  }

  private async *createErrorGenerator(code: string, message: string): AsyncGenerator<StreamEvent> {
    yield {
      event: 'error',
      data: { error: code, message }
    }
  }

  private async *createStreamGenerator(
    threadId: string,
    message: string,
    command: unknown,
    signal: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    // Create a queue to buffer events from IPC
    const eventQueue: StreamEvent[] = []
    let resolveNext: ((value: StreamEvent | null) => void) | null = null
    let isDone = false
    let hasError = false

    // Generate a run ID for this stream
    const runId = crypto.randomUUID()

    // Emit metadata event first to establish run context
    yield {
      event: 'metadata',
      data: {
        run_id: runId,
        thread_id: threadId
      }
    }

    // Start the stream via IPC
    const cleanup = window.api.agent.streamAgent(threadId, message, command, (ipcEvent) => {
      // Convert IPC events to SDK format
      const sdkEvents = this.convertToSDKEvents(ipcEvent as IPCEvent, threadId)

      for (const sdkEvent of sdkEvents) {
        console.log('[Transport] Converted event:', sdkEvent)

        if (sdkEvent.event === 'done' || sdkEvent.event === 'error') {
          isDone = true
          hasError = sdkEvent.event === 'error'
        }

        // If someone is waiting for the next event, resolve immediately
        if (resolveNext) {
          const resolve = resolveNext
          resolveNext = null
          resolve(sdkEvent)
        } else {
          // Otherwise queue the event
          eventQueue.push(sdkEvent)
        }
      }
    })

    // Handle abort signal
    if (signal) {
      signal.addEventListener('abort', () => {
        cleanup()
        isDone = true
        if (resolveNext) {
          const resolve = resolveNext
          resolveNext = null
          resolve(null)
        }
      })
    }

    // Yield events as they come in
    while (!isDone || eventQueue.length > 0) {
      // Check for queued events first
      if (eventQueue.length > 0) {
        const event = eventQueue.shift()!
        if (event.event === 'done') {
          break
        }
        if (event.event !== 'error' || hasError) {
          yield event
        }
        if (hasError) {
          break
        }
        continue
      }

      // Wait for the next event
      const event = await new Promise<StreamEvent | null>((resolve) => {
        resolveNext = resolve
      })

      if (event === null) {
        break
      }

      if (event.event === 'done') {
        break
      }

      yield event

      if (event.event === 'error') {
        break
      }
    }
  }

  /**
   * Convert IPC events to LangGraph SDK format
   * Returns an array since a single IPC event may produce multiple SDK events
   */
  private convertToSDKEvents(event: IPCEvent, threadId: string): StreamEvent[] {
    const events: StreamEvent[] = []

    console.log('[Transport] convertToSDKEvents:', { type: event.type })

    switch (event.type) {
      // Raw stream events from LangGraph - parse and convert
      case 'stream': {
        const streamEvents = this.processStreamEvent(event)
        console.log('[Transport] processStreamEvent returned:', streamEvents.length, 'events')
        events.push(...streamEvents)
        break
      }

      // Legacy: Token streaming for real-time typing effect
      case 'token':
        events.push({
          event: 'messages',
          data: [
            { id: event.messageId, type: 'ai', content: event.token },
            { langgraph_node: 'agent' }
          ]
        })
        break

      // Legacy: Tool call chunks
      case 'tool_call':
        events.push({
          event: 'custom',
          data: {
            type: 'tool_call',
            messageId: event.messageId,
            tool_calls: event.tool_calls
          }
        })
        break

      // Legacy: Full state values
      case 'values': {
        const { todos, files, workspacePath, subagents, interrupt } = event.data

        // Only emit values event if todos is defined
        // Avoid emitting { todos: [] } when undefined, which would wipe out existing todos
        if (todos !== undefined) {
          events.push({
            event: 'values',
            data: { todos }
          })
        }

        // Emit files/workspace
        if (files) {
          const filesList = Array.isArray(files)
            ? files
            : Object.entries(files).map(([path, data]) => ({
                path,
                is_dir: false,
                size:
                  typeof (data as { content?: string })?.content === 'string'
                    ? (data as { content: string }).content.length
                    : undefined
              }))

          if (filesList.length) {
            events.push({
              event: 'custom',
              data: { type: 'workspace', files: filesList, path: workspacePath || '/' }
            })
          }
        }

        // Emit subagents
        if (subagents?.length) {
          events.push({
            event: 'custom',
            data: { type: 'subagents', subagents }
          })
        }

        // Emit interrupt
        if (interrupt) {
          events.push({
            event: 'custom',
            data: {
              type: 'interrupt',
              request: {
                id: interrupt.id || crypto.randomUUID(),
                tool_call: interrupt.tool_call,
                allowed_decisions: ['approve', 'reject', 'edit']
              }
            }
          })
        }
        break
      }

      case 'error':
        events.push({
          event: 'error',
          data: { error: 'STREAM_ERROR', message: event.error }
        })
        break

      case 'done':
        events.push({
          event: 'done',
          data: { thread_id: threadId }
        })
        break
    }

    console.log(
      '[Transport] convertToSDKEvents total:',
      events.length,
      'events',
      events.map((e) => e.event)
    )
    return events
  }

  /**
   * Process raw LangGraph stream events (mode + data tuples)
   */
  private processStreamEvent(event: IPCStreamEvent): StreamEvent[] {
    const events: StreamEvent[] = []
    const { mode, data } = event

    console.log('[Transport] processStreamEvent:', { mode, dataType: typeof data })

    if (mode === 'messages') {
      // Messages mode returns [message, metadata] tuples
      const [msgChunk, metadata] = data as [SerializedMessageChunk, MessageMetadata]

      // LangChain serialization: actual data is in kwargs
      const kwargs = msgChunk?.kwargs || {}
      const classId = Array.isArray(msgChunk?.id) ? msgChunk.id : []
      const className = classId[classId.length - 1] || ''

      console.log('[Transport] Messages mode chunk:', {
        className,
        hasContent: !!kwargs.content,
        tool_calls_count: kwargs.tool_calls?.length,
        tool_call_chunks_count: kwargs.tool_call_chunks?.length,
        name: kwargs.name,
        tool_call_id: kwargs.tool_call_id
      })

      // Debug logging
      if (kwargs.tool_calls?.length || kwargs.tool_call_chunks?.length) {
        console.log('[Transport] Message with tool calls:', {
          className,
          tool_calls: kwargs.tool_calls,
          tool_call_chunks_count: kwargs.tool_call_chunks?.length,
          name: kwargs.name,
          tool_call_id: kwargs.tool_call_id
        })
      }

      // Check if this is a ToolMessage (class name contains 'ToolMessage')
      const isToolMessage = className.includes('ToolMessage') && !!kwargs.tool_call_id

      // Check if this is an AI message (class name contains 'AI')
      const isAIMessage = className.includes('AI') || className.includes('AIMessageChunk')

      if (isAIMessage) {
        const content = this.extractContent(kwargs.content)

        if (content) {
          // Track message ID for grouping tokens
          const msgId = kwargs.id || this.currentMessageId || crypto.randomUUID()
          this.currentMessageId = msgId

          console.log('[Transport] Processing token:', content.substring(0, 50))
          events.push({
            event: 'messages',
            data: [
              { id: msgId, type: 'ai', content },
              { langgraph_node: metadata?.langgraph_node || 'agent' }
            ]
          })
        }

        // Handle tool call chunks (streaming) - these have args as strings
        if (kwargs.tool_call_chunks?.length) {
          const subagentEvents = this.processToolCallChunks(kwargs.tool_call_chunks)
          events.push(...subagentEvents)

          events.push({
            event: 'custom',
            data: {
              type: 'tool_call',
              messageId: this.currentMessageId,
              tool_calls: kwargs.tool_call_chunks
            }
          })
        }

        // Handle complete tool calls (non-streaming) - these have args as objects
        if (kwargs.tool_calls?.length) {
          const subagentEvents = this.processCompletedToolCalls(kwargs.tool_calls)
          events.push(...subagentEvents)
        }
      }

      // Handle ToolMessage - signals subagent completion
      if (isToolMessage && kwargs.tool_call_id && kwargs.name === 'task') {
        console.log('[Transport] ToolMessage detected for:', kwargs.tool_call_id)
        const completionEvents = this.processToolMessage(kwargs.tool_call_id)
        events.push(...completionEvents)
      }
    } else if (mode === 'values') {
      console.log('[Transport] Values mode - processing state')

      // Values mode returns full state with serialized LangChain messages
      // Messages are in LangChain serialization format: { lc, type, id: [...], kwargs: { ... } }
      interface ValuesModeMessage {
        lc?: number
        type?: string
        id?: string[] // Class identifier like ['langchain_core', 'messages', 'AIMessage']
        kwargs?: {
          id?: string
          content?: string | Array<{ type: string; text?: string }>
          name?: string
          tool_calls?: Array<{
            id?: string
            name?: string
            args?: Record<string, unknown>
            type?: string
          }>
          tool_call_id?: string
        }
      }

      const state = data as {
        messages?: ValuesModeMessage[]
        todos?: { id?: string; content?: string; status?: string }[]
        files?: Record<string, unknown> | Array<{ path: string; is_dir?: boolean; size?: number }>
        workspacePath?: string
        subagents?: Array<{
          id?: string
          name?: string
          description?: string
          status?: string
          startedAt?: Date | string
          completedAt?: Date | string
        }>
        __interrupt__?: { id?: string; tool_call?: unknown }
      }

      // Process messages in values mode to extract subagents
      if (state.messages) {
        console.log('[Transport] Values mode has', state.messages.length, 'messages')
        for (const msg of state.messages) {
          const kwargs = msg.kwargs || {}
          const classId = Array.isArray(msg.id) ? msg.id : []
          const className = classId[classId.length - 1] || ''

          console.log('[Transport] Values message:', {
            className,
            tool_calls_count: kwargs.tool_calls?.length,
            tool_call_id: kwargs.tool_call_id
          })

          // Check for task tool calls in AI messages
          if (kwargs.tool_calls?.length) {
            console.log('[Transport] Found message with tool_calls:', kwargs.tool_calls)
            for (const toolCall of kwargs.tool_calls) {
              if (
                toolCall.name === 'task' &&
                toolCall.id &&
                !this.activeSubagents.has(toolCall.id)
              ) {
                const args = toolCall.args || {}
                if (args.subagent_type || args.description) {
                  const subagent = this.createSubagentFromTask(toolCall.id, args)
                  this.activeSubagents.set(toolCall.id, subagent)
                  console.log('[Transport] Detected subagent from values mode:', subagent)
                }
              }
            }
          }

          // Check for ToolMessage (subagent completion)
          if (className.includes('ToolMessage') && kwargs.tool_call_id && kwargs.name === 'task') {
            const subagent = this.activeSubagents.get(kwargs.tool_call_id)
            if (subagent && subagent.status === 'running') {
              subagent.status = 'completed'
              subagent.completedAt = new Date()
              console.log('[Transport] Subagent completed from values mode:', subagent)
            }
          }
        }

        // Emit subagent update if we have any
        if (this.activeSubagents.size > 0) {
          events.push(this.createSubagentEvent())
        }
      }

      // Transform messages from LangChain serialization format
      // Filter out human messages since they're already shown from user input
      const transformedMessages = state.messages
        ?.filter((msg) => {
          const classId = Array.isArray(msg.id) ? msg.id : []
          const className = classId[classId.length - 1] || ''
          // Filter out HumanMessage
          return !className.includes('Human')
        })
        .map((msg) => {
          const kwargs = msg.kwargs || {}
          const classId = Array.isArray(msg.id) ? msg.id : []
          const className = classId[classId.length - 1] || ''

          // Determine message type from class name
          const type: 'ai' | 'tool' = className.includes('Tool') ? 'tool' : 'ai'
          const content = this.extractContent(kwargs.content)

          return {
            id: kwargs.id || crypto.randomUUID(),
            type,
            content
          }
        })

      events.push({
        event: 'values',
        data: {
          messages: transformedMessages,
          todos: state.todos,
          workspacePath: state.workspacePath
        }
      })

      // Emit files/workspace
      if (state.files) {
        const filesList = Array.isArray(state.files)
          ? state.files
          : Object.entries(state.files).map(([path, fileData]) => ({
              path,
              is_dir: false,
              size:
                typeof (fileData as { content?: string })?.content === 'string'
                  ? (fileData as { content: string }).content.length
                  : undefined
            }))

        if (filesList.length) {
          events.push({
            event: 'custom',
            data: { type: 'workspace', files: filesList, path: state.workspacePath || '/' }
          })
        }
      }

      // Emit subagents
      if (state.subagents?.length) {
        events.push({
          event: 'custom',
          data: { type: 'subagents', subagents: state.subagents }
        })
      }

      // Emit interrupt
      if (state.__interrupt__) {
        events.push({
          event: 'custom',
          data: {
            type: 'interrupt',
            request: {
              id: state.__interrupt__.id || crypto.randomUUID(),
              tool_call: state.__interrupt__.tool_call,
              allowed_decisions: ['approve', 'reject', 'edit']
            }
          }
        })
      }
    }

    return events
  }

  /**
   * Extract text content from message content (string or content blocks)
   */
  private extractContent(
    content: string | Array<{ type: string; text?: string }> | undefined
  ): string {
    if (typeof content === 'string') {
      return content
    }
    if (Array.isArray(content)) {
      return content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text)
        .join('')
    }
    return ''
  }

  /**
   * Process streaming tool call chunks and detect task subagent invocations
   * Tool calls are streamed incrementally, so we accumulate args until we have enough
   */
  private processToolCallChunks(
    chunks: Array<{ id?: string; name?: string; args?: string }>
  ): StreamEvent[] {
    const events: StreamEvent[] = []

    for (const chunk of chunks) {
      if (!chunk.id) continue

      // Get or create accumulated tool call
      let accumulated = this.accumulatedToolCalls.get(chunk.id)
      if (!accumulated) {
        accumulated = { id: chunk.id, name: chunk.name || '', args: '' }
        this.accumulatedToolCalls.set(chunk.id, accumulated)
      }

      // Update name if provided
      if (chunk.name) {
        accumulated.name = chunk.name
      }

      // Accumulate args
      if (chunk.args) {
        accumulated.args += chunk.args
      }

      // Check if this is a "task" tool call and try to parse args
      if (accumulated.name === 'task') {
        try {
          const args = JSON.parse(accumulated.args)
          // Only process if we haven't already created a subagent for this tool call
          if (!this.activeSubagents.has(chunk.id) && args.subagent_type) {
            const subagent = this.createSubagentFromTask(chunk.id, args)
            this.activeSubagents.set(chunk.id, subagent)
            events.push(this.createSubagentEvent())
            console.log('[Transport] Detected subagent task:', subagent)
          }
        } catch {
          // Args not complete yet, continue accumulating
        }
      }
    }

    return events
  }

  /**
   * Process completed tool calls (non-streaming) and detect task subagent invocations
   */
  private processCompletedToolCalls(
    toolCalls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>
  ): StreamEvent[] {
    const events: StreamEvent[] = []

    for (const toolCall of toolCalls) {
      if (!toolCall.id || !toolCall.name) continue

      // Check if this is a "task" tool call
      if (toolCall.name === 'task' && !this.activeSubagents.has(toolCall.id)) {
        const args = toolCall.args || {}
        if (args.subagent_type || args.description) {
          const subagent = this.createSubagentFromTask(toolCall.id, args)
          this.activeSubagents.set(toolCall.id, subagent)
          events.push(this.createSubagentEvent())
          console.log('[Transport] Detected subagent task (complete):', subagent)
        }
      }
    }

    return events
  }

  /**
   * Process a ToolMessage which signals subagent completion
   */
  private processToolMessage(toolCallId: string): StreamEvent[] {
    const events: StreamEvent[] = []

    // Check if this tool_call_id corresponds to an active subagent
    const subagent = this.activeSubagents.get(toolCallId)
    if (subagent) {
      subagent.status = 'completed'
      subagent.completedAt = new Date()
      events.push(this.createSubagentEvent())
      console.log('[Transport] Subagent completed:', subagent)
    }

    return events
  }

  /**
   * Create a Subagent object from task tool call args
   */
  private createSubagentFromTask(toolCallId: string, args: Record<string, unknown>): Subagent {
    const subagentType = (args.subagent_type as string) || 'general-purpose'
    const description = (args.description as string) || 'Executing task...'

    // Generate a friendly name from the subagent type
    const nameMap: Record<string, string> = {
      'general-purpose': 'General Purpose Agent',
      'correctness-checker': 'Correctness Checker',
      'final-reviewer': 'Final Reviewer',
      'code-reviewer': 'Code Reviewer',
      research: 'Research Agent'
    }

    return {
      id: toolCallId,
      toolCallId,
      name: nameMap[subagentType] || this.formatSubagentName(subagentType),
      description,
      status: 'running',
      startedAt: new Date(),
      subagentType
    }
  }

  /**
   * Format a subagent type string into a display name
   */
  private formatSubagentName(subagentType: string): string {
    return subagentType
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  /**
   * Create a custom event with current subagent state
   */
  private createSubagentEvent(): StreamEvent {
    return {
      event: 'custom',
      data: {
        type: 'subagents',
        subagents: Array.from(this.activeSubagents.values())
      }
    }
  }
}

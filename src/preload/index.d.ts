import type {
  Thread,
  ModelConfig,
  Provider,
  StreamEvent,
  HITLDecision,
  SubagentConfig,
  SkillItem,
  ToolInfo,
  ToolKeyUpdateParams,
  ToolEnableUpdateParams,
  MiddlewareDefinition,
  McpServerConfig,
  McpServerCreateParams,
  McpServerListItem,
  McpServerStatus,
  McpServerUpdateParams,
  McpToolInfo,
  AppSettings,
  SettingsUpdateParams
} from "../main/types"

interface ElectronAPI {
  ipcRenderer: {
    send: (channel: string, ...args: unknown[]) => void
    on: (channel: string, listener: (...args: unknown[]) => void) => () => void
    once: (channel: string, listener: (...args: unknown[]) => void) => void
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  }
  process: {
    platform: NodeJS.Platform
    versions: NodeJS.ProcessVersions
  }
}

interface CustomAPI {
  agent: {
    invoke: (
      threadId: string,
      message: string,
      onEvent: (event: StreamEvent) => void,
      modelId?: string
    ) => () => void
    streamAgent: (
      threadId: string,
      message: string,
      command: unknown,
      onEvent: (event: StreamEvent) => void,
      modelId?: string
    ) => () => void
    interrupt: (
      threadId: string,
      decision: HITLDecision,
      onEvent?: (event: StreamEvent) => void
    ) => () => void
    cancel: (threadId: string) => Promise<void>
  }
  threads: {
    list: () => Promise<Thread[]>
    get: (threadId: string) => Promise<Thread | null>
    create: (metadata?: Record<string, unknown>) => Promise<Thread>
    update: (threadId: string, updates: Partial<Thread>) => Promise<Thread>
    delete: (threadId: string) => Promise<void>
    getHistory: (threadId: string) => Promise<unknown[]>
    generateTitle: (message: string) => Promise<string>
  }
  models: {
    list: () => Promise<ModelConfig[]>
    listProviders: () => Promise<Provider[]>
    getDefault: () => Promise<string>
    deleteApiKey: (provider: string) => Promise<void>
    setDefault: (modelId: string) => Promise<void>
    setApiKey: (provider: string, apiKey: string) => Promise<void>
    getApiKey: (provider: string) => Promise<string | null>
  }
  provider: {
    getConfig: () => Promise<unknown>
    setConfig: (config: unknown) => Promise<void>
  }
  subagents: {
    list: () => Promise<SubagentConfig[]>
    create: (input: Omit<SubagentConfig, "id">) => Promise<SubagentConfig>
    update: (id: string, updates: Partial<Omit<SubagentConfig, "id">>) => Promise<SubagentConfig>
    delete: (id: string) => Promise<void>
  }
  skills: {
    list: () => Promise<SkillItem[]>
    create: (input: { name: string; description: string; content?: string }) => Promise<SkillItem>
    install: (input: { path: string }) => Promise<SkillItem>
    delete: (name: string) => Promise<void>
    setEnabled: (input: { name: string; enabled: boolean }) => Promise<SkillItem>
    getContent: (name: string) => Promise<string>
    saveContent: (input: { name: string; content: string }) => Promise<SkillItem>
  }
  tools: {
    list: () => Promise<ToolInfo[]>
    setKey: (input: ToolKeyUpdateParams) => Promise<ToolInfo>
    setEnabled: (input: ToolEnableUpdateParams) => Promise<ToolInfo>
  }
  middleware: {
    list: () => Promise<MiddlewareDefinition[]>
  }
  docker: {
    check: () => Promise<{ available: boolean; error?: string }>
  }
  settings: {
    get: () => Promise<AppSettings>
    update: (input: SettingsUpdateParams) => Promise<AppSettings>
  }
  mcp: {
    list: () => Promise<McpServerListItem[]>
    tools: () => Promise<McpToolInfo[]>
    create: (input: McpServerCreateParams) => Promise<McpServerConfig>
    update: (input: McpServerUpdateParams) => Promise<McpServerConfig>
    delete: (id: string) => Promise<void>
    start: (id: string) => Promise<McpServerStatus>
    stop: (id: string) => Promise<McpServerStatus>
  }
  workspace: {
    get: (threadId?: string) => Promise<string | null>
    set: (threadId: string | undefined, path: string | null) => Promise<string | null>
    select: (threadId?: string) => Promise<string | null>
    loadFromDisk: (threadId: string) => Promise<{
      success: boolean
      files: Array<{
        path: string
        is_dir: boolean
        size?: number
        modified_at?: string
      }>
      workspacePath?: string
      mounts?: Array<{
        hostPath: string
        containerPath: string
        readOnly?: boolean
      }>
      error?: string
    }>
    readFile: (
      threadId: string,
      filePath: string
    ) => Promise<{
      success: boolean
      content?: string
      size?: number
      modified_at?: string
      error?: string
    }>
    readBinaryFile: (
      threadId: string,
      filePath: string
    ) => Promise<{
      success: boolean
      content?: string
      size?: number
      modified_at?: string
      error?: string
    }>
    onFilesChanged: (
      callback: (data: { threadId: string; workspacePath: string }) => void
    ) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}

import type {
  Thread,
  ModelConfig,
  Provider,
  ProviderState,
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
  SettingsUpdateParams,
  DockerConfig,
  DockerSessionStatus,
  RalphLogEntry,
  ContentBlock,
  Attachment,
  LoopConfig
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
      message: string | ContentBlock[],
      onEvent: (event: StreamEvent) => void,
      modelId?: string
    ) => () => void
    streamAgent: (
      threadId: string,
      message: string | ContentBlock[],
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
    getRalphLogTail: (threadId: string, limit?: number) => Promise<RalphLogEntry[]>
    generateTitle: (message: string) => Promise<string>
  }
  loop: {
    getConfig: (threadId: string) => Promise<LoopConfig | null>
    updateConfig: (threadId: string, config: LoopConfig) => Promise<LoopConfig>
    start: (threadId: string) => Promise<LoopConfig>
    stop: (threadId: string) => Promise<LoopConfig>
    status: (threadId: string) => Promise<{ running: boolean; queueLength: number }>
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
    getConfig: () => Promise<ProviderState | null>
    setConfig: (config: ProviderState) => Promise<void>
  }
  attachments: {
    pick: (input: { kind: "image" }) => Promise<Attachment[] | null>
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
    getConfig: () => Promise<DockerConfig>
    setConfig: (config: DockerConfig) => Promise<DockerConfig>
    status: () => Promise<DockerSessionStatus>
    enter: () => Promise<DockerSessionStatus>
    exit: () => Promise<DockerSessionStatus>
    restart: () => Promise<DockerSessionStatus>
    runtimeConfig: () => Promise<{ config: DockerConfig | null; containerId: string | null }>
    selectMountPath: (currentPath?: string) => Promise<string | null>
    mountFiles: () => Promise<{
      success: boolean
      files: Array<{
        path: string
        is_dir: boolean
        size?: number
        modified_at?: string
      }>
      mounts?: Array<{
        hostPath: string
        containerPath: string
        readOnly?: boolean
      }>
      error?: string
    }>
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

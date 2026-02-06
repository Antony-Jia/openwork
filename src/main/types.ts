// Thread types matching langgraph-api
export type ThreadStatus = "idle" | "busy" | "interrupted" | "error"
export type ThreadMode = "default" | "ralph" | "email" | "loop"

export type LoopTriggerType = "schedule" | "api" | "file"
export type LoopConditionOp = "equals" | "contains" | "truthy"

export interface LoopQueueConfig {
  policy: "strict"
  mergeWindowSec: number
}

export interface LoopScheduleTrigger {
  type: "schedule"
  cron: string
}

export interface LoopApiTrigger {
  type: "api"
  cron: string
  url: string
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  headers?: Record<string, string>
  bodyJson?: Record<string, unknown> | null
  jsonPath: string
  op: LoopConditionOp
  expected?: string
  timeoutMs?: number
}

export interface LoopFileTrigger {
  type: "file"
  watchPath: string
  suffixes?: string[]
  previewMaxLines: number
  previewMaxBytes: number
}

export type LoopTrigger = LoopScheduleTrigger | LoopApiTrigger | LoopFileTrigger

export interface LoopConfig {
  enabled: boolean
  contentTemplate: string
  trigger: LoopTrigger
  queue: LoopQueueConfig
  lastRunAt?: string
  lastError?: string | null
  nextRunAt?: string | null
}

// =============================================================================
// IPC Handler Parameter Types
// =============================================================================

// Agent IPC
export interface AgentInvokeParams {
  threadId: string
  message: string | ContentBlock[]
  modelId?: string
}

export interface AgentResumeParams {
  threadId: string
  command: { resume?: { decision?: string } }
  modelId?: string
}

export interface AgentInterruptParams {
  threadId: string
  decision: HITLDecision
}

export interface AgentCancelParams {
  threadId: string
}

// Thread IPC
export interface ThreadUpdateParams {
  threadId: string
  updates: Partial<Thread>
}

// Workspace IPC
export interface WorkspaceSetParams {
  threadId?: string
  path: string | null
}

export interface WorkspaceLoadParams {
  threadId: string
}

export interface WorkspaceFileParams {
  threadId: string
  filePath: string
}

// Model IPC
export interface SetApiKeyParams {
  provider: string
  apiKey: string
}

// =============================================================================

export interface Thread {
  thread_id: string
  created_at: Date
  updated_at: Date
  metadata?: Record<string, unknown>
  status: ThreadStatus
  thread_values?: Record<string, unknown>
  title?: string
}

export interface RalphState {
  phase: "init" | "awaiting_confirm" | "running" | "done"
  iterations?: number
}

export type RalphLogRole = "user" | "ai" | "tool" | "tool_call"

export interface RalphLogEntry {
  id: string
  ts: string
  threadId: string
  runId: string
  iteration?: number
  phase?: RalphState["phase"]
  role: RalphLogRole
  content: string
  messageId?: string
  toolCallId?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
}

// Run types
export type RunStatus = "pending" | "running" | "error" | "success" | "interrupted"

export interface Run {
  run_id: string
  thread_id: string
  assistant_id?: string
  created_at: Date
  updated_at: Date
  status: RunStatus
  metadata?: Record<string, unknown>
}

// Provider configuration
export type ProviderId = "anthropic" | "openai" | "google" | "ollama"

export interface Provider {
  id: ProviderId
  name: string
  hasApiKey: boolean
}

// Model configuration
export interface ModelConfig {
  id: string
  name: string
  provider: ProviderId
  model: string
  description?: string
  available: boolean
}

// New simplified provider configuration types
export type SimpleProviderId = "ollama" | "openai-compatible" | "multimodal"

export interface DockerMount {
  hostPath: string
  containerPath: string
  readOnly?: boolean
}

export interface DockerPort {
  host: number
  container: number
  protocol?: "tcp" | "udp"
}

export interface DockerResources {
  cpu?: number
  memoryMb?: number
}

export interface DockerConfig {
  enabled: boolean
  image: string
  mounts: DockerMount[]
  resources?: DockerResources
  ports?: DockerPort[]
}

export interface DockerSessionStatus {
  enabled: boolean
  running: boolean
  containerId?: string
  containerName?: string
  error?: string
}

export interface OllamaConfig {
  type: "ollama"
  url: string // e.g., "http://localhost:11434"
  model: string // e.g., "qwen2.5:7b"
}

export interface OpenAICompatibleConfig {
  type: "openai-compatible"
  url: string // e.g., "https://api.deepseek.com"
  apiKey: string
  model: string // e.g., "deepseek-chat"
}

export interface MultimodalConfig {
  type: "multimodal"
  url: string // e.g., "https://api.openai.com/v1"
  apiKey: string
  model: string // e.g., "gpt-4o"
}

export type ProviderConfig = OllamaConfig | OpenAICompatibleConfig | MultimodalConfig

export interface ProviderState {
  active: SimpleProviderId
  configs: Partial<Record<SimpleProviderId, ProviderConfig>>
}

// Custom subagent configuration
export interface SubagentConfig {
  id: string
  name: string
  description: string
  systemPrompt: string
  provider?: SimpleProviderId
  model?: string
  tools?: string[]
  middleware?: string[]
  skills?: string[]
  interruptOn?: boolean
  enabled?: boolean
}

// Skill metadata for management UI
export interface SkillItem {
  name: string
  description: string
  path: string
  source?: string
  enabled: boolean
}

export interface ToolDefinition {
  name: string
  label: string
  description: string
  keyLabel?: string
  envVar?: string
  requiresKey?: boolean
}

export interface ToolInfo extends ToolDefinition {
  hasKey: boolean
  enabled: boolean
}

export interface ToolKeyUpdateParams {
  name: string
  key: string | null
}

export interface ToolEnableUpdateParams {
  name: string
  enabled: boolean
}

// App settings
export interface EmailSmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}

export interface EmailImapConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}

export interface EmailSettings {
  enabled: boolean
  from: string
  to: string[]
  smtp: EmailSmtpConfig
  imap: EmailImapConfig
  taskTag: string
  pollIntervalSec: number
}

export interface SpeechSttSettings {
  url: string
  headers?: Record<string, string>
  language?: string
}

export interface SpeechTtsSettings {
  url: string
  headers?: Record<string, string>
  voice?: string
}

export interface SpeechSettings {
  stt: SpeechSttSettings
  tts: SpeechTtsSettings
}

export interface AppSettings {
  ralphIterations: number
  email: EmailSettings
  speech: SpeechSettings
  defaultWorkspacePath?: string | null
  dockerConfig?: DockerConfig
}

export interface SettingsUpdateParams {
  updates: Partial<AppSettings>
}

export interface SpeechSttRequest {
  audioBase64: string
  mimeType: string
  language?: string
}

export interface SpeechSttResponse {
  text: string
}

export interface SpeechTtsRequest {
  text: string
  voice?: string
}

export interface SpeechTtsResponse {
  audioBase64: string
  mimeType: string
}

// MCP configuration
export type McpServerMode = "local" | "remote"

export interface McpServerConfig {
  id: string
  name: string
  mode: McpServerMode
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  autoStart?: boolean
  enabled?: boolean
}

export interface McpServerStatus {
  running: boolean
  toolsCount: number
  lastError?: string | null
}

export interface McpServerListItem {
  config: McpServerConfig
  status: McpServerStatus
}

export interface McpServerCreateParams extends Omit<McpServerConfig, "id"> {}

export interface McpServerUpdateParams {
  id: string
  updates: Partial<Omit<McpServerConfig, "id">>
}

export interface McpToolInfo {
  serverId: string
  serverName: string
  toolName: string
  fullName: string
  description?: string
}

export interface MiddlewareDefinition {
  id: string
  label: string
  description?: string
}

// Subagent types (from deepagentsjs)
export interface Subagent {
  id: string
  name: string
  description: string
  status: "pending" | "running" | "completed" | "failed"
  startedAt?: Date
  completedAt?: Date
}

// Stream events from agent
export type StreamEvent =
  | { type: "message"; message: Message }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "tool_result"; toolResult: ToolResult }
  | { type: "interrupt"; request: HITLRequest }
  | { type: "token"; token: string }
  | { type: "todos"; todos: Todo[] }
  | { type: "workspace"; files: FileInfo[]; path: string }
  | { type: "subagents"; subagents: Subagent[] }
  | { type: "done"; result: unknown }
  | { type: "error"; error: string }

export interface Message {
  id: string
  role: "user" | "assistant" | "system" | "tool"
  content: string | ContentBlock[]
  tool_calls?: ToolCall[]
  created_at: Date
}

export interface ContentBlock {
  type: "text" | "image" | "image_url" | "tool_use" | "tool_result"
  text?: string
  image_url?: { url: string }
  tool_use_id?: string
  name?: string
  input?: unknown
  content?: string
}

export type Attachment =
  | { kind: "image"; name: string; mimeType: string; dataUrl: string; size: number }
  | { kind: "file"; name: string; mimeType: string; size: number; dataUrl?: string }

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolResult {
  tool_call_id: string
  content: string | unknown
  is_error?: boolean
}

// Human-in-the-loop
export interface HITLRequest {
  id: string
  tool_call: ToolCall
  allowed_decisions: HITLDecision["type"][]
}

export interface HITLDecision {
  type: "approve" | "reject" | "edit"
  tool_call_id: string
  edited_args?: Record<string, unknown>
  feedback?: string
}

// Todo types (from deepagentsjs)
export interface Todo {
  id: string
  content: string
  status: "pending" | "in_progress" | "completed" | "cancelled"
}

// File types (from deepagentsjs backends)
export interface FileInfo {
  path: string
  is_dir?: boolean
  size?: number
  modified_at?: string
}

export interface GrepMatch {
  path: string
  line: number
  text: string
}

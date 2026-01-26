/* eslint-disable @typescript-eslint/no-unused-vars */
import { createDeepAgent } from "deepagents"
import { getThreadCheckpointPath, getProviderConfig } from "../storage"
import { ChatOpenAI } from "@langchain/openai"
import { SqlJsSaver } from "../checkpointer/sqljs-saver"
import { LocalSandbox } from "./local-sandbox"
import { listSubagents } from "../subagents"
import { getSkillsRoot } from "../skills"
import { getEnabledToolInstances, resolveToolInstancesByName } from "../tools/service"
import { resolveMiddlewareById } from "../middleware/registry"
import { createDockerTools } from "../tools/docker-tools"
import type { DockerConfig } from "../types"

import type * as _lcTypes from "langchain"
import type * as _lcMessages from "@langchain/core/messages"
import type * as _lcLanggraph from "@langchain/langgraph"
import type * as _lcZodTypes from "@langchain/core/utils/types"

import { BASE_SYSTEM_PROMPT } from "./system-prompt"

/**
 * Generate the full system prompt for the agent.
 *
 * @param workspacePath - The workspace path the agent is operating in
 * @returns The complete system prompt
 */
function getSystemPrompt(workspacePath: string, dockerConfig?: DockerConfig): string {
  const workingDirSection = `
### File System and Paths

**IMPORTANT - Path Handling:**
- All file paths use fully qualified absolute system paths
- The workspace root is: \`${workspacePath}\`
- Example: \`${workspacePath}/src/index.ts\`, \`${workspacePath}/README.md\`
- To list the workspace root, use \`ls("${workspacePath}")\`
- Always use full absolute paths for all file operations
`

  const dockerSection = dockerConfig?.enabled
    ? `
### Docker Mode

- Use Docker tools for container operations: execute_bash, upload_file, download_file, edit_file, cat_file
- Container working directory is /workspace
- Local filesystem tools operate on the host, not inside the container
`
    : ""

  return workingDirSection + dockerSection + BASE_SYSTEM_PROMPT
}

function normalizeDockerWorkspace(config: DockerConfig): string {
  const mount = config.mounts?.[0]
  if (mount?.containerPath) {
    const normalized = mount.containerPath.replace(/\\/g, "/")
    return normalized.startsWith("/") ? normalized : `/${normalized}`
  }
  return "/workspace"
}

// Per-thread checkpointer cache
const checkpointers = new Map<string, SqlJsSaver>()

export async function getCheckpointer(threadId: string): Promise<SqlJsSaver> {
  let checkpointer = checkpointers.get(threadId)
  if (!checkpointer) {
    const dbPath = getThreadCheckpointPath(threadId)
    checkpointer = new SqlJsSaver(dbPath)
    await checkpointer.initialize()
    checkpointers.set(threadId, checkpointer)
  }
  return checkpointer
}

export async function closeCheckpointer(threadId: string): Promise<void> {
  const checkpointer = checkpointers.get(threadId)
  if (checkpointer) {
    await checkpointer.close()
    checkpointers.delete(threadId)
  }
}

// Get the appropriate model instance based on new simplified provider configuration
function getModelInstance(_modelId?: string): ChatOpenAI {
  const config = getProviderConfig()

  if (!config) {
    throw new Error(
      "Provider not configured. Please configure Ollama or OpenAI-compatible provider in Settings."
    )
  }

  console.log("[Runtime] Using provider config:", config.type)
  console.log("[Runtime] Model:", config.model)

  if (config.type === "ollama") {
    // Ollama uses OpenAI-compatible API at /v1 endpoint
    const baseURL = config.url.endsWith("/v1") ? config.url : `${config.url}/v1`
    console.log("[Runtime] Ollama baseURL:", baseURL)

    return new ChatOpenAI({
      model: config.model,
      configuration: {
        baseURL: baseURL
      },
      // Ollama doesn't need an API key, but ChatOpenAI requires one
      // Use a placeholder value
      apiKey: "ollama"
    })
  } else {
    // OpenAI-compatible provider
    console.log("[Runtime] OpenAI-compatible baseURL:", config.url)

    return new ChatOpenAI({
      model: config.model,
      apiKey: config.apiKey,
      configuration: {
        baseURL: config.url
      }
    })
  }
}

// ============================================================================
// Legacy provider selection logic (kept for reference, not used)
// ============================================================================
/*
function getModelInstanceLegacy(
  modelId?: string
): ChatAnthropic | ChatOpenAI | ChatGoogleGenerativeAI | string {
  const model = modelId || getDefaultModel()
  console.log("[Runtime] Using model:", model)

  // Determine provider from model ID
  if (model.startsWith("claude")) {
    const apiKey = getApiKey("anthropic")
    console.log("[Runtime] Anthropic API key present:", !!apiKey)
    if (!apiKey) {
      throw new Error("Anthropic API key not configured")
    }
    return new ChatAnthropic({
      model,
      anthropicApiKey: apiKey
    })
  } else if (
    model.startsWith("gpt") ||
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4")
  ) {
    const apiKey = getApiKey("openai")
    console.log("[Runtime] OpenAI API key present:", !!apiKey)
    if (!apiKey) {
      throw new Error("OpenAI API key not configured")
    }
    return new ChatOpenAI({
      model,
      openAIApiKey: apiKey
    })
  } else if (model.startsWith("gemini")) {
    const apiKey = getApiKey("google")
    console.log("[Runtime] Google API key present:", !!apiKey)
    if (!apiKey) {
      throw new Error("Google API key not configured")
    }
    return new ChatGoogleGenerativeAI({
      model,
      apiKey: apiKey
    })
  }

  // Default to model string (let deepagents handle it)
  return model
}
*/

export interface CreateAgentRuntimeOptions {
  /** Thread ID - REQUIRED for per-thread checkpointing */
  threadId: string
  /** Model ID to use (defaults to configured default model) */
  modelId?: string
  /** Workspace path - REQUIRED for agent to operate on files */
  workspacePath: string
  /** Optional docker configuration for container mode */
  dockerConfig?: DockerConfig | null
}

// Create agent runtime with configured model and checkpointer
export type AgentRuntime = ReturnType<typeof createDeepAgent>

export async function createAgentRuntime(options: CreateAgentRuntimeOptions) {
  const { threadId, modelId, workspacePath, dockerConfig } = options

  if (!threadId) {
    throw new Error("Thread ID is required for checkpointing.")
  }

  if (!workspacePath && !dockerConfig?.enabled) {
    throw new Error(
      "Workspace path is required. Please select a workspace folder before running the agent."
    )
  }

  console.log("[Runtime] Creating agent runtime...")
  console.log("[Runtime] Thread ID:", threadId)
  console.log("[Runtime] Workspace path:", workspacePath)
  if (dockerConfig?.enabled) {
    console.log("[Runtime] Docker mode enabled with image:", dockerConfig.image)
  }

  const model = getModelInstance(modelId)
  console.log("[Runtime] Model instance created:", typeof model)

  const checkpointer = await getCheckpointer(threadId)
  console.log("[Runtime] Checkpointer ready for thread:", threadId)

  const backend = new LocalSandbox({
    rootDir: workspacePath || process.cwd(),
    virtualMode: false, // Use absolute system paths for consistency with shell commands
    timeout: 120_000, // 2 minutes
    maxOutputBytes: 100_000 // ~100KB
  })

  const effectiveWorkspace = dockerConfig?.enabled
    ? normalizeDockerWorkspace(dockerConfig)
    : workspacePath
  const systemPrompt = getSystemPrompt(effectiveWorkspace, dockerConfig || undefined)

  const subagents = listSubagents().map((agent) => ({
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    model: agent.model,
    tools: resolveToolInstancesByName(agent.tools),
    middleware: resolveMiddlewareById(agent.middleware),
    interruptOn: agent.interruptOn ? { execute: true } : undefined
  }))

  const skillsRoot = getSkillsRoot().replace(/\\/g, "/")

  // Custom filesystem prompt for absolute paths (matches virtualMode: false)
  const filesystemSystemPrompt = `You have access to a filesystem. All file paths use fully qualified absolute system paths.

- ls: list files in a directory (e.g., ls("${effectiveWorkspace}"))
- read_file: read a file from the filesystem
- write_file: write to a file in the filesystem
- edit_file: edit a file in the filesystem
- glob: find files matching a pattern (e.g., "**/*.py")
- grep: search for text within files

The workspace root is: ${effectiveWorkspace}`

  const dockerTools = dockerConfig?.enabled ? createDockerTools(dockerConfig) : []

  const agent = createDeepAgent({
    model,
    checkpointer,
    backend,
    systemPrompt: systemPrompt + "\n\n" + filesystemSystemPrompt,
    tools: [...getEnabledToolInstances(), ...dockerTools],
    // Custom filesystem prompt for absolute paths (requires deepagents update)
    // filesystemSystemPrompt,
    subagents,
    skills: [skillsRoot],
    // Require human approval for all shell commands
    interruptOn: { execute: true }
  } as Parameters<typeof createDeepAgent>[0])

  console.log("[Runtime] Deep agent created with LocalSandbox at:", workspacePath)
  return agent
}

export type DeepAgent = ReturnType<typeof createDeepAgent>

// Clean up all checkpointer resources
export async function closeRuntime(): Promise<void> {
  const closePromises = Array.from(checkpointers.values()).map((cp) => cp.close())
  await Promise.all(closePromises)
  checkpointers.clear()
}

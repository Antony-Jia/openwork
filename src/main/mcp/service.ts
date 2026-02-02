import { randomUUID } from "node:crypto"
import { tool } from "langchain"
import { z } from "zod"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { listMcpConfigs, saveMcpConfigs } from "./config"
import { logEntry, logExit, summarizeArgs, summarizeList, withSpan } from "../logging"
import type {
  McpServerConfig,
  McpServerCreateParams,
  McpServerListItem,
  McpServerStatus,
  McpServerUpdateParams,
  McpToolInfo
} from "../types"

type McpToolDefinition = {
  name: string
  description?: string
  inputSchema?: {
    type: "object"
    properties?: Record<string, unknown>
    required?: string[]
  }
}

type RunningMcpServer = {
  config: McpServerConfig
  client: Client
  transport: StdioClientTransport | SSEClientTransport
  tools: McpToolDefinition[]
  toolInstances: Array<unknown>
}

const runningServers = new Map<string, RunningMcpServer>()
const lastErrors = new Map<string, string | null>()

const clientInfo = {
  name: "openwork",
  version: "0.1.0"
}

function getConfigById(id: string): McpServerConfig | undefined {
  return listMcpConfigs().find((item) => item.id === id)
}

function updateConfig(id: string, updates: Partial<Omit<McpServerConfig, "id">>): McpServerConfig {
  const servers = listMcpConfigs()
  const index = servers.findIndex((item) => item.id === id)
  if (index < 0) {
    throw new Error("MCP server not found.")
  }

  const next = {
    ...servers[index],
    ...updates
  }
  servers[index] = next
  saveMcpConfigs(servers)
  return next
}

function parseToolDefinitions(raw: unknown): McpToolDefinition[] {
  const tools = (raw as { tools?: McpToolDefinition[] } | undefined)?.tools
  if (!Array.isArray(tools)) {
    return []
  }
  return tools.filter((item) => item && typeof item.name === "string")
}

function jsonSchemaToZod(
  inputSchema?: McpToolDefinition["inputSchema"]
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  if (!inputSchema?.properties || Object.keys(inputSchema.properties).length === 0) {
    return z.object({})
  }

  const shape: Record<string, z.ZodTypeAny> = {}
  const required = new Set(inputSchema.required ?? [])

  for (const [key, prop] of Object.entries(inputSchema.properties)) {
    const propObj = prop as { type?: string; description?: string }
    let zodType: z.ZodTypeAny

    switch (propObj.type) {
      case "string":
        zodType = z.string()
        break
      case "number":
      case "integer":
        zodType = z.number()
        break
      case "boolean":
        zodType = z.boolean()
        break
      case "array":
        zodType = z.array(z.any())
        break
      case "object":
        zodType = z.record(z.string(), z.any())
        break
      default:
        zodType = z.any()
    }

    if (propObj.description) {
      zodType = zodType.describe(propObj.description)
    }

    shape[key] = required.has(key) ? zodType : zodType.optional()
  }

  return z.object(shape)
}

function buildToolInstances(serverId: string, tools: McpToolDefinition[]): Array<unknown> {
  return tools.map((toolDef) => {
    const toolName = `mcp.${serverId}.${toolDef.name}`
    const description =
      toolDef.description || `Call MCP tool "${toolDef.name}" from server ${serverId}.`
    const schema = jsonSchemaToZod(toolDef.inputSchema)

    return tool(
      async (args: Record<string, unknown>) => {
        const start = Date.now()
        logEntry("MCP", "toolCall", {
          tool: toolName,
          serverId,
          ...summarizeArgs(args)
        })
        const running = runningServers.get(serverId)
        if (!running) {
          logExit("MCP", "toolCall", { tool: toolName, serverId, ok: false }, Date.now() - start)
          throw new Error(`MCP server ${serverId} is not running.`)
        }
        try {
          const result = await running.client.callTool({
            name: toolDef.name,
            arguments: args ?? {}
          })
          logExit("MCP", "toolCall", { tool: toolName, serverId, ok: true }, Date.now() - start)
          return result
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown_error"
          logExit(
            "MCP",
            "toolCall",
            { tool: toolName, serverId, ok: false, error: message },
            Date.now() - start
          )
          throw error
        }
      },
      {
        name: toolName,
        description,
        schema
      }
    )
  })
}

function toMcpToolInfo(server: McpServerConfig, toolDef: McpToolDefinition): McpToolInfo {
  const fullName = `mcp.${server.id}.${toolDef.name}`
  return {
    serverId: server.id,
    serverName: server.name,
    toolName: toolDef.name,
    fullName,
    description: toolDef.description
  }
}

export function listMcpServers(): McpServerListItem[] {
  logEntry("MCP", "listServers")
  const servers = listMcpConfigs()
  const result = servers.map((config) => {
    const running = runningServers.get(config.id)
    const status: McpServerStatus = {
      running: !!running,
      toolsCount: running?.tools?.length ?? 0,
      lastError: lastErrors.get(config.id) ?? null
    }
    return { config, status }
  })
  logExit("MCP", "listServers", { count: result.length })
  return result
}

export function createMcpServer(input: McpServerCreateParams): McpServerConfig {
  logEntry("MCP", "createServer", { name: input.name, mode: input.mode })
  if (!input.name?.trim()) {
    throw new Error("MCP server name is required.")
  }
  if (input.mode === "local" && !input.command?.trim()) {
    throw new Error("Command is required for local MCP servers.")
  }
  if (input.mode === "remote" && !input.url?.trim()) {
    throw new Error("URL is required for remote MCP servers.")
  }

  const servers = listMcpConfigs()
  const created: McpServerConfig = {
    ...input,
    id: randomUUID(),
    name: input.name.trim(),
    command: input.command?.trim(),
    url: input.url?.trim(),
    autoStart: input.autoStart ?? false,
    enabled: input.enabled ?? true
  }
  saveMcpConfigs([...servers, created])
  logExit("MCP", "createServer", { id: created.id, name: created.name })
  return created
}

export async function updateMcpServer({
  id,
  updates
}: McpServerUpdateParams): Promise<McpServerConfig> {
  logEntry("MCP", "updateServer", { id, updates: Object.keys(updates || {}) })
  const next = updateConfig(id, updates)
  const running = runningServers.has(id)
  if (running && updates.autoStart === false) {
    await stopMcpServer(id)
    logExit("MCP", "updateServer", { id, running: false })
    return next
  }
  const requiresRestart =
    running &&
    (updates.mode !== undefined ||
      updates.command !== undefined ||
      updates.args !== undefined ||
      updates.env !== undefined ||
      updates.cwd !== undefined ||
      updates.url !== undefined ||
      updates.headers !== undefined)

  if (requiresRestart) {
    await stopMcpServer(id)
    await startMcpServer(id)
  } else if (!running && updates.autoStart) {
    await startMcpServer(id)
  }
  logExit("MCP", "updateServer", { id, running: runningServers.has(id) })
  return next
}

export async function deleteMcpServer(id: string): Promise<void> {
  logEntry("MCP", "deleteServer", { id })
  await stopMcpServer(id)
  const servers = listMcpConfigs().filter((item) => item.id !== id)
  saveMcpConfigs(servers)
  lastErrors.delete(id)
  logExit("MCP", "deleteServer", { id })
}

export async function startMcpServer(id: string): Promise<McpServerStatus> {
  return withSpan("MCP", "startServer", { id }, async () => {
    const existing = runningServers.get(id)
    if (existing) {
      return { running: true, toolsCount: existing.tools.length, lastError: null }
    }

    const config = getConfigById(id)
    if (!config) {
      throw new Error("MCP server not found.")
    }

    try {
      const client = new Client(clientInfo, { capabilities: {} })
      let transport: StdioClientTransport | SSEClientTransport

      if (config.mode === "local") {
        const env: Record<string, string> = {}
        for (const [key, value] of Object.entries(process.env)) {
          if (typeof value === "string") env[key] = value
        }
        if (config.env) {
          for (const [key, value] of Object.entries(config.env)) {
            if (typeof value === "string") env[key] = value
          }
        }

        transport = new StdioClientTransport({
          command: config.command || "",
          args: config.args || [],
          env,
          cwd: config.cwd
        })
      } else {
        const url = new URL(config.url || "")
        transport = new SSEClientTransport(
          url,
          (config.headers ? { headers: config.headers } : undefined) as unknown as Record<
            string,
            string
          >
        )
      }

      await client.connect(transport)

      const toolList = await client.listTools()
      const tools = parseToolDefinitions(toolList)
      const toolInstances = buildToolInstances(config.id, tools)

      runningServers.set(config.id, {
        config,
        client,
        transport,
        tools,
        toolInstances
      })
      lastErrors.set(config.id, null)
      updateConfig(config.id, { autoStart: true })

      logEntry("MCP", "startServer.tools", {
        id,
        ...summarizeList(tools.map((toolDef) => toolDef.name))
      })
      return { running: true, toolsCount: tools.length, lastError: null }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start MCP server."
      lastErrors.set(id, message)
      throw new Error(message)
    }
  })
}

export async function stopMcpServer(id: string): Promise<McpServerStatus> {
  logEntry("MCP", "stopServer", { id })
  const running = runningServers.get(id)
  if (running) {
    try {
      await running.client.close()
    } catch {
      // ignore close errors
    }

    const maybeTransport = running.transport as { close?: () => Promise<void> | void }
    if (maybeTransport?.close) {
      try {
        await maybeTransport.close()
      } catch {
        // ignore close errors
      }
    }

    runningServers.delete(id)
  }

  updateConfig(id, { autoStart: false })
  lastErrors.set(id, null)
  logExit("MCP", "stopServer", { id, running: false })
  return { running: false, toolsCount: 0, lastError: null }
}

export async function startAutoMcpServers(): Promise<void> {
  logEntry("MCP", "startAuto")
  const servers = listMcpConfigs().filter((item) => item.autoStart && item.enabled !== false)
  for (const server of servers) {
    try {
      await startMcpServer(server.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start MCP server."
      lastErrors.set(server.id, message)
    }
  }
  logExit("MCP", "startAuto", { count: servers.length })
}

export async function getRunningMcpToolInstances(): Promise<Array<unknown>> {
  const instances = Array.from(runningServers.values())
    .filter((server) => server.config.enabled !== false)
    .flatMap((server) => server.toolInstances)
  logExit("MCP", "getRunningToolInstances", { count: instances.length })
  return instances
}

export function listRunningMcpTools(): McpToolInfo[] {
  const result = Array.from(runningServers.values())
    .filter((server) => server.config.enabled !== false)
    .flatMap((server) => server.tools.map((toolDef) => toMcpToolInfo(server.config, toolDef)))
  logExit("MCP", "listRunningTools", { count: result.length })
  return result
}

export function getRunningMcpToolInstanceMap(): Map<string, unknown> {
  const entries = Array.from(runningServers.values())
    .filter((server) => server.config.enabled !== false)
    .flatMap((server) =>
      server.tools.map((toolDef, index) => {
        const fullName = `mcp.${server.config.id}.${toolDef.name}`
        const instance = server.toolInstances[index]
        return [fullName, instance] as const
      })
    )
  logExit("MCP", "getRunningToolInstanceMap", { count: entries.length })
  return new Map(entries)
}

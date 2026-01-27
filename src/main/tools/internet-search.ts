import { tool } from "langchain"
import { TavilySearch } from "@langchain/tavily"
import { z } from "zod"
import { resolveToolKey } from "./config"
import type { ToolDefinition } from "../types"
import { logEntry, logExit } from "../logging"

export const internetSearchDefinition: ToolDefinition = {
  name: "internet_search",
  label: "Internet Search",
  description: "Run a web search",
  keyLabel: "Tavily API Key",
  envVar: "TAVILY_API_KEY"
}

export const internetSearchTool = tool(
  async ({
    query,
    maxResults = 5,
    topic = "general",
    includeRawContent = false
  }: {
    query: string
    maxResults?: number
    topic?: "general" | "news" | "finance"
    includeRawContent?: boolean
  }) => {
    const start = Date.now()
    logEntry("Tool", "internet_search", {
      queryLength: query?.length ?? 0,
      maxResults,
      topic,
      includeRawContent
    })
    const apiKey = resolveToolKey(internetSearchDefinition.name, internetSearchDefinition.envVar)
    if (!apiKey) {
      logExit(
        "Tool",
        "internet_search",
        { ok: false, error: "missing_api_key" },
        Date.now() - start
      )
      throw new Error("Tavily API key is not configured. Please set it in Tools or TAVILY_API_KEY.")
    }

    const tavilySearch = new TavilySearch({
      maxResults,
      tavilyApiKey: apiKey,
      includeRawContent,
      topic
    })
    try {
      const result = await tavilySearch._call({ query })
      logExit("Tool", "internet_search", { ok: true }, Date.now() - start)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error"
      logExit("Tool", "internet_search", { ok: false, error: message }, Date.now() - start)
      throw error
    }
  },
  {
    name: internetSearchDefinition.name,
    description: internetSearchDefinition.description,
    schema: z.object({
      query: z.string().describe("The search query"),
      maxResults: z.number().optional().default(5).describe("Maximum number of results to return"),
      topic: z
        .enum(["general", "news", "finance"])
        .optional()
        .default("general")
        .describe("Search topic category"),
      includeRawContent: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to include raw content")
    })
  }
)

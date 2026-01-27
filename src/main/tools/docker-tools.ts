import { spawn } from "node:child_process"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { tool } from "langchain"
import { z } from "zod"
import type { DockerConfig, DockerMount } from "../types"

function normalizeContainerPath(input: string): string {
  if (!input) return "/"
  const normalized = input.replace(/\\/g, "/")
  const withLeading = normalized.startsWith("/") ? normalized : `/${normalized}`
  return path.posix.normalize(withLeading)
}

function resolveDockerMount(
  mounts: DockerMount[],
  containerPath: string
): { mount: DockerMount; relativePath: string } | null {
  const normalizedPath = normalizeContainerPath(containerPath)
  const sortedMounts = [...mounts].sort(
    (a, b) =>
      normalizeContainerPath(b.containerPath).length -
      normalizeContainerPath(a.containerPath).length
  )

  for (const mount of sortedMounts) {
    const mountPath = normalizeContainerPath(mount.containerPath)
    if (normalizedPath === mountPath || normalizedPath.startsWith(`${mountPath}/`)) {
      const relativePath = normalizedPath.slice(mountPath.length).replace(/^\/+/, "")
      return { mount, relativePath }
    }
  }

  return null
}

async function runDockerCommand(
  args: string[],
  timeoutMs = 120_000
): Promise<{ stdout: string; stderr: string; exitCode: number | null; durationMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now()
    const proc = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    let resolved = false

    const timeout = setTimeout(() => {
      if (resolved) return
      resolved = true
      proc.kill("SIGTERM")
      resolve({
        stdout: "",
        stderr: "Error: Docker command timed out.",
        exitCode: null,
        durationMs: Date.now() - start
      })
    }, timeoutMs)

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString()
    })
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on("close", (code) => {
      if (resolved) return
      resolved = true
      clearTimeout(timeout)
      resolve({
        stdout,
        stderr,
        exitCode: code,
        durationMs: Date.now() - start
      })
    })

    proc.on("error", (err) => {
      if (resolved) return
      resolved = true
      clearTimeout(timeout)
      resolve({
        stdout: "",
        stderr: `Error: ${err.message}`,
        exitCode: 1,
        durationMs: Date.now() - start
      })
    })
  })
}

export function createDockerTools(config: DockerConfig, containerId: string | null) {
  const executeBash = tool(
    async ({
      command,
      cwd,
      env,
      timeoutMs
    }: {
      command: string
      cwd?: string
      env?: Record<string, string>
      timeoutMs?: number
    }) => {
      if (!command) {
        return { stdout: "", stderr: "Error: command is required.", exitCode: 1, durationMs: 0 }
      }

      if (!containerId) {
        return {
          stdout: "",
          stderr: "Error: Docker container is not running.",
          exitCode: 1,
          durationMs: 0
        }
      }

      const execArgs = ["exec"]
      execArgs.push("-w", cwd ? normalizeContainerPath(cwd) : "/workspace")
      if (env) {
        Object.entries(env).forEach(([key, value]) => {
          execArgs.push("-e", `${key}=${value}`)
        })
      }
      execArgs.push(containerId, "sh", "-c", command)

      return runDockerCommand(execArgs, timeoutMs)
    },
    {
      name: "execute_bash",
      description: "Execute a shell command inside the Docker container",
      schema: z.object({
        command: z.string().describe("Shell command to execute"),
        cwd: z.string().optional().describe("Working directory inside the container"),
        env: z.record(z.string(), z.string()).optional().describe("Environment variables"),
        timeoutMs: z.number().optional().describe("Timeout in milliseconds")
      })
    }
  )

  const uploadFile = tool(
    async ({
      path: containerPath,
      content,
      encoding = "utf-8"
    }: {
      path: string
      content: string
      encoding?: "utf-8" | "base64"
    }) => {
      const match = resolveDockerMount(config.mounts || [], containerPath)
      if (!match) {
        throw new Error("Access denied: path outside docker mounts.")
      }

      const fullPath = path.join(match.mount.hostPath, match.relativePath)
      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      const data =
        encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf-8")
      await fs.writeFile(fullPath, data)
      return { path: containerPath, bytes_written: data.length }
    },
    {
      name: "upload_file",
      description: "Upload a file into the Docker mount",
      schema: z.object({
        path: z.string().describe("Container path to write"),
        content: z.string().describe("File content"),
        encoding: z.enum(["utf-8", "base64"]).optional()
      })
    }
  )

  const downloadFile = tool(
    async ({
      path: containerPath,
      encoding = "utf-8",
      limitBytes
    }: {
      path: string
      encoding?: "utf-8" | "base64"
      limitBytes?: number
    }) => {
      const match = resolveDockerMount(config.mounts || [], containerPath)
      if (!match) {
        throw new Error("Access denied: path outside docker mounts.")
      }

      const fullPath = path.join(match.mount.hostPath, match.relativePath)
      const data = await fs.readFile(fullPath)
      const sliced = limitBytes ? data.slice(0, limitBytes) : data
      return encoding === "base64" ? sliced.toString("base64") : sliced.toString("utf-8")
    },
    {
      name: "download_file",
      description: "Download a file from the Docker mount",
      schema: z.object({
        path: z.string().describe("Container path to read"),
        encoding: z.enum(["utf-8", "base64"]).optional(),
        limitBytes: z.number().optional().describe("Limit bytes to read")
      })
    }
  )

  const catFile = tool(
    async ({ path: containerPath, limitBytes }: { path: string; limitBytes?: number }) => {
      const match = resolveDockerMount(config.mounts || [], containerPath)
      if (!match) {
        throw new Error("Access denied: path outside docker mounts.")
      }

      const fullPath = path.join(match.mount.hostPath, match.relativePath)
      const data = await fs.readFile(fullPath)
      const sliced = limitBytes ? data.slice(0, limitBytes) : data
      return sliced.toString("utf-8")
    },
    {
      name: "cat_file",
      description: "Read a file from the Docker mount",
      schema: z.object({
        path: z.string().describe("Container path to read"),
        limitBytes: z.number().optional().describe("Limit bytes to read")
      })
    }
  )

  const editFile = tool(
    async ({
      path: containerPath,
      old_str,
      new_str
    }: {
      path: string
      old_str: string
      new_str: string
    }) => {
      const match = resolveDockerMount(config.mounts || [], containerPath)
      if (!match) {
        throw new Error("Access denied: path outside docker mounts.")
      }

      const fullPath = path.join(match.mount.hostPath, match.relativePath)
      const original = await fs.readFile(fullPath, "utf-8")
      const occurrences = original.split(old_str).length - 1
      if (occurrences !== 1) {
        throw new Error(`Expected one occurrence, found ${occurrences}.`)
      }
      const updated = original.replace(old_str, new_str)
      await fs.writeFile(fullPath, updated, "utf-8")
      return "File updated."
    },
    {
      name: "edit_file",
      description: "Edit a file inside the Docker mount by replacing a string",
      schema: z.object({
        path: z.string().describe("Container path to edit"),
        old_str: z.string().describe("Exact text to replace"),
        new_str: z.string().describe("Replacement text")
      })
    }
  )

  return [executeBash, uploadFile, downloadFile, catFile, editFile]
}

/**
 * LocalSandbox: Execute shell commands locally on the host machine.
 *
 * Extends FilesystemBackend with command execution capability.
 * Commands run in the workspace directory with configurable timeout and output limits.
 *
 * Security note: This has NO built-in safeguards except for the human-in-the-loop
 * middleware provided by the agent framework. All command approval should be
 * handled via HITL configuration.
 */

import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { FilesystemBackend, type ExecuteResponse, type SandboxBackendProtocol } from "deepagents"

/**
 * Options for LocalSandbox configuration.
 */
export interface LocalSandboxOptions {
  /** Root directory for file operations and command execution (default: process.cwd()) */
  rootDir?: string
  /** Enable virtual path mode where "/" maps to rootDir (default: false) */
  virtualMode?: boolean
  /** Maximum file size in MB for file operations (default: 10) */
  maxFileSizeMb?: number
  /** Command timeout in milliseconds (default: 120000 = 2 minutes) */
  timeout?: number
  /** Maximum output bytes before truncation (default: 100000 = ~100KB) */
  maxOutputBytes?: number
  /** Environment variables to pass to commands (default: process.env) */
  env?: Record<string, string>
}

/**
 * LocalSandbox backend with shell command execution.
 *
 * Extends FilesystemBackend to inherit all file operations (ls, read, write,
 * edit, glob, grep) and adds execute() for running shell commands locally.
 *
 * @example
 * ```typescript
 * const sandbox = new LocalSandbox({
 *   rootDir: '/path/to/workspace',
 *   virtualMode: true,
 *   timeout: 60_000,
 * });
 *
 * const result = await sandbox.execute('npm test');
 * console.log(result.output);
 * console.log('Exit code:', result.exitCode);
 * ```
 */
export class LocalSandbox extends FilesystemBackend implements SandboxBackendProtocol {
  /** Unique identifier for this sandbox instance */
  readonly id: string

  private readonly timeout: number
  private readonly maxOutputBytes: number
  private readonly env: Record<string, string>
  private readonly workingDir: string

  constructor(options: LocalSandboxOptions = {}) {
    super({
      rootDir: options.rootDir,
      virtualMode: options.virtualMode,
      maxFileSizeMb: options.maxFileSizeMb
    })

    this.id = `local-sandbox-${randomUUID().slice(0, 8)}`
    this.timeout = options.timeout ?? 120_000 // 2 minutes default
    this.maxOutputBytes = options.maxOutputBytes ?? 100_000 // ~100KB default
    this.env = options.env ?? ({ ...process.env } as Record<string, string>)
    this.workingDir = options.rootDir ?? process.cwd()
  }

  /**
   * Execute a shell command in the workspace directory.
   *
   * @param command - Shell command string to execute
   * @returns ExecuteResponse with combined output, exit code, and truncation flag
   *
   * @example
   * ```typescript
   * const result = await sandbox.execute('echo "Hello World"');
   * // result.output: "Hello World\n"
   * // result.exitCode: 0
   * // result.truncated: false
   * ```
   */
  async execute(command: string): Promise<ExecuteResponse> {
    console.log(`[LocalSandbox] execute() called with command: ${command.substring(0, 200)}${command.length > 200 ? '...' : ''}`)
    console.log(`[LocalSandbox] Working directory: ${this.workingDir}`)
    console.log(`[LocalSandbox] Timeout: ${this.timeout}ms`)

    if (!command || typeof command !== "string") {
      console.log(`[LocalSandbox] Invalid command, returning error`)
      return {
        output: "Error: Shell tool expects a non-empty command string.",
        exitCode: 1,
        truncated: false
      }
    }

    return new Promise<ExecuteResponse>((resolve) => {
      const outputParts: string[] = []
      let totalBytes = 0
      let truncated = false
      let resolved = false

      // Determine shell based on platform
      const isWindows = process.platform === "win32"

      // On Windows, preprocess command to fix common escaping issues
      // Replace \" with " to fix improperly escaped quotes that cause cmd.exe to hang
      let processedCommand = command
      if (isWindows) {
        // Remove backslash escapes before quotes: \" -> "
        processedCommand = command.replace(/\\"/g, '"')
        // Log if we made changes for debugging
        if (processedCommand !== command) {
          console.log("[LocalSandbox] Fixed escaped quotes in command for Windows")
          console.log(`[LocalSandbox] Original: ${command.substring(0, 200)}`)
          console.log(`[LocalSandbox] Processed: ${processedCommand.substring(0, 200)}`)
        }
      }

      // Use PowerShell on Windows for better compatibility with modern commands
      // cmd.exe cannot run PowerShell cmdlets like Compress-Archive directly
      const shell = isWindows ? "powershell.exe" : "/bin/sh"
      const shellArgs = isWindows
        ? ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", processedCommand]
        : ["-c", command]

      console.log(`[LocalSandbox] Shell: ${shell}`)
      console.log(`[LocalSandbox] Shell args: ${JSON.stringify(shellArgs).substring(0, 300)}`)

      console.log(`[LocalSandbox] Spawning process...`)
      const startTime = Date.now()

      const proc = spawn(shell, shellArgs, {
        cwd: this.workingDir,
        env: this.env,
        stdio: ["ignore", "pipe", "pipe"]
      })

      console.log(`[LocalSandbox] Process spawned with PID: ${proc.pid}`)

      // Listen for stdout/stderr end events
      proc.stdout.on("end", () => {
        console.log(`[LocalSandbox] stdout stream ended`)
      })
      proc.stderr.on("end", () => {
        console.log(`[LocalSandbox] stderr stream ended`)
      })

      // Handle timeout
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true
          proc.kill("SIGTERM")
          // Give it a moment, then force kill
          setTimeout(() => proc.kill("SIGKILL"), 1000)
          const timeoutSecs = (this.timeout / 1000).toFixed(1)
          const hint =
            "This may be caused by: unmatched quotes (causing shell to wait for input), " +
            "interactive commands requiring stdin, or a genuinely long-running process."
          resolve({
            output: `Error: Command timed out after ${timeoutSecs} seconds and was terminated.\n${hint}`,
            exitCode: null,
            truncated: false
          })
        }
      }, this.timeout)

      // Collect stdout
      proc.stdout.on("data", (data: Buffer) => {
        console.log(`[LocalSandbox] stdout data received: ${data.length} bytes`)
        if (truncated) return

        const chunk = data.toString()
        const newTotal = totalBytes + chunk.length

        if (newTotal > this.maxOutputBytes) {
          // Truncate to fit within limit
          const remaining = this.maxOutputBytes - totalBytes
          if (remaining > 0) {
            outputParts.push(chunk.slice(0, remaining))
          }
          truncated = true
          totalBytes = this.maxOutputBytes
        } else {
          outputParts.push(chunk)
          totalBytes = newTotal
        }
      })

      // Collect stderr with [stderr] prefix per line
      proc.stderr.on("data", (data: Buffer) => {
        console.log(`[LocalSandbox] stderr data received: ${data.length} bytes`)
        console.log(`[LocalSandbox] stderr content: ${data.toString().substring(0, 200)}`)
        if (truncated) return

        const chunk = data.toString()
        // Prefix each line with [stderr]
        const prefixedLines = chunk
          .split("\n")
          .filter((line) => line.length > 0)
          .map((line) => `[stderr] ${line}`)
          .join("\n")

        if (prefixedLines.length === 0) return

        const withNewline = prefixedLines + (chunk.endsWith("\n") ? "\n" : "")
        const newTotal = totalBytes + withNewline.length

        if (newTotal > this.maxOutputBytes) {
          const remaining = this.maxOutputBytes - totalBytes
          if (remaining > 0) {
            outputParts.push(withNewline.slice(0, remaining))
          }
          truncated = true
          totalBytes = this.maxOutputBytes
        } else {
          outputParts.push(withNewline)
          totalBytes = newTotal
        }
      })

      // Handle process exit
      proc.on("close", (code, signal) => {
        const elapsed = Date.now() - startTime
        console.log(`[LocalSandbox] Process closed after ${elapsed}ms, code: ${code}, signal: ${signal}`)

        if (resolved) {
          console.log(`[LocalSandbox] Already resolved, ignoring close event`)
          return
        }
        resolved = true
        clearTimeout(timeoutId)

        let output = outputParts.join("")

        // Add truncation notice if needed
        if (truncated) {
          output += `\n\n... Output truncated at ${this.maxOutputBytes} bytes.`
        }

        // If no output, show placeholder
        if (!output.trim()) {
          output = "<no output>"
        }

        resolve({
          output,
          exitCode: signal ? null : code,
          truncated
        })
      })

      // Handle spawn errors
      proc.on("error", (err) => {
        console.log(`[LocalSandbox] Spawn error: ${err.message}`)
        if (resolved) return
        resolved = true
        clearTimeout(timeoutId)

        resolve({
          output: `Error: Failed to execute command: ${err.message}`,
          exitCode: 1,
          truncated: false
        })
      })
    })
  }
}

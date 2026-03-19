import type { TerminalManager } from '../terminal/manager'

// Strip ANSI escape codes from terminal output
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')    // OSC sequences
    .replace(/\x1b[()][0-9A-B]/g, '')       // charset sequences
    .replace(/\x1b[\[?][0-9;]*[hl]/g, '')   // mode set/reset
    .replace(/\r/g, '')
}

// Check if the last non-empty line looks like a shell prompt
function hasShellPrompt(buffer: string): boolean {
  const lines = stripAnsi(buffer).split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return false
  const last = lines[lines.length - 1]
  return /[$%#>]\s*$/.test(last)
}

// Check if Claude CLI is ready for input
function hasClaudePrompt(buffer: string): boolean {
  const clean = stripAnsi(buffer)
  const lines = clean.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line.length === 0) continue
    // Claude Code shows ">" at the start of input line
    if (/^>\s*$/.test(line)) return true
    // Or a line containing the input hint
    if (line.includes('Type your message') || line.includes('What would you like to do')) return true
    break
  }
  return false
}

const WAIT_TERMINAL_INTERVAL = 500
const WAIT_TERMINAL_MAX = 15_000

export class MorningCheckRunner {
  private terminalManager: TerminalManager

  constructor(terminalManager: TerminalManager) {
    this.terminalManager = terminalManager
  }

  /**
   * Wait for a terminal to exist in the manager (PTY created).
   * The renderer creates PTYs asynchronously via IPC, so we poll.
   */
  private waitForTerminal(terminalId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now()
      let settled = false
      const check = () => {
        if (settled) return
        if (this.terminalManager.get(terminalId)) {
          settled = true
          resolve()
          return
        }
        if (Date.now() - start > WAIT_TERMINAL_MAX) {
          settled = true
          reject(new Error(`Terminal ${terminalId} not created within ${WAIT_TERMINAL_MAX}ms`))
          return
        }
        setTimeout(check, WAIT_TERMINAL_INTERVAL)
      }
      check()
    })
  }

  /**
   * Auto-type into a terminal:
   * 1. Wait for the PTY to be created
   * 2. Wait for shell prompt
   * 3. Type "claude"
   * 4. Wait for Claude prompt
   * 5. Type the health check message
   */
  async autoType(terminalId: string, message: string): Promise<void> {
    // Phase 0: wait for the PTY to actually exist
    await this.waitForTerminal(terminalId)

    return new Promise((resolve) => {
      const managed = this.terminalManager.get(terminalId)
      if (!managed) {
        resolve() // Terminal disappeared between check and use — skip gracefully
        return
      }

      const SHELL_TIMEOUT = 10_000
      const CLAUDE_TIMEOUT = 15_000
      const SILENCE_DELAY = 5_000

      let buffer = ''
      let phase: 'shell' | 'claude' | 'done' = 'shell'
      let shellTimer: ReturnType<typeof setTimeout> | null = null
      let claudeTimer: ReturnType<typeof setTimeout> | null = null
      let silenceTimer: ReturnType<typeof setTimeout> | null = null
      let disposed = false

      const cleanup = () => {
        if (disposed) return
        disposed = true
        if (shellTimer) clearTimeout(shellTimer)
        if (claudeTimer) clearTimeout(claudeTimer)
        if (silenceTimer) clearTimeout(silenceTimer)
        disposable.dispose()
      }

      const succeed = () => {
        cleanup()
        resolve()
      }

      const sendClaude = () => {
        if (phase !== 'shell') return
        phase = 'claude'
        buffer = ''
        if (shellTimer) clearTimeout(shellTimer)
        this.terminalManager.write(terminalId, 'claude\r')

        // Timeout for Claude prompt detection
        claudeTimer = setTimeout(() => {
          // Fallback: send message anyway after timeout
          sendMessage()
        }, CLAUDE_TIMEOUT)
      }

      const sendMessage = () => {
        if (phase === 'done') return
        phase = 'done'
        if (claudeTimer) clearTimeout(claudeTimer)
        if (silenceTimer) clearTimeout(silenceTimer)

        // Claude Code accepts multi-line input — send as-is with \r at the end
        this.terminalManager.write(terminalId, message + '\r')
        succeed()
      }

      const resetSilenceTimer = () => {
        if (silenceTimer) clearTimeout(silenceTimer)
        if (phase === 'claude') {
          silenceTimer = setTimeout(() => {
            // No output for SILENCE_DELAY ms after sending "claude" = probably ready
            sendMessage()
          }, SILENCE_DELAY)
        }
      }

      // Listen to PTY output
      const disposable = managed.pty.onData((data: string) => {
        if (disposed) return
        buffer += data

        if (phase === 'shell') {
          if (hasShellPrompt(buffer)) {
            sendClaude()
          }
        } else if (phase === 'claude') {
          resetSilenceTimer()
          if (hasClaudePrompt(buffer)) {
            sendMessage()
          }
        }
      })

      // Shell prompt timeout — send "claude" anyway as fallback
      shellTimer = setTimeout(() => {
        if (phase === 'shell') {
          sendClaude()
        }
      }, SHELL_TIMEOUT)
    })
  }
}

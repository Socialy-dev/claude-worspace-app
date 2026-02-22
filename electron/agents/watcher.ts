/**
 * AgentParser — detects sub-agents by parsing Claude Code terminal output.
 * Claude Code prints a tree like:
 *
 *   • Running 2 Task agents… (ctrl+o to expand)
 *   ├─ Design review · 8 tool uses · 30.9k tokens
 *   │   └ Searching for 1 pattern, reading 7 files…
 *   ├─ Security audit · 9 tool uses · 31.2k tokens
 *   │   └ Searching for 2 patterns, reading 7 files…
 *
 * We strip ANSI escape codes and match these patterns in the pty data stream.
 */

export interface DetectedAgent {
  id: string
  terminalId: string
  name: string
  toolUses: number
  tokens: string
  status: string
  active: boolean
  detectedAt: number
}

// Strip ANSI escape codes from terminal output
function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')       // CSI sequences (colors, cursor, erase, etc.)
    .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')  // OSC sequences (title, etc.)
    .replace(/\x1b[()#][A-Za-z0-9]/g, '')          // Character set & DEC private
    .replace(/\x1b[=>NOM]/g, '')                   // Keypad/charset modes
    .replace(/\x1b\x1b/g, '')                      // Double escape
    .replace(/\x1b[^[\]()#=>\x1b]/g, '')           // Any remaining single-char escapes
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // Control chars (keep \n \r \t)
}

export class AgentParser {
  private agents = new Map<string, DetectedAgent>()
  private callback: ((agents: DetectedAgent[]) => void) | null = null
  private inactivityTimers = new Map<string, ReturnType<typeof setTimeout>>()

  onUpdate(cb: (agents: DetectedAgent[]) => void) {
    this.callback = cb
  }

  /**
   * Feed raw pty data from a terminal. We parse it for agent patterns.
   */
  feed(terminalId: string, rawData: string) {
    const text = stripAnsi(rawData)
    const lines = text.split('\n')

    let lastAgentKey: string | null = null
    let foundAgents = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Match agent line: "├─ Name · N tool uses · X tokens"
      const agentMatch = trimmed.match(
        /[├┣┠][─\s]+(.+?)\s+·\s+(\d+)\s+tool uses?\s+·\s+([\d.]+k?\s*tokens)/
      )
      if (agentMatch) {
        const [, name, toolUses, tokens] = agentMatch
        const cleanName = name.trim()
        const key = `${terminalId}:${cleanName}`

        const existing = this.agents.get(key)
        this.agents.set(key, {
          id: key,
          terminalId,
          name: cleanName,
          toolUses: parseInt(toolUses),
          tokens: tokens.trim(),
          status: existing?.status || '',
          active: true,
          detectedAt: existing?.detectedAt || Date.now(),
        })
        lastAgentKey = key
        foundAgents = true
        continue
      }

      // Match status line: "└ Status message"
      const statusMatch = trimmed.match(/└\s+(.+)/)
      if (statusMatch && lastAgentKey) {
        const agent = this.agents.get(lastAgentKey)
        if (agent) {
          agent.status = statusMatch[1].trim()
          foundAgents = true
        }
        continue
      }

      // Detect completion: "Vibing", "thought for", or normal prompt
      if (/vibing|thought for \d/i.test(trimmed)) {
        this.markTerminalInactive(terminalId)
        foundAgents = true
      }
    }

    if (foundAgents) {
      // Reset inactivity timer
      const existing = this.inactivityTimers.get(terminalId)
      if (existing) clearTimeout(existing)

      this.inactivityTimers.set(
        terminalId,
        setTimeout(() => {
          this.markTerminalInactive(terminalId)
        }, 10000) // 10 seconds with no agent output → mark done
      )

      this.emitUpdate()
    }
  }

  private markTerminalInactive(terminalId: string) {
    let changed = false
    for (const [, agent] of this.agents) {
      if (agent.terminalId === terminalId && agent.active) {
        agent.active = false
        changed = true
      }
    }
    if (changed) this.emitUpdate()
  }

  clearTerminal(terminalId: string) {
    const timer = this.inactivityTimers.get(terminalId)
    if (timer) clearTimeout(timer)
    this.inactivityTimers.delete(terminalId)

    for (const [key, agent] of this.agents) {
      if (agent.terminalId === terminalId) {
        this.agents.delete(key)
      }
    }
  }

  getAll(): DetectedAgent[] {
    return Array.from(this.agents.values())
  }

  getActive(): DetectedAgent[] {
    return Array.from(this.agents.values()).filter((a) => a.active)
  }

  private emitUpdate() {
    if (this.callback) {
      this.callback(this.getAll())
    }
  }
}

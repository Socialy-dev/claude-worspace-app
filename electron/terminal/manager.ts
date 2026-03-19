import * as pty from 'node-pty'
import fs from 'fs'
import os from 'os'

export type TerminalState = 'alive' | 'dead' | 'restarting'

export interface ManagedTerminal {
  id: string
  pty: pty.IPty
  pid: number
  cwd: string
  state: TerminalState
  restartCount: number
  lastActivity: number
}

export interface TerminalHealthInfo {
  id: string
  state: TerminalState
  pid: number
  restartCount: number
  lastActivity: number
}

// Build a complete PATH that includes all common tool locations.
function buildFullPath(): string {
  const home = os.homedir()
  const extra = [
    `${home}/.local/bin`,
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    `${home}/.npm-global/bin`,
    `${home}/.nvm/versions/node/v22.22.0/bin`,
    `${home}/.nvm/versions/node/v20.19.4/bin`,
    `${home}/.nvm/versions/node/v18.20.8/bin`,
    `${home}/.antigravity/antigravity/bin`,
    `${home}/Downloads/google-cloud-sdk/bin`,
    '/opt/homebrew/opt/openjdk/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ]
  const existing = process.env.PATH || ''
  return [...extra, existing].filter(Boolean).join(':')
}

const FULL_PATH = buildFullPath()
const MAX_RESTART_ATTEMPTS = 5
const WATCHDOG_INTERVAL_MS = 5000

export class TerminalManager {
  private terminals = new Map<string, ManagedTerminal>()
  private watchdogInterval: ReturnType<typeof setInterval> | null = null
  private stateChangeCallback:
    | ((id: string, state: TerminalState, info: TerminalHealthInfo) => void)
    | null = null

  constructor() {
    this.startWatchdog()
  }

  /** Register a global callback for terminal state changes */
  onStateChange(
    cb: (id: string, state: TerminalState, info: TerminalHealthInfo) => void,
  ) {
    this.stateChangeCallback = cb
  }

  /**
   * Watchdog — safety net that catches processes that died without
   * triggering onExit (e.g. SIGKILL, zombie processes).
   * Runs every 5 seconds, uses process.kill(pid, 0) to probe.
   */
  private startWatchdog() {
    this.watchdogInterval = setInterval(() => {
      for (const [id, term] of this.terminals) {
        if (term.state !== 'alive') continue
        try {
          process.kill(term.pid, 0) // Signal 0 = just check existence
        } catch {
          this.markDead(id)
        }
      }
    }, WATCHDOG_INTERVAL_MS)
  }

  private markDead(id: string) {
    const term = this.terminals.get(id)
    if (!term || term.state === 'dead') return
    term.state = 'dead'
    this.emitStateChange(id)
  }

  private emitStateChange(id: string) {
    const info = this.getHealthInfo(id)
    const term = this.terminals.get(id)
    if (info && term && this.stateChangeCallback) {
      this.stateChangeCallback(id, term.state, info)
    }
  }

  create(id: string, cwd: string): pty.IPty {
    // Return existing terminal if already alive (idempotent)
    const existing = this.terminals.get(id)
    if (existing && existing.state === 'alive') {
      return existing.pty
    }

    // Clean up dead terminal with this ID
    if (existing) {
      try { existing.pty.kill() } catch {}
      this.terminals.delete(id)
    }

    let safeCwd = cwd
    if (cwd.startsWith('http://') || cwd.startsWith('https://') || !fs.existsSync(cwd)) {
      safeCwd = os.homedir()
    }

    const shell = process.env.SHELL || '/bin/zsh'

    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: safeCwd,
      env: {
        ...process.env,
        PATH: FULL_PATH,
        CW_SESSION_ID: id,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        HOME: os.homedir(),
        LANG: process.env.LANG || 'en_US.UTF-8',
      } as Record<string, string>,
    })

    const restartCount = existing?.restartCount ?? 0

    this.terminals.set(id, {
      id,
      pty: term,
      pid: term.pid,
      cwd: safeCwd,
      state: 'alive',
      restartCount,
      lastActivity: Date.now(),
    })

    return term
  }

  /**
   * Restart a terminal — kills the old pty and creates a fresh one.
   * Returns null if max restarts exceeded.
   */
  restart(id: string): pty.IPty | null {
    const existing = this.terminals.get(id)
    if (!existing) return null

    if (existing.restartCount >= MAX_RESTART_ATTEMPTS) {
      return null
    }

    const cwd = existing.cwd
    const prevRestartCount = existing.restartCount

    // Kill old process safely
    try { existing.pty.kill() } catch {}
    this.terminals.delete(id)

    // Create new one
    const newPty = this.create(id, cwd)

    // Carry over restart count (incremented)
    const managed = this.terminals.get(id)
    if (managed) {
      managed.restartCount = prevRestartCount + 1
      managed.state = 'alive'
    }

    this.emitStateChange(id)
    return newPty
  }

  /** Safe write — catches errors on dead/broken pty */
  write(id: string, data: string) {
    const term = this.terminals.get(id)
    if (!term || term.state !== 'alive') return
    try {
      term.pty.write(data)
      term.lastActivity = Date.now()
    } catch {
      this.markDead(id)
    }
  }

  /** Safe resize — catches errors on dead/broken pty */
  resize(id: string, cols: number, rows: number) {
    const term = this.terminals.get(id)
    if (!term || term.state !== 'alive') return
    try {
      term.pty.resize(cols, rows)
    } catch {
      // Terminal may already be closed — don't mark dead for resize failure
    }
  }

  kill(id: string) {
    const term = this.terminals.get(id)
    if (term) {
      try { term.pty.kill() } catch {}
      this.terminals.delete(id)
    }
  }

  killAll() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval)
      this.watchdogInterval = null
    }
    for (const [id] of this.terminals) {
      this.kill(id)
    }
  }

  /** Check if a terminal's process is actually running */
  isAlive(id: string): boolean {
    const term = this.terminals.get(id)
    if (!term || term.state !== 'alive') return false
    try {
      process.kill(term.pid, 0)
      return true
    } catch {
      this.markDead(id)
      return false
    }
  }

  getHealthInfo(id: string): TerminalHealthInfo | null {
    const term = this.terminals.get(id)
    if (!term) return null
    return {
      id: term.id,
      state: term.state,
      pid: term.pid,
      restartCount: term.restartCount,
      lastActivity: term.lastActivity,
    }
  }

  canRestart(id: string): boolean {
    const term = this.terminals.get(id)
    if (!term) return false
    return term.restartCount < MAX_RESTART_ATTEMPTS
  }

  resetRestartCount(id: string) {
    const term = this.terminals.get(id)
    if (term) term.restartCount = 0
  }

  get(id: string): ManagedTerminal | undefined {
    return this.terminals.get(id)
  }

  getAll(): ManagedTerminal[] {
    return Array.from(this.terminals.values())
  }
}

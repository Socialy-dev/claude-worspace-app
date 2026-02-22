import * as pty from 'node-pty'
import fs from 'fs'
import os from 'os'

export interface ManagedTerminal {
  id: string
  pty: pty.IPty
  pid: number
  cwd: string
}

// Build a complete PATH that includes all common tool locations.
// This ensures gh, vercel, node, nvm, claude, etc. are all found.
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

export class TerminalManager {
  private terminals = new Map<string, ManagedTerminal>()

  create(id: string, cwd: string): pty.IPty {
    // Return existing terminal if already alive (idempotent)
    const existing = this.terminals.get(id)
    if (existing) {
      return existing.pty
    }

    // If cwd is a URL or doesn't exist, fall back to home directory
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

    this.terminals.set(id, {
      id,
      pty: term,
      pid: term.pid,
      cwd: safeCwd,
    })

    return term
  }

  write(id: string, data: string) {
    this.terminals.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number) {
    try {
      this.terminals.get(id)?.pty.resize(cols, rows)
    } catch {
      // Terminal may already be closed
    }
  }

  kill(id: string) {
    const term = this.terminals.get(id)
    if (term) {
      try {
        term.pty.kill()
      } catch {
        // Already dead
      }
      this.terminals.delete(id)
    }
  }

  killAll() {
    for (const [id] of this.terminals) {
      this.kill(id)
    }
  }

  get(id: string): ManagedTerminal | undefined {
    return this.terminals.get(id)
  }

  getAll(): ManagedTerminal[] {
    return Array.from(this.terminals.values())
  }
}

import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { TerminalManager } from './terminal/manager'
import { AgentParser } from './agents/watcher'
import { ProjectScanner } from './projects/scanner'
import { GitHubFetcher } from './projects/github'
import { AppStore } from './store'
import { loadConfig as loadMorningConfig } from './morning-check/config'
import { MorningCheckRunner } from './morning-check/runner'
import {
  installLaunchAgent, uninstallLaunchAgent,
  setWakeSchedule, clearWakeSchedule,
} from './morning-check/scheduler'

let mainWindow: BrowserWindow | null = null
let terminalManager: TerminalManager
let agentParser: AgentParser
let projectScanner: ProjectScanner
let githubFetcher: GitHubFetcher
let appStore: AppStore
let morningCheckRunner: MorningCheckRunner

const isMorningCheck = process.argv.includes('--morning-check') || process.env.MORNING_CHECK === '1'

const DIST = path.join(__dirname, '../dist')
const PRELOAD = path.join(__dirname, 'preload.js')

// Track pty event disposables per terminal to prevent duplicates
interface IDisposable { dispose(): void }
const terminalDisposables = new Map<string, IDisposable[]>()

// ── Safe IPC send ─────────────────────────────────────────
// Protects against sending to destroyed/null webContents.
// This is the single most important guard against session crashes:
// if webContents is gone, we silently drop instead of throwing.
function safeSend(channel: string, ...args: unknown[]) {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args)
    }
  } catch {
    // Swallow — webContents can be destroyed between our check and the send
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for node-pty IPC
    },
  })

  // Dev or production
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(DIST, 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Prevent Electron from navigating when files are dropped on the window
  mainWindow.webContents.on('will-navigate', (e) => {
    e.preventDefault()
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // ── Renderer crash recovery ──────────────────────────────
  // If the renderer process crashes/hangs, Electron emits this event.
  // We reload the window so the user doesn't have a frozen blank screen.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'crashed' || details.reason === 'oom' || details.reason === 'killed') {
      // Wait a beat then reload — pty processes are still alive in main,
      // and terminal:create is idempotent, so the renderer can reconnect.
      setTimeout(() => {
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.reload()
          }
        } catch {}
      }, 1000)
    }
  })

  // Also handle unresponsive renderer
  mainWindow.on('unresponsive', () => {
    // Give it 5 seconds to recover, then reload
    setTimeout(() => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.reload()
          }
        }
      } catch {}
    }, 5000)
  })
}

function cleanupTerminalListeners(id: string) {
  const disposables = terminalDisposables.get(id)
  if (disposables) {
    for (const d of disposables) {
      try { d.dispose() } catch {}
    }
    terminalDisposables.delete(id)
  }
}

/**
 * Set up pty → renderer event listeners for a terminal.
 * Extracted so it can be reused by both terminal:create and terminal:restart.
 */
function setupTerminalListeners(id: string, term: import('node-pty').IPty) {
  // Clean old listeners first (prevents duplicates)
  cleanupTerminalListeners(id)

  const disposables: IDisposable[] = []

  disposables.push(
    term.onData((data: string) => {
      safeSend(`terminal:${id}:data`, data)
      agentParser.feed(id, data)
    })
  )

  disposables.push(
    term.onExit(({ exitCode }: { exitCode: number }) => {
      safeSend(`terminal:${id}:exit`, exitCode)
      agentParser.clearTerminal(id)
    })
  )

  terminalDisposables.set(id, disposables)
}

function initServices() {
  appStore = new AppStore()
  terminalManager = new TerminalManager()
  agentParser = new AgentParser()
  projectScanner = new ProjectScanner(appStore.getScanDirs())
  githubFetcher = new GitHubFetcher(appStore.getGitHubAccounts())

  // Forward terminal state changes (from watchdog) to renderer
  terminalManager.onStateChange((id, state, info) => {
    safeSend(`terminal:${id}:state`, state, info)
  })

  // Forward agent updates to renderer
  agentParser.onUpdate((agents) => {
    safeSend('agents:update', agents)
  })

  // ── Terminal IPC ──────────────────────────────────────
  ipcMain.handle('terminal:create', (_e, opts: { cwd: string; id: string }) => {
    try {
      const term = terminalManager.create(opts.id, opts.cwd)
      setupTerminalListeners(opts.id, term)
      return { pid: term.pid }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create terminal'
      return { pid: -1, error: message }
    }
  })

  ipcMain.on('terminal:write', (_e, id: string, data: string) => {
    terminalManager.write(id, data)
  })

  ipcMain.on('terminal:resize', (_e, id: string, cols: number, rows: number) => {
    // Guard against invalid dimensions (e.g. 0 cols/rows from hidden containers)
    if (cols < 2 || rows < 2) return
    terminalManager.resize(id, cols, rows)
  })

  ipcMain.handle('terminal:kill', (_e, id: string) => {
    cleanupTerminalListeners(id)
    agentParser.clearTerminal(id)
    terminalManager.kill(id)
  })

  // ── Terminal restart ────────────────────────────────────
  // The renderer calls this when a pty dies and needs to be recreated.
  // It reuses the same terminal ID so the xterm instance in the renderer
  // can keep receiving data on the same IPC channel.
  ipcMain.handle('terminal:restart', (_e, id: string) => {
    try {
      cleanupTerminalListeners(id)
      agentParser.clearTerminal(id)

      const newTerm = terminalManager.restart(id)
      if (!newTerm) {
        return { pid: -1, error: 'Max restart attempts exceeded' }
      }

      setupTerminalListeners(id, newTerm)
      return { pid: newTerm.pid }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Restart failed'
      return { pid: -1, error: message }
    }
  })

  // ── Terminal health check ──────────────────────────────
  // Renderer can poll this to verify a terminal is still alive.
  ipcMain.handle('terminal:health', (_e, id: string) => {
    const alive = terminalManager.isAlive(id)
    const info = terminalManager.getHealthInfo(id)
    return { alive, info }
  })

  // ── Agent IPC ───────────────────────────────────────
  ipcMain.handle('agents:get-active', () => {
    return agentParser.getActive()
  })

  ipcMain.handle('agents:get-all', () => {
    return agentParser.getAll()
  })

  // Legacy handlers (no-op, kept for compatibility)
  ipcMain.handle('agents:start-watch', () => {})
  ipcMain.handle('agents:stop-watch', () => {})

  // ── Projects IPC ──────────────────────────────────────
  ipcMain.handle('projects:scan-local', async () => {
    return projectScanner.scan()
  })

  ipcMain.handle('projects:fetch-github', async () => {
    return githubFetcher.fetchAll()
  })

  // ── Clone GitHub repo IPC ──────────────────────────────
  ipcMain.handle('projects:clone', async (_e, repoUrl: string, repoName: string) => {
    const safeName = path.basename(repoName).replace(/[^a-zA-Z0-9._-]/g, '-')
    if (!safeName) {
      return { path: null, error: 'Invalid repository name' }
    }

    const cloneDir = appStore.getConfig().cloneDir.replace('~', os.homedir())
    const targetPath = path.join(cloneDir, safeName)

    if (!path.resolve(targetPath).startsWith(path.resolve(cloneDir))) {
      return { path: null, error: 'Invalid target path' }
    }

    if (fs.existsSync(targetPath)) {
      return { path: targetPath, alreadyExists: true }
    }

    if (!fs.existsSync(cloneDir)) {
      fs.mkdirSync(cloneDir, { recursive: true })
    }

    try {
      const ghPath = '/opt/homebrew/bin/gh'
      if (fs.existsSync(ghPath)) {
        execFileSync(ghPath, ['repo', 'clone', repoUrl, targetPath], {
          encoding: 'utf-8', timeout: 120000,
        })
      } else {
        execFileSync('git', ['clone', `${repoUrl}.git`, targetPath], {
          encoding: 'utf-8', timeout: 120000,
        })
      }
      return { path: targetPath, alreadyExists: false }
    } catch (err: any) {
      return { path: null, error: err.message || 'Clone failed' }
    }
  })

  // ── Store IPC ─────────────────────────────────────────
  ipcMain.handle('store:get-workspaces', () => {
    return appStore.getWorkspaces()
  })

  ipcMain.handle('store:save-workspace', (_e, workspace: any) => {
    if (!workspace || typeof workspace.id !== 'string' || typeof workspace.name !== 'string' || typeof workspace.cwd !== 'string') {
      return
    }
    appStore.saveWorkspace(workspace)
  })

  ipcMain.handle('store:delete-workspace', (_e, id: string) => {
    appStore.deleteWorkspace(id)
  })

  ipcMain.handle('store:get-config', () => {
    return appStore.getConfig()
  })

  // ── Morning Check IPC ────────────────────────────────────
  morningCheckRunner = new MorningCheckRunner(terminalManager)

  ipcMain.handle('morning-check:get-config', () => {
    const config = loadMorningConfig()
    return { isMorningCheck, config }
  })

  ipcMain.handle('morning-check:auto-type', async (_e, terminalId: string, message: string) => {
    if (typeof terminalId !== 'string' || typeof message !== 'string') return
    await morningCheckRunner.autoType(terminalId, message)
  })

  ipcMain.handle('morning-check:install-schedule', () => {
    try {
      const config = loadMorningConfig()
      const { hour, minute } = config.schedule

      const appPath = app.isPackaged
        ? path.dirname(path.dirname(app.getAppPath()))
        : 'Claude Workspace'

      installLaunchAgent(appPath, hour, minute)

      if (config.wakeFromSleep) {
        const result = setWakeSchedule(hour, minute)
        if (!result.success) {
          return { success: true, warning: `LaunchAgent installed but wake schedule failed: ${result.error}` }
        }
      }

      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Installation failed'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('morning-check:uninstall-schedule', () => {
    try {
      uninstallLaunchAgent()
      clearWakeSchedule()
      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Uninstallation failed'
      return { success: false, error: message }
    }
  })
}

app.whenReady().then(() => {
  initServices()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
})

app.on('window-all-closed', () => {
  terminalManager?.killAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  terminalManager?.killAll()
})

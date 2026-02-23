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

let mainWindow: BrowserWindow | null = null
let terminalManager: TerminalManager
let agentParser: AgentParser
let projectScanner: ProjectScanner
let githubFetcher: GitHubFetcher
let appStore: AppStore

const DIST = path.join(__dirname, '../dist')
const PRELOAD = path.join(__dirname, 'preload.js')

// Track pty event disposables per terminal to prevent duplicates
interface IDisposable { dispose(): void }
const terminalDisposables = new Map<string, IDisposable[]>()

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

function initServices() {
  appStore = new AppStore()
  terminalManager = new TerminalManager()
  agentParser = new AgentParser()
  projectScanner = new ProjectScanner(appStore.getScanDirs())
  githubFetcher = new GitHubFetcher(appStore.getGitHubAccounts())

  // Forward agent updates to renderer
  agentParser.onUpdate((agents) => {
    mainWindow?.webContents.send('agents:update', agents)
  })

  // ── Terminal IPC ──────────────────────────────────────
  ipcMain.handle('terminal:create', (_e, opts: { cwd: string; id: string }) => {
    // Clean up old listeners for this terminal ID (prevents duplicates on reattach)
    cleanupTerminalListeners(opts.id)

    // Get or create the pty process (idempotent)
    const term = terminalManager.create(opts.id, opts.cwd)

    // Set up fresh event listeners
    const disposables: IDisposable[] = []

    disposables.push(
      term.onData((data: string) => {
        mainWindow?.webContents.send(`terminal:${opts.id}:data`, data)
        // Feed data to agent parser for sub-agent detection
        agentParser.feed(opts.id, data)
      })
    )

    disposables.push(
      term.onExit(({ exitCode }: { exitCode: number }) => {
        mainWindow?.webContents.send(`terminal:${opts.id}:exit`, exitCode)
        agentParser.clearTerminal(opts.id)
      })
    )

    terminalDisposables.set(opts.id, disposables)

    return { pid: term.pid }
  })

  ipcMain.on('terminal:write', (_e, id: string, data: string) => {
    terminalManager.write(id, data)
  })

  ipcMain.on('terminal:resize', (_e, id: string, cols: number, rows: number) => {
    terminalManager.resize(id, cols, rows)
  })

  ipcMain.handle('terminal:kill', (_e, id: string) => {
    cleanupTerminalListeners(id)
    agentParser.clearTerminal(id)
    terminalManager.kill(id)
  })

  // ── Agent IPC ───────────────────────────────────────
  // The agent parser works automatically via terminal data.
  // These handlers provide the renderer access to current state.
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
    // Sanitize repoName: strip path traversal, allow only safe characters
    const safeName = path.basename(repoName).replace(/[^a-zA-Z0-9._-]/g, '-')
    if (!safeName) {
      return { path: null, error: 'Invalid repository name' }
    }

    const cloneDir = appStore.getConfig().cloneDir.replace('~', os.homedir())
    const targetPath = path.join(cloneDir, safeName)

    // Verify target is inside cloneDir (prevent traversal)
    if (!path.resolve(targetPath).startsWith(path.resolve(cloneDir))) {
      return { path: null, error: 'Invalid target path' }
    }

    // Already cloned?
    if (fs.existsSync(targetPath)) {
      return { path: targetPath, alreadyExists: true }
    }

    // Ensure clone dir exists
    if (!fs.existsSync(cloneDir)) {
      fs.mkdirSync(cloneDir, { recursive: true })
    }

    try {
      // Use execFileSync (no shell) to prevent command injection
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
    // Basic validation: must have required fields
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
}

app.whenReady().then(() => {
  initServices()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
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

import { contextBridge, ipcRenderer, webUtils } from 'electron'

// Type-safe API exposed to renderer
const api = {
  // Terminal
  terminal: {
    create: (opts: { cwd: string; id: string }) =>
      ipcRenderer.invoke('terminal:create', opts) as Promise<{ pid: number; error?: string }>,
    write: (id: string, data: string) =>
      ipcRenderer.send('terminal:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send('terminal:resize', id, cols, rows),
    kill: (id: string) =>
      ipcRenderer.invoke('terminal:kill', id),
    onData: (id: string, callback: (data: string) => void) => {
      const channel = `terminal:${id}:data`
      const listener = (_e: any, data: string) => callback(data)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (id: string, callback: (code: number) => void) => {
      const channel = `terminal:${id}:exit`
      const listener = (_e: any, code: number) => callback(code)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },

    // ── Resilience APIs ──────────────────────────────────
    /** Restart a dead terminal — creates a new pty with same ID */
    restart: (id: string) =>
      ipcRenderer.invoke('terminal:restart', id) as Promise<{ pid: number; error?: string }>,

    /** Health check — verify if a terminal's process is alive */
    health: (id: string) =>
      ipcRenderer.invoke('terminal:health', id) as Promise<{
        alive: boolean
        info: { id: string; state: string; pid: number; restartCount: number; lastActivity: number } | null
      }>,

    /** Listen for terminal state changes (from watchdog) */
    onStateChange: (id: string, callback: (state: string, info: any) => void) => {
      const channel = `terminal:${id}:state`
      const listener = (_e: any, state: string, info: any) => callback(state, info)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
  },

  // Agent monitor
  agents: {
    startWatch: () => ipcRenderer.invoke('agents:start-watch'),
    stopWatch: () => ipcRenderer.invoke('agents:stop-watch'),
    getActive: () => ipcRenderer.invoke('agents:get-active'),
    getAll: () => ipcRenderer.invoke('agents:get-all'),
    onUpdate: (callback: (agents: any[]) => void) => {
      const listener = (_e: any, agents: any[]) => callback(agents)
      ipcRenderer.on('agents:update', listener)
      return () => ipcRenderer.removeListener('agents:update', listener)
    },
    // Legacy — kept for backward compatibility
    onEvent: (callback: (event: any) => void) => {
      const listener = (_e: any, event: any) => callback(event)
      ipcRenderer.on('agents:event', listener)
      return () => ipcRenderer.removeListener('agents:event', listener)
    },
  },

  // File utilities (Electron 32+ — File.path is deprecated)
  files: {
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
  },

  // Projects
  projects: {
    scanLocal: () => ipcRenderer.invoke('projects:scan-local'),
    fetchGitHub: () => ipcRenderer.invoke('projects:fetch-github'),
    clone: (repoUrl: string, repoName: string) =>
      ipcRenderer.invoke('projects:clone', repoUrl, repoName),
  },

  // Persistence
  store: {
    getWorkspaces: () => ipcRenderer.invoke('store:get-workspaces'),
    saveWorkspace: (ws: any) => ipcRenderer.invoke('store:save-workspace', ws),
    deleteWorkspace: (id: string) => ipcRenderer.invoke('store:delete-workspace', id),
    getConfig: () => ipcRenderer.invoke('store:get-config'),
  },

  // Morning Health Check
  morningCheck: {
    getConfig: () =>
      ipcRenderer.invoke('morning-check:get-config') as Promise<{
        isMorningCheck: boolean
        config: {
          enabled: boolean
          schedule: { hour: number; minute: number }
          wakeFromSleep: boolean
          defaultMessage: string
          projects: { name: string; path: string; message?: string }[]
        }
      }>,
    autoType: (terminalId: string, message: string) =>
      ipcRenderer.invoke('morning-check:auto-type', terminalId, message) as Promise<void>,
    installSchedule: () =>
      ipcRenderer.invoke('morning-check:install-schedule') as Promise<{
        success: boolean
        error?: string
        warning?: string
      }>,
    uninstallSchedule: () =>
      ipcRenderer.invoke('morning-check:uninstall-schedule') as Promise<{
        success: boolean
        error?: string
      }>,
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

// TypeScript type for renderer
export type ElectronAPI = typeof api

import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'

export interface WorkspaceConfig {
  id: string
  name: string
  project: string
  cwd: string
  panels: { id: string; label: string }[]
  createdAt: string
  lastOpenedAt: string
}

interface StoreData {
  workspaces: WorkspaceConfig[]
  config: {
    scanDirs: string[]
    githubAccounts: string[]
    cloneDir: string
  }
}

const CW_CONFIG_PATH = path.join(os.homedir(), '.cw', 'config.json')

function loadCwConfig(): { scan_dirs: string[]; github_accounts: string[]; clone_dir: string } {
  try {
    if (fs.existsSync(CW_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CW_CONFIG_PATH, 'utf-8'))
    }
  } catch {
    // Fall back to defaults
  }
  return {
    scan_dirs: ['~/Desktop', '~/Projects'],
    github_accounts: [],
    clone_dir: '~/Projects',
  }
}

export class AppStore {
  private filePath: string
  private data: StoreData

  constructor() {
    const cwConfig = loadCwConfig()
    const userDataPath = app.getPath('userData')
    this.filePath = path.join(userDataPath, 'claude-workspace-store.json')

    // Load existing or create defaults
    this.data = this.load({
      workspaces: [],
      config: {
        scanDirs: cwConfig.scan_dirs,
        githubAccounts: cwConfig.github_accounts,
        cloneDir: cwConfig.clone_dir,
      },
    })
  }

  private load(defaults: StoreData): StoreData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
        // Validate required structure exists
        if (raw && Array.isArray(raw.workspaces) && raw.config) {
          return {
            workspaces: raw.workspaces,
            config: {
              scanDirs: Array.isArray(raw.config.scanDirs) ? raw.config.scanDirs : defaults.config.scanDirs,
              githubAccounts: Array.isArray(raw.config.githubAccounts) ? raw.config.githubAccounts : defaults.config.githubAccounts,
              cloneDir: typeof raw.config.cloneDir === 'string' ? raw.config.cloneDir : defaults.config.cloneDir,
            },
          }
        }
      }
    } catch {
      // Corrupted file, use defaults
    }
    this.save(defaults)
    return defaults
  }

  private save(data?: StoreData) {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.filePath, JSON.stringify(data || this.data, null, 2))
    } catch {
      // Write error
    }
  }

  getWorkspaces(): WorkspaceConfig[] {
    return this.data.workspaces
  }

  saveWorkspace(workspace: WorkspaceConfig) {
    const idx = this.data.workspaces.findIndex((w) => w.id === workspace.id)
    if (idx >= 0) {
      this.data.workspaces[idx] = workspace
    } else {
      this.data.workspaces.push(workspace)
    }
    this.save()
  }

  deleteWorkspace(id: string) {
    this.data.workspaces = this.data.workspaces.filter((w) => w.id !== id)
    this.save()
  }

  getScanDirs(): string[] {
    return this.data.config.scanDirs
  }

  getGitHubAccounts(): string[] {
    return this.data.config.githubAccounts
  }

  getConfig() {
    return this.data.config
  }
}

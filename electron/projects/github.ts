import { execFileSync } from 'child_process'
import os from 'os'

// Electron doesn't inherit the user's shell PATH — inject common locations
const EXTRA_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  `${os.homedir()}/.nvm/versions/node/current/bin`,
  '/usr/bin',
]
const PATH = [process.env.PATH, ...EXTRA_PATHS].filter(Boolean).join(':')
const EXEC_ENV = { ...process.env, PATH }
const EXEC_OPTS = { encoding: 'utf-8' as const, timeout: 15000, env: EXEC_ENV }

// Resolve gh binary path (no shell execution)
function findGh(): string {
  for (const dir of ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']) {
    const p = `${dir}/gh`
    try { if (require('fs').existsSync(p)) return p } catch {}
  }
  return 'gh' // fallback to PATH lookup
}

export interface GitHubRepo {
  name: string
  fullName: string
  description: string
  url: string
  isPrivate: boolean
  updatedAt: string
  language: string | null
  owner: string
}

export class GitHubFetcher {
  private extraAccounts: string[]

  constructor(extraAccounts: string[]) {
    this.extraAccounts = extraAccounts
  }

  async fetchAll(): Promise<GitHubRepo[]> {
    const repos: GitHubRepo[] = []
    const fetchedAccounts = new Set<string>()

    // 1. Auto-detect the currently logged-in gh user and fetch their repos
    try {
      const gh = findGh()
      const currentUser = execFileSync(gh, ['api', 'user', '--jq', '.login'], EXEC_OPTS).trim()
      if (currentUser) {
        fetchedAccounts.add(currentUser)
        const userRepos = this.fetchForAccount('')  // empty = current user's repos
        repos.push(...userRepos.map(r => ({ ...r, owner: currentUser })))
      }
    } catch {
      // gh not logged in or not installed
    }

    // 2. Fetch for any additional configured accounts (orgs, second GitHub, etc.)
    for (const account of this.extraAccounts) {
      if (fetchedAccounts.has(account)) continue
      fetchedAccounts.add(account)
      try {
        const accountRepos = this.fetchForAccount(account)
        repos.push(...accountRepos)
      } catch {
        // Skip failed accounts
      }
    }

    return repos.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  }

  private fetchForAccount(account: string): GitHubRepo[] {
    const gh = findGh()
    const jsonFields = 'name,nameWithOwner,description,url,isPrivate,updatedAt,primaryLanguage'

    // Use execFileSync (array args, no shell) to prevent command injection
    const args = account
      ? ['repo', 'list', account, '--limit', '50', '--json', jsonFields]
      : ['repo', 'list', '--limit', '50', '--json', jsonFields]

    const result = execFileSync(gh, args, EXEC_OPTS)

    let parsed: any[]
    try {
      parsed = JSON.parse(result)
    } catch {
      return []
    }

    if (!Array.isArray(parsed)) return []

    return parsed.map((repo: any) => ({
      name: repo.name,
      fullName: repo.nameWithOwner,
      description: repo.description || '',
      url: repo.url,
      isPrivate: repo.isPrivate,
      updatedAt: repo.updatedAt,
      language: repo.primaryLanguage?.name || null,
      owner: account || repo.nameWithOwner?.split('/')[0] || '',
    }))
  }
}

import fs from 'fs'
import path from 'path'
import os from 'os'

export interface LocalProject {
  name: string
  path: string
  hasGit: boolean
  lastModified: number
}

export class ProjectScanner {
  private dirs: string[]

  constructor(dirs: string[]) {
    this.dirs = dirs.map((d) => d.replace('~', os.homedir()))
  }

  scan(): LocalProject[] {
    const projects: LocalProject[] = []

    for (const dir of this.dirs) {
      if (!fs.existsSync(dir)) continue

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('.')) continue

          const fullPath = path.join(dir, entry.name)
          const hasGit = fs.existsSync(path.join(fullPath, '.git'))

          let lastModified = 0
          try {
            lastModified = fs.statSync(fullPath).mtimeMs
          } catch {
            // Skip stat errors
          }

          projects.push({
            name: entry.name,
            path: fullPath,
            hasGit,
            lastModified,
          })
        }
      } catch {
        // Skip directories we can't read
      }
    }

    return projects.sort((a, b) => b.lastModified - a.lastModified)
  }
}

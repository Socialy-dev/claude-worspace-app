import { useState, useEffect } from 'react'

export interface LocalProject {
  name: string
  path: string
  hasGit: boolean
  lastModified: number
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

export function useProjects() {
  const [localProjects, setLocalProjects] = useState<LocalProject[]>([])
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [local, github] = await Promise.all([
          window.electronAPI.projects.scanLocal(),
          window.electronAPI.projects.fetchGitHub(),
        ])
        setLocalProjects(local)
        setGithubRepos(github)
      } catch {
        // Silently handle errors
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const refresh = async () => {
    setLoading(true)
    try {
      const [local, github] = await Promise.all([
        window.electronAPI.projects.scanLocal(),
        window.electronAPI.projects.fetchGitHub(),
      ])
      setLocalProjects(local)
      setGithubRepos(github)
    } finally {
      setLoading(false)
    }
  }

  return { localProjects, githubRepos, loading, refresh }
}

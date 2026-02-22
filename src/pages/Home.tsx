import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Terminal, RefreshCw } from 'lucide-react'
import RecentWorkspaces from '../components/home/RecentWorkspaces'
import ProjectList from '../components/home/ProjectList'
import { useProjects } from '../hooks/useProjects'

export default function Home() {
  const navigate = useNavigate()
  const { localProjects, githubRepos, loading, refresh } = useProjects()
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [cloning, setCloning] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.store.getWorkspaces().then(setWorkspaces).catch(() => {})
  }, [])

  const createWorkspace = async (name: string, cwd: string) => {
    let finalCwd = cwd

    // If cwd is a GitHub URL, clone the repo first
    if (cwd.startsWith('http://') || cwd.startsWith('https://')) {
      setCloning(name)
      try {
        const result = await window.electronAPI.projects.clone(cwd, name)
        if (result.path) {
          finalCwd = result.path
        } else {
          setCloning(null)
          return // Clone failed
        }
      } catch {
        setCloning(null)
        return
      }
      setCloning(null)
    }

    const id = `ws-${Date.now()}`
    const workspace = {
      id,
      name,
      project: name,
      cwd: finalCwd,
      panels: [{ id: `panel-${Date.now()}`, label: 'Claude 1' }],
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    }
    window.electronAPI.store.saveWorkspace(workspace)
    navigate(`/workspace/${id}?cwd=${encodeURIComponent(finalCwd)}&name=${encodeURIComponent(name)}`)
  }

  const openWorkspace = (ws: any) => {
    ws.lastOpenedAt = new Date().toISOString()
    window.electronAPI.store.saveWorkspace(ws)
    navigate(`/workspace/${ws.id}?cwd=${encodeURIComponent(ws.cwd)}&name=${encodeURIComponent(ws.name)}`)
  }

  const deleteWorkspace = (id: string) => {
    window.electronAPI.store.deleteWorkspace(id)
    setWorkspaces((prev) => prev.filter((w) => w.id !== id))
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-claude-text flex items-center gap-3">
              <Terminal className="w-7 h-7 text-claude-accent" />
              Claude Workspace
            </h1>
            <p className="text-claude-muted text-sm mt-1">
              Multi-instance Claude Code environment
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-claude-surface transition-colors text-claude-muted hover:text-claude-text"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Recent Workspaces */}
        <RecentWorkspaces
          workspaces={workspaces}
          onOpen={openWorkspace}
          onDelete={deleteWorkspace}
        />

        {/* Projects */}
        <ProjectList
          localProjects={localProjects}
          githubRepos={githubRepos}
          loading={loading}
          onSelect={createWorkspace}
        />
      </motion.div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Search, FolderGit2, Github, Lock, Globe } from 'lucide-react'

interface Props {
  currentCwd: string
  onSelect: (cwd: string, label: string) => void
  onClose: () => void
}

export default function ProjectPicker({ currentCwd, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [localProjects, setLocalProjects] = useState<any[]>([])
  const [githubRepos, setGithubRepos] = useState<any[]>([])
  const [tab, setTab] = useState<'local' | 'github'>('local')

  useEffect(() => {
    window.electronAPI.projects.scanLocal().then(setLocalProjects)
    window.electronAPI.projects.fetchGitHub().then(setGithubRepos)
  }, [])

  const filtered = tab === 'local'
    ? localProjects.filter((p: any) => p.name.toLowerCase().includes(search.toLowerCase()))
    : githubRepos.filter((r: any) =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.description?.toLowerCase().includes(search.toLowerCase())
      )

  const handleGitHubSelect = async (repo: any) => {
    const result = await window.electronAPI.projects.clone(repo.url, repo.name)
    if (result.path) {
      onSelect(result.path, repo.name)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-h-[70vh] bg-claude-bg border border-white/10 rounded-xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h3 className="text-sm font-medium text-claude-text">
            Choose project for new panel
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-claude-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Same project shortcut */}
        <div className="px-4 pt-3">
          <button
            onClick={() => {
              const name = currentCwd.split('/').pop() || 'Claude'
              onSelect(currentCwd, name)
            }}
            className="w-full p-3 rounded-lg bg-claude-accent/10 border border-claude-accent/20 hover:bg-claude-accent/20 text-left transition-colors"
          >
            <div className="text-xs font-medium text-claude-accent">Same project (current)</div>
            <div className="text-[10px] text-claude-muted truncate mt-0.5">{currentCwd}</div>
          </button>
        </div>

        {/* Search + tabs */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-claude-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              autoFocus
              className="w-full pl-8 pr-3 py-1.5 bg-claude-surface/50 border border-white/5 rounded-lg text-xs text-claude-text placeholder-claude-muted/50 outline-none focus:border-claude-accent/30"
            />
          </div>
          <div className="flex bg-claude-surface/30 rounded-lg p-0.5">
            <button
              onClick={() => setTab('local')}
              className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                tab === 'local' ? 'bg-claude-surface text-claude-text' : 'text-claude-muted'
              }`}
            >
              Local
            </button>
            <button
              onClick={() => setTab('github')}
              className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                tab === 'github' ? 'bg-claude-surface text-claude-text' : 'text-claude-muted'
              }`}
            >
              GitHub
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
          {tab === 'local' && filtered.map((p: any) => (
            <button
              key={p.path}
              onClick={() => onSelect(p.path, p.name)}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-claude-surface/50 text-left transition-colors"
            >
              <FolderGit2 className={`w-4 h-4 flex-shrink-0 ${p.hasGit ? 'text-claude-green' : 'text-claude-muted'}`} />
              <div className="min-w-0">
                <div className="text-xs text-claude-text truncate">{p.name}</div>
                <div className="text-[10px] text-claude-muted truncate">{p.path}</div>
              </div>
            </button>
          ))}

          {tab === 'github' && filtered.map((r: any) => (
            <button
              key={r.fullName}
              onClick={() => handleGitHubSelect(r)}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-claude-surface/50 text-left transition-colors"
            >
              <Github className="w-4 h-4 text-claude-muted flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-claude-text truncate">{r.name}</span>
                  {r.isPrivate ? <Lock className="w-3 h-3 text-claude-orange" /> : <Globe className="w-3 h-3 text-claude-green" />}
                </div>
                {r.description && <div className="text-[10px] text-claude-muted truncate">{r.description}</div>}
              </div>
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-8 text-claude-muted text-xs">No projects found</div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

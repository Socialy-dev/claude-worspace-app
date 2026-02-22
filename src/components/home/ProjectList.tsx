import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  FolderGit2,
  Github,
  Lock,
  Globe,
  Search,
  Loader2,
} from 'lucide-react'
import type { LocalProject, GitHubRepo } from '../../hooks/useProjects'

interface Props {
  localProjects: LocalProject[]
  githubRepos: GitHubRepo[]
  loading: boolean
  onSelect: (name: string, cwd: string) => void
}

export default function ProjectList({
  localProjects,
  githubRepos,
  loading,
  onSelect,
}: Props) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'local' | 'github'>('local')

  const filteredLocal = localProjects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const filteredGithub = githubRepos.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.description?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {/* Search + tabs */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-claude-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-9 pr-4 py-2 bg-claude-surface/50 border border-white/5 rounded-lg text-sm text-claude-text placeholder-claude-muted/50 outline-none focus:border-claude-accent/30 transition-colors"
          />
        </div>

        <div className="flex bg-claude-surface/30 rounded-lg p-0.5">
          <button
            onClick={() => setTab('local')}
            className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
              tab === 'local'
                ? 'bg-claude-surface text-claude-text'
                : 'text-claude-muted hover:text-claude-text'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5 inline mr-1.5" />
            Local ({filteredLocal.length})
          </button>
          <button
            onClick={() => setTab('github')}
            className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
              tab === 'github'
                ? 'bg-claude-surface text-claude-text'
                : 'text-claude-muted hover:text-claude-text'
            }`}
          >
            <Github className="w-3.5 h-3.5 inline mr-1.5" />
            GitHub ({filteredGithub.length})
          </button>
        </div>

        {loading && <Loader2 className="w-4 h-4 text-claude-muted animate-spin" />}
      </div>

      {/* Project list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {tab === 'local' &&
          filteredLocal.map((project, i) => (
            <motion.div
              key={project.path}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              onClick={() => onSelect(project.name, project.path)}
              className="flex items-center gap-3 p-3 rounded-lg bg-claude-surface/30 border border-white/5 hover:border-claude-accent/20 cursor-pointer transition-all hover:bg-claude-surface/60 group"
            >
              <FolderGit2
                className={`w-5 h-5 flex-shrink-0 ${
                  project.hasGit ? 'text-claude-green' : 'text-claude-muted'
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-claude-text truncate group-hover:text-white">
                  {project.name}
                </div>
                <div className="text-[10px] text-claude-muted truncate">
                  {project.path}
                </div>
              </div>
            </motion.div>
          ))}

        {tab === 'github' &&
          filteredGithub.map((repo, i) => (
            <motion.div
              key={repo.fullName}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              onClick={() => onSelect(repo.name, repo.url)}
              className="flex items-center gap-3 p-3 rounded-lg bg-claude-surface/30 border border-white/5 hover:border-claude-accent/20 cursor-pointer transition-all hover:bg-claude-surface/60 group"
            >
              <Github className="w-5 h-5 text-claude-muted flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-claude-text truncate group-hover:text-white">
                    {repo.name}
                  </span>
                  {repo.isPrivate ? (
                    <Lock className="w-3 h-3 text-claude-orange flex-shrink-0" />
                  ) : (
                    <Globe className="w-3 h-3 text-claude-green flex-shrink-0" />
                  )}
                </div>
                {repo.description && (
                  <div className="text-[10px] text-claude-muted truncate">
                    {repo.description}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  {repo.language && (
                    <span className="text-[10px] text-claude-muted">
                      {repo.language}
                    </span>
                  )}
                  <span className="text-[10px] text-claude-muted/50">
                    {repo.owner}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
      </div>

      {tab === 'local' && filteredLocal.length === 0 && !loading && (
        <div className="text-center py-12 text-claude-muted text-sm">
          No local projects found.
        </div>
      )}

      {tab === 'github' && filteredGithub.length === 0 && !loading && (
        <div className="text-center py-12 text-claude-muted text-sm">
          No GitHub repos found. Make sure <code>gh</code> CLI is authenticated.
        </div>
      )}
    </div>
  )
}

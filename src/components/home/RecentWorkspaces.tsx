import { motion } from 'framer-motion'
import { Clock, Trash2, FolderOpen } from 'lucide-react'

interface WorkspaceConfig {
  id: string
  name: string
  cwd: string
  lastOpenedAt: string
  panels: { id: string; label: string }[]
}

interface Props {
  workspaces: WorkspaceConfig[]
  onOpen: (ws: WorkspaceConfig) => void
  onDelete: (id: string) => void
}

export default function RecentWorkspaces({ workspaces, onOpen, onDelete }: Props) {
  if (workspaces.length === 0) return null

  const sorted = [...workspaces].sort(
    (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
  )

  return (
    <div className="mb-8">
      <h2 className="text-sm font-medium text-claude-muted mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4" />
        Recent Workspaces
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.slice(0, 6).map((ws, i) => (
          <motion.div
            key={ws.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onOpen(ws)}
            className="group relative p-4 rounded-xl bg-claude-surface/50 border border-white/5 hover:border-claude-accent/30 cursor-pointer transition-all hover:bg-claude-surface/80"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-claude-text truncate">
                  {ws.name}
                </h3>
                <p className="text-[11px] text-claude-muted truncate mt-1">
                  {ws.cwd}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(ws.id)
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-claude-muted hover:text-claude-accent transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-3 mt-3">
              <span className="text-[10px] text-claude-muted">
                {ws.panels.length} panel{ws.panels.length !== 1 ? 's' : ''}
              </span>
              <span className="text-[10px] text-claude-muted">
                {timeAgo(ws.lastOpenedAt)}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

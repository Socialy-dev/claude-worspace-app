import { motion } from 'framer-motion'
import { Cpu, CheckCircle, Clock, Wrench, Coins } from 'lucide-react'
import type { DetectedAgent } from '../../hooks/useAgents'

interface Props {
  agents: DetectedAgent[]
  completed: DetectedAgent[]
}

export default function AgentMonitor({ agents, completed }: Props) {
  return (
    <div className="h-full flex flex-col bg-claude-bg/50 w-80">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5">
        <h3 className="text-sm font-medium text-claude-text flex items-center gap-2">
          <Cpu className="w-4 h-4 text-claude-green" />
          Sub-Agents
          {agents.length > 0 && (
            <span className="ml-auto px-1.5 py-0.5 rounded-full bg-claude-green/20 text-claude-green text-[10px]">
              {agents.length} active
            </span>
          )}
        </h3>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {agents.length === 0 && completed.length === 0 && (
          <div className="text-center py-8 text-claude-muted text-xs">
            No agent activity yet.
            <br />
            Agents will appear here when Claude Code spawns sub-agents.
          </div>
        )}

        {/* Active agents */}
        {agents.map((agent) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="p-3 rounded-lg bg-claude-green/5 border border-claude-green/20"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2 h-2 rounded-full bg-claude-green animate-pulse flex-shrink-0" />
              <span className="text-xs font-medium text-claude-text truncate">
                {agent.name}
              </span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 text-[10px] text-claude-muted mb-1">
              <span className="flex items-center gap-1">
                <Wrench className="w-3 h-3" />
                {agent.toolUses} tools
              </span>
              <span className="flex items-center gap-1">
                <Coins className="w-3 h-3" />
                {agent.tokens}
              </span>
            </div>

            {/* Current status */}
            {agent.status && (
              <div className="text-[10px] text-claude-green/70 truncate mt-1">
                {agent.status}
              </div>
            )}

            <div className="text-[10px] text-claude-muted/50 flex items-center gap-1 mt-1.5">
              <Clock className="w-3 h-3" />
              {new Date(agent.detectedAt).toLocaleTimeString()}
            </div>
          </motion.div>
        ))}

        {/* Completed agents */}
        {completed.slice(-20).reverse().map((agent) => (
          <motion.div
            key={`${agent.id}-done`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-3 rounded-lg bg-white/[0.02] border border-white/5"
          >
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-3 h-3 text-claude-muted flex-shrink-0" />
              <span className="text-xs text-claude-muted truncate">
                {agent.name}
              </span>
            </div>

            <div className="flex items-center gap-3 text-[10px] text-claude-muted/60">
              <span>{agent.toolUses} tools</span>
              <span>{agent.tokens}</span>
            </div>

            {agent.status && (
              <div className="text-[10px] text-claude-muted/50 truncate mt-0.5">
                {agent.status}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'

export interface DetectedAgent {
  id: string
  terminalId: string
  name: string
  toolUses: number
  tokens: string
  status: string
  active: boolean
  detectedAt: number
}

export function useAgents() {
  const [agents, setAgents] = useState<DetectedAgent[]>([])

  useEffect(() => {
    // Load currently active agents
    window.electronAPI.agents
      .getAll()
      .then((all: DetectedAgent[]) => {
        if (Array.isArray(all)) setAgents(all)
      })
      .catch(() => {
        // IPC not ready yet or failed — ignore
      })

    // Listen for real-time updates from agent parser
    const removeListener = window.electronAPI.agents.onUpdate(
      (updatedAgents: DetectedAgent[]) => {
        if (Array.isArray(updatedAgents)) {
          setAgents(updatedAgents)
        }
      }
    )

    return () => {
      removeListener()
    }
  }, [])

  const activeAgents = agents.filter((a) => a.active)
  const completedAgents = agents.filter((a) => !a.active)

  return { agents: activeAgents, completed: completedAgents, allAgents: agents }
}

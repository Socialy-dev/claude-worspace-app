import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Activity, LayoutGrid, Rows3, X,
  Maximize2, Minimize2, Plus, Terminal,
} from 'lucide-react'
import TerminalPanel from '../components/workspace/TerminalPanel'
import AgentMonitor from '../components/workspace/AgentMonitor'
import ProjectPicker from '../components/workspace/ProjectPicker'
import { useWorkspaceStore, type Tab } from '../store/workspace'
import { useAgents } from '../hooks/useAgents'

function getGridClass(tab: Tab, maximizedId: string | null): string {
  const count = maximizedId ? 1 : tab.instances.length
  if (count <= 1) return 'grid-cols-1 grid-rows-1'
  if (count === 2) return 'grid-cols-2 grid-rows-1'
  if (count <= 4) return 'grid-cols-2 grid-rows-2'
  if (count <= 6) return 'grid-cols-3 grid-rows-2'
  return 'grid-cols-3 grid-rows-3'
}

export default function Workspace() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const cwd = searchParams.get('cwd') || '~'
  const name = searchParams.get('name') || 'Workspace'
  const [showPicker, setShowPicker] = useState(false)
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const initDone = useRef(false)

  const {
    tabs, activeTab, agentMonitorOpen, maximizedInstance,
    init, addTab, removeTab, setActiveTab, renameTab,
    addInstance, removeInstance, setActiveInstance,
    toggleSplit, toggleMaximize, toggleAgentMonitor,
  } = useWorkspaceStore()

  const { agents, completed } = useAgents()

  // Only initialize once per workspace load
  useEffect(() => {
    if (id && !initDone.current) {
      initDone.current = true
      init(cwd, name)
    }
  }, [id, cwd, name, init])

  const currentTab = tabs.find((t) => t.id === activeTab)

  // [+] in tab bar → project picker → new independent tab
  const handleAddTab = () => setShowPicker(true)

  const handlePickerSelect = (pickedCwd: string, pickedLabel: string) => {
    addTab(pickedCwd, pickedLabel)
    setShowPicker(false)
  }

  const startRenameTab = (tabId: string, currentLabel: string) => {
    setEditingTabId(tabId)
    setEditValue(currentLabel)
  }

  const commitRenameTab = () => {
    if (editingTabId && editValue.trim()) {
      renameTab(editingTabId, editValue.trim())
    }
    setEditingTabId(null)
  }

  // Show instance sub-tabs in single mode when there are multiple instances
  const showInstanceTabs = currentTab && !currentTab.isSplit && currentTab.instances.length > 1

  return (
    <div className="h-full flex flex-col">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-claude-surface/50 border-b border-white/5">
        <button onClick={() => navigate('/')}
          className="p-1.5 rounded hover:bg-white/5 text-claude-muted hover:text-claude-text transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>

        <span className="text-sm text-claude-text font-medium">
          {currentTab?.label || name}
        </span>
        <span className="text-xs text-claude-muted truncate">
          {currentTab?.cwd || cwd}
        </span>

        <div className="flex-1" />

        {/* + Add Claude (to current tab) */}
        <button onClick={addInstance}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs hover:bg-white/5 text-claude-muted hover:text-claude-text transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Add Claude
        </button>

        {/* Split toggle */}
        <button onClick={toggleSplit}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
            currentTab?.isSplit
              ? 'bg-claude-panel/50 text-claude-green'
              : 'hover:bg-white/5 text-claude-muted hover:text-claude-text'
          }`}>
          {currentTab?.isSplit
            ? <><Rows3 className="w-3.5 h-3.5" /> Tabs</>
            : <><LayoutGrid className="w-3.5 h-3.5" /> Split</>
          }
        </button>

        {/* Agents */}
        <button onClick={toggleAgentMonitor}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
            agentMonitorOpen
              ? 'bg-claude-accent/20 text-claude-accent'
              : 'hover:bg-white/5 text-claude-muted hover:text-claude-text'
          }`}>
          <Activity className="w-3.5 h-3.5" />
          Agents
          {agents.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-claude-green/20 text-claude-green text-[10px]">
              {agents.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Tab bar (independent projects) ── */}
      <div className="flex items-center bg-claude-surface/30 border-b border-white/5 px-2">
        {tabs.map((tab) => (
          <div key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onDoubleClick={() => startRenameTab(tab.id, tab.label)}
            className={`group flex items-center gap-2 px-3 py-2 text-xs cursor-pointer border-b-2 transition-colors ${
              tab.id === activeTab
                ? 'border-claude-accent text-claude-text bg-white/[0.03]'
                : 'border-transparent text-claude-muted hover:text-claude-text hover:bg-white/[0.02]'
            }`}>
            {editingTabId === tab.id ? (
              <input autoFocus value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitRenameTab}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRenameTab()
                  if (e.key === 'Escape') setEditingTabId(null)
                }}
                className="bg-transparent border-b border-claude-accent text-claude-text text-xs w-24 outline-none" />
            ) : (
              <>
                <span className="truncate max-w-[120px]">{tab.label}</span>
                <span className="text-[9px] text-claude-muted/40">
                  {tab.instances.length > 1 ? `${tab.instances.length}x` : ''}
                </span>
              </>
            )}
            {tabs.length > 1 && (
              <button onClick={(e) => { e.stopPropagation(); removeTab(tab.id) }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-all">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}

        {/* [+] = new independent tab (project picker) */}
        <button onClick={handleAddTab}
          className="p-2 text-claude-muted hover:text-claude-text hover:bg-white/[0.03] rounded transition-colors ml-1"
          title="New project tab">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Instance sub-tabs (single mode with multiple instances) ── */}
      {showInstanceTabs && (
        <div className="flex items-center bg-claude-surface/20 border-b border-white/5 px-3 gap-1">
          {currentTab.instances.map((inst) => (
            <button
              key={inst.id}
              onClick={() => setActiveInstance(inst.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-t transition-colors ${
                inst.id === currentTab.activeInstance
                  ? 'text-claude-text bg-white/[0.05] border-b-2 border-claude-green'
                  : 'text-claude-muted hover:text-claude-text hover:bg-white/[0.02]'
              }`}
            >
              <Terminal className="w-3 h-3" />
              {inst.label}
              {currentTab.instances.length > 1 && (
                <span
                  onClick={(e) => { e.stopPropagation(); removeInstance(inst.id) }}
                  className="opacity-0 hover:opacity-100 p-0.5 rounded hover:bg-white/10 cursor-pointer transition-all"
                >
                  <X className="w-2.5 h-2.5" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      {/*
        CRITICAL: Render ALL tabs with ALL instances ALWAYS.
        Use CSS display:none for inactive tabs/instances.
        This prevents React from unmounting TerminalPanels
        when switching tabs or toggling split mode.
      */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          {tabs.map((tab) => {
            const isActiveTab = tab.id === activeTab

            return (
              <div
                key={tab.id}
                className="absolute inset-0"
                style={{ display: isActiveTab ? 'block' : 'none' }}
              >
                {/*
                  Single render path for both split and single mode.
                  Only CSS classes change — React never unmounts the TerminalPanels.
                */}
                <div className={
                  tab.isSplit
                    ? `h-full grid ${getGridClass(tab, maximizedInstance)} gap-[1px] bg-white/5`
                    : 'h-full relative'
                }>
                  {tab.instances.map((inst) => {
                    const isVisible = tab.isSplit
                      ? (maximizedInstance ? inst.id === maximizedInstance : true)
                      : inst.id === tab.activeInstance

                    return (
                      <div
                        key={inst.id}
                        className={
                          tab.isSplit
                            ? 'relative bg-claude-bg group flex flex-col min-h-0'
                            : 'absolute inset-0'
                        }
                        style={{
                          display: isVisible
                            ? (tab.isSplit ? 'flex' : 'block')
                            : 'none',
                        }}
                      >
                        {/* Instance header — always rendered, hidden when not split.
                            This ensures stable DOM children so React doesn't
                            unmount the terminal div when toggling split. */}
                        <div
                          className="flex items-center justify-between px-3 py-1 bg-claude-surface/30 border-b border-white/5 flex-shrink-0"
                          style={{ display: tab.isSplit ? 'flex' : 'none' }}
                        >
                          <span className="text-[11px] font-medium text-claude-muted truncate">
                            {inst.label}
                          </span>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleMaximize(inst.id) }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 text-claude-muted transition-all"
                            >
                              {maximizedInstance === inst.id
                                ? <Minimize2 className="w-3 h-3" />
                                : <Maximize2 className="w-3 h-3" />
                              }
                            </button>
                            {tab.instances.length > 1 && !maximizedInstance && (
                              <button
                                onClick={(e) => { e.stopPropagation(); removeInstance(inst.id) }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 text-claude-muted transition-all"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Terminal — always mounted, never unmounted */}
                        <div className={tab.isSplit ? 'flex-1 min-h-0' : 'h-full'}>
                          <TerminalPanel id={inst.id} cwd={tab.cwd} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Agent Monitor */}
        <AnimatePresence>
          {agentMonitorOpen && (
            <motion.div initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-l border-white/5 overflow-hidden">
              <AgentMonitor agents={agents} completed={completed} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Project Picker */}
      <AnimatePresence>
        {showPicker && (
          <ProjectPicker currentCwd={cwd}
            onSelect={handlePickerSelect}
            onClose={() => setShowPicker(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}

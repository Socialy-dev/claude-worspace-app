import { create } from 'zustand'

// An Instance = one Claude Code terminal inside a tab
export interface Instance {
  id: string
  label: string
}

// A Tab = one independent project workspace, with 1..N Claude instances
export interface Tab {
  id: string
  label: string
  cwd: string
  instances: Instance[]
  activeInstance: string
  isSplit: boolean
}

export interface WorkspaceState {
  tabs: Tab[]
  activeTab: string
  agentMonitorOpen: boolean
  maximizedInstance: string | null

  // Init
  init: (cwd: string, label: string) => void

  // Tab actions
  addTab: (cwd: string, label: string) => void
  removeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  renameTab: (tabId: string, label: string) => void

  // Instance actions (inside active tab)
  addInstance: () => void
  removeInstance: (instanceId: string) => void
  setActiveInstance: (instanceId: string) => void

  // Split & maximize (per tab)
  toggleSplit: () => void
  toggleMaximize: (instanceId: string) => void

  // Agent monitor
  toggleAgentMonitor: () => void
}

let counter = 0
function uid() {
  counter++
  return `${Date.now()}-${counter}`
}

function makeInstance(label: string): Instance {
  return { id: `inst-${uid()}`, label }
}

function makeTab(cwd: string, label: string): Tab {
  const inst = makeInstance('Claude 1')
  return {
    id: `tab-${uid()}`,
    label,
    cwd,
    instances: [inst],
    activeInstance: inst.id,
    isSplit: false,
  }
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  tabs: [],
  activeTab: '',
  agentMonitorOpen: false,
  maximizedInstance: null,

  init: (cwd, label) => {
    // Kill all existing pty processes before re-initializing (prevents leaks)
    const s = get()
    for (const tab of s.tabs) {
      for (const inst of tab.instances) {
        window.electronAPI.terminal.kill(inst.id)
      }
    }
    const tab = makeTab(cwd, label)
    set({
      tabs: [tab],
      activeTab: tab.id,
      maximizedInstance: null,
    })
  },

  addTab: (cwd, label) => {
    const tab = makeTab(cwd, label)
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTab: tab.id,
      maximizedInstance: null,
    }))
  },

  removeTab: (tabId) => {
    const s = get()
    const tab = s.tabs.find((t) => t.id === tabId)
    // Kill all instances' pty processes
    if (tab) {
      for (const inst of tab.instances) {
        window.electronAPI.terminal.kill(inst.id)
      }
    }
    const tabs = s.tabs.filter((t) => t.id !== tabId)
    const activeTab =
      s.activeTab === tabId
        ? tabs[tabs.length - 1]?.id || ''
        : s.activeTab
    // Reset maximizedInstance to prevent stale reference causing blank workspace
    set({ tabs, activeTab, maximizedInstance: null })
  },

  setActiveTab: (tabId) => set({ activeTab: tabId, maximizedInstance: null }),

  renameTab: (tabId, label) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
    }))
  },

  addInstance: () => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTab)
      if (!tab) return s
      const n = tab.instances.length + 1
      const inst = makeInstance(`Claude ${n}`)
      return {
        tabs: s.tabs.map((t) =>
          t.id === s.activeTab
            ? { ...t, instances: [...t.instances, inst], activeInstance: inst.id }
            : t
        ),
      }
    })
  },

  removeInstance: (instanceId) => {
    window.electronAPI.terminal.kill(instanceId)
    set((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTab)
      if (!tab) return s
      const instances = tab.instances.filter((i) => i.id !== instanceId)
      if (instances.length === 0) return s // Don't remove last
      const activeInstance =
        tab.activeInstance === instanceId
          ? instances[instances.length - 1].id
          : tab.activeInstance
      return {
        tabs: s.tabs.map((t) =>
          t.id === s.activeTab ? { ...t, instances, activeInstance } : t
        ),
        maximizedInstance: s.maximizedInstance === instanceId ? null : s.maximizedInstance,
      }
    })
  },

  setActiveInstance: (instanceId) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === s.activeTab ? { ...t, activeInstance: instanceId } : t
      ),
    }))
  },

  toggleSplit: () => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === s.activeTab ? { ...t, isSplit: !t.isSplit } : t
      ),
      maximizedInstance: null,
    }))
  },

  toggleMaximize: (instanceId) => {
    set((s) => ({
      maximizedInstance: s.maximizedInstance === instanceId ? null : instanceId,
    }))
  },

  toggleAgentMonitor: () =>
    set((s) => ({ agentMonitorOpen: !s.agentMonitorOpen })),
}))

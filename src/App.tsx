import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Workspace from './pages/Workspace'

export default function App() {
  return (
    <div className="h-full flex flex-col bg-claude-bg">
      {/* macOS titlebar drag area */}
      <div className="titlebar-drag h-8 flex-shrink-0 flex items-center px-20">
        <span className="text-claude-muted text-xs titlebar-no-drag">
          Claude Workspace
        </span>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/workspace/:id" element={<Workspace />} />
        </Routes>
      </div>
    </div>
  )
}

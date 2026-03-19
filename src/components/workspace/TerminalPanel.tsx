import { useRef, useEffect, useCallback, useState } from 'react'
import { useTerminal, type TerminalConnectionState } from '../../hooks/useTerminal'

/**
 * Escape special shell characters with backslashes (like macOS Terminal does).
 * Unlike single-quote wrapping, this preserves the file extension at the end
 * so Claude Code CLI can detect image paths with /\.(png|jpe?g|gif|webp)$/i
 */
function escapeForTerminal(filePath: string): string {
  return filePath.replace(/([ \\'"()&$!#;`|{}\[\]<>?*~])/g, '\\$1')
}

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.tif', '.heic', '.avif',
])

function hasImageFile(paths: string[]): boolean {
  return paths.some((p) => {
    const ext = p.slice(p.lastIndexOf('.')).toLowerCase()
    return IMAGE_EXTENSIONS.has(ext)
  })
}

interface Props {
  id: string
  cwd: string
  /** Whether this panel is currently visible to the user */
  isVisible?: boolean
}

export default function TerminalPanel({ id, cwd, isVisible = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const attachedRef = useRef(false)
  const [dragState, setDragState] = useState<'none' | 'file' | 'image'>('none')
  const dragCounterRef = useRef(0)
  const prevVisibleRef = useRef(isVisible)

  const onExit = useCallback((code: number) => {
    // Exit is handled by useTerminal's auto-restart logic
  }, [])

  const { attach, fit, focus, termRef, connectionState, manualRestart } = useTerminal({ id, cwd, onExit })

  // ── Attach terminal to DOM ────────────────────────────
  useEffect(() => {
    if (containerRef.current && !attachedRef.current) {
      attachedRef.current = true
      attach(containerRef.current)
    }
  }, [attach])

  // ── ResizeObserver with debounced fit ──────────────────
  // The fit() from useTerminal is already debounced, so we can
  // safely call it from the observer without flooding.
  useEffect(() => {
    const observer = new ResizeObserver(() => fit())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [fit])

  // ── Visibility change handler ─────────────────────────
  // When this panel becomes visible (tab switch), re-fit + re-focus.
  // This fixes:
  //   1. "Ultra-narrow columns" bug (fit was calculated when hidden)
  //   2. "Can't type" bug (xterm lost focus when tab was switched)
  useEffect(() => {
    const wasHidden = !prevVisibleRef.current
    prevVisibleRef.current = isVisible

    if (isVisible && wasHidden) {
      // Panel just became visible — delay slightly for CSS to settle
      const timer = setTimeout(() => {
        fit()
        focus()
      }, 80)
      return () => clearTimeout(timer)
    }
  }, [isVisible, fit, focus])

  // ── Click to focus ────────────────────────────────────
  // Extra safety: clicking anywhere on the terminal panel refocuses
  // the xterm input. Catches edge cases where xterm lost its internal focus.
  const handleClick = useCallback(() => {
    focus()
  }, [focus])

  // ── Drag and drop ─────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const isInside = (e: DragEvent) => {
      const rect = container.getBoundingClientRect()
      return (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      )
    }

    const detectImageInDrag = (e: DragEvent): boolean => {
      const items = e.dataTransfer?.items
      if (!items) return false
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) return true
        const entry = items[i].webkitGetAsEntry?.()
        if (entry?.name) {
          const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
          if (IMAGE_EXTENSIONS.has(ext)) return true
        }
      }
      return false
    }

    const onDragEnter = (e: DragEvent) => {
      if (!isInside(e)) return
      dragCounterRef.current++
      setDragState(detectImageInDrag(e) ? 'image' : 'file')
    }

    const onDragLeave = (e: DragEvent) => {
      if (!isInside(e)) {
        dragCounterRef.current = 0
        setDragState('none')
        return
      }
      dragCounterRef.current--
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0
        setDragState('none')
      }
    }

    const onDragOver = (e: DragEvent) => {
      if (!isInside(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    const onDrop = (e: DragEvent) => {
      if (!isInside(e)) return
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current = 0
      setDragState('none')

      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length === 0) return

      const paths: string[] = []
      for (const file of files) {
        try {
          const filePath = window.electronAPI.files.getPathForFile(file)
          if (filePath) paths.push(filePath)
        } catch {
          const fallback = (file as any).path as string | undefined
          if (fallback) paths.push(fallback)
        }
      }

      if (paths.length === 0) return

      const escaped = paths.map(escapeForTerminal).join(' ')
      termRef.current?.paste(escaped)
    }

    document.addEventListener('dragenter', onDragEnter, true)
    document.addEventListener('dragleave', onDragLeave, true)
    document.addEventListener('dragover', onDragOver, true)
    document.addEventListener('drop', onDrop, true)

    return () => {
      document.removeEventListener('dragenter', onDragEnter, true)
      document.removeEventListener('dragleave', onDragLeave, true)
      document.removeEventListener('dragover', onDragOver, true)
      document.removeEventListener('drop', onDrop, true)
    }
  }, [id, termRef])

  const ringClass = dragState === 'image'
    ? 'ring-2 ring-inset ring-red-500/70'
    : dragState === 'file'
      ? 'ring-2 ring-inset ring-claude-accent/50'
      : ''

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={`h-full w-full bg-[#0f0f23] relative ${ringClass}`}
    >
      {/* ── Connection state overlay ── */}
      <StateOverlay state={connectionState} onRestart={manualRestart} />
    </div>
  )
}

// ── State overlay component ─────────────────────────────
// Shows a subtle, non-blocking indicator when the terminal
// is disconnected, restarting, or has failed.
function StateOverlay({
  state,
  onRestart,
}: {
  state: TerminalConnectionState
  onRestart: () => void
}) {
  if (state === 'connected' || state === 'connecting') return null

  return (
    <div className="absolute bottom-4 right-4 z-10 pointer-events-auto">
      {state === 'disconnected' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          Disconnected — reconnecting...
        </div>
      )}

      {state === 'restarting' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs backdrop-blur-sm">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeLinecap="round" />
          </svg>
          Restarting session...
        </div>
      )}

      {state === 'failed' && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs backdrop-blur-sm">
          <span>Session lost</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRestart()
            }}
            className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors"
          >
            Restart
          </button>
        </div>
      )}
    </div>
  )
}

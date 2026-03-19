import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

// ── Types ────────────────────────────────────────────────
export type TerminalConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'restarting'
  | 'failed'

interface UseTerminalOpts {
  id: string
  cwd: string
  onExit?: (code: number) => void
}

// ── Constants ────────────────────────────────────────────
const MAX_AUTO_RESTARTS = 3
const RESTART_DELAYS = [1000, 2000, 4000] // Exponential backoff
const FIT_DEBOUNCE_MS = 150
const SCROLLBACK_LINES = 15000

// ── Helpers ──────────────────────────────────────────────
function isTerminalAtBottom(term: Terminal): boolean {
  const buf = term.buffer.active
  // At bottom when the viewport shows the last rows of the buffer
  return buf.baseY + term.rows >= buf.length
}

export function useTerminal({ id, cwd, onExit }: UseTerminalOpts) {
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cleanupRef = useRef<(() => void)[]>([])
  const disposeGuardRef = useRef(false) // Prevents double-dispose
  const autoRestartCountRef = useRef(0)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Scroll state — tracked via wheel events, not xterm internals,
  // so programmatic scrolls (fit, write) don't interfere.
  const userScrolledUpRef = useRef(false)

  const [connectionState, setConnectionState] = useState<TerminalConnectionState>('connecting')

  // ── Debounced fit ──────────────────────────────────────
  // Prevents rapid fit() calls from ResizeObserver, tab switches,
  // and window resizes from resetting the scroll position.
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedFit = useCallback(() => {
    if (fitTimerRef.current) clearTimeout(fitTimerRef.current)
    fitTimerRef.current = setTimeout(() => {
      fitTimerRef.current = null
      const term = termRef.current
      const fitAddon = fitRef.current
      const container = containerRef.current
      if (!term || !fitAddon || !container) return

      // CRITICAL: Skip fit if the container is hidden or has zero dimensions.
      // This prevents xterm from calculating cols=4 rows=1 when the tab is
      // display:none, which causes the "ultra-narrow columns" rendering bug.
      const rect = container.getBoundingClientRect()
      if (rect.width < 10 || rect.height < 10) return

      const wasAtBottom = !userScrolledUpRef.current
      try {
        fitAddon.fit()
      } catch {
        // FitAddon can throw if the terminal is disposed
      }
      // Restore scroll position after fit
      if (wasAtBottom && term.buffer.active) {
        requestAnimationFrame(() => {
          try { term.scrollToBottom() } catch {}
        })
      }
    }, FIT_DEBOUNCE_MS)
  }, [])

  // ── Restart logic ──────────────────────────────────────
  const attemptRestart = useCallback(async () => {
    // Abort if the component was unmounted — prevents orphaned pty processes
    if (disposeGuardRef.current) return

    const count = autoRestartCountRef.current
    if (count >= MAX_AUTO_RESTARTS) {
      setConnectionState('failed')
      return
    }

    setConnectionState('restarting')
    autoRestartCountRef.current = count + 1

    const delay = RESTART_DELAYS[count] ?? 4000
    const term = termRef.current
    if (term) {
      try { term.write(`\r\n\x1b[33m⟳ Reconnecting (attempt ${count + 1}/${MAX_AUTO_RESTARTS})...\x1b[0m\r\n`) } catch {}
    }

    await new Promise((r) => setTimeout(r, delay))

    // Re-check after async wait — component may have unmounted during the delay
    if (disposeGuardRef.current) return

    try {
      const result = await window.electronAPI.terminal.restart(id)

      // Final unmount check after IPC round-trip
      if (disposeGuardRef.current) {
        // Restart succeeded but component is gone — kill the orphan
        if (result.pid > 0) {
          window.electronAPI.terminal.kill(id)
        }
        return
      }

      if (result.error || result.pid === -1) {
        if (term) {
          try { term.write(`\r\n\x1b[31m✗ Restart failed: ${result.error || 'Unknown error'}\x1b[0m\r\n`) } catch {}
        }
        setConnectionState('failed')
        return
      }

      // Restart succeeded — send initial size to new pty
      if (term) {
        window.electronAPI.terminal.resize(id, term.cols, term.rows)
        try { term.write(`\r\n\x1b[32m✓ Session reconnected\x1b[0m\r\n`) } catch {}
        term.focus()
      }
      autoRestartCountRef.current = 0
      setConnectionState('connected')
    } catch {
      if (!disposeGuardRef.current) {
        setConnectionState('failed')
      }
    }
  }, [id])

  // ── Manual restart (exposed to TerminalPanel) ──────────
  const manualRestart = useCallback(async () => {
    autoRestartCountRef.current = 0
    await attemptRestart()
  }, [attemptRestart])

  // ── Attach terminal ────────────────────────────────────
  const attach = useCallback(
    async (container: HTMLDivElement) => {
      if (termRef.current) return // Already attached
      containerRef.current = container
      disposeGuardRef.current = false

      const term = new Terminal({
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorStyle: 'bar',
        scrollback: SCROLLBACK_LINES,
        theme: {
          background: '#0f0f23',
          foreground: '#e0e0e0',
          cursor: '#64ffda',
          selectionBackground: '#e9456044',
          black: '#1a1a2e',
          red: '#e94560',
          green: '#64ffda',
          yellow: '#f4845f',
          blue: '#0f3460',
          magenta: '#c678dd',
          cyan: '#56b6c2',
          white: '#e0e0e0',
          brightBlack: '#8892b0',
          brightRed: '#e94560',
          brightGreen: '#64ffda',
          brightYellow: '#f4845f',
          brightBlue: '#4fc3f7',
          brightMagenta: '#c678dd',
          brightCyan: '#56b6c2',
          brightWhite: '#ffffff',
        },
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())

      term.open(container)
      fitAddon.fit()

      termRef.current = term
      fitRef.current = fitAddon

      // ── Scroll tracking via wheel events ─────────────
      // We track user scroll intent via mouse wheel, not xterm's
      // internal scroll events, to avoid interference from
      // programmatic scrolls (fit, write, scrollToBottom).
      const handleWheel = (e: WheelEvent) => {
        if (e.deltaY < 0) {
          // Scrolling up — user wants to read history
          userScrolledUpRef.current = true
        } else if (e.deltaY > 0) {
          // Scrolling down — check if we reached the bottom
          if (isTerminalAtBottom(term)) {
            userScrolledUpRef.current = false
          }
        }
      }
      container.addEventListener('wheel', handleWheel, { passive: true })
      cleanupRef.current.push(() => container.removeEventListener('wheel', handleWheel))

      // ── IPC listeners (set up BEFORE creating pty) ───
      // pty → xterm (receive shell output)
      const removeData = window.electronAPI.terminal.onData(id, (data) => {
        try {
          term.write(data)
        } catch {
          return // Terminal might be disposed
        }
        // Auto-scroll to bottom unless user scrolled up
        if (!userScrolledUpRef.current) {
          try { term.scrollToBottom() } catch {}
        }
      })
      cleanupRef.current.push(removeData)

      // xterm → pty (send keyboard input)
      const inputDisposable = term.onData((data) => {
        window.electronAPI.terminal.write(id, data)
        // User is typing → they want to see latest output → snap to bottom
        userScrolledUpRef.current = false
      })
      cleanupRef.current.push(() => inputDisposable.dispose())

      // Handle process exit → auto-restart
      const removeExit = window.electronAPI.terminal.onExit(id, (code) => {
        try {
          term.write(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`)
        } catch {}
        onExit?.(code)
        setConnectionState('disconnected')

        // Auto-restart after a brief delay
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
        restartTimerRef.current = setTimeout(() => {
          attemptRestart()
        }, 500)
      })
      cleanupRef.current.push(removeExit)

      // Handle terminal state changes from watchdog
      const removeState = window.electronAPI.terminal.onStateChange(id, (state) => {
        if (state === 'dead') {
          setConnectionState('disconnected')
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
          restartTimerRef.current = setTimeout(() => {
            attemptRestart()
          }, 500)
        } else if (state === 'alive') {
          setConnectionState('connected')
        }
      })
      cleanupRef.current.push(removeState)

      // Handle terminal resize → send to pty
      const resizeDisposable = term.onResize(({ cols, rows }) => {
        // Guard against absurd dimensions
        if (cols >= 2 && rows >= 2) {
          window.electronAPI.terminal.resize(id, cols, rows)
        }
      })
      cleanupRef.current.push(() => resizeDisposable.dispose())

      // ── Create the pty process ─────────────────────
      try {
        const result = await window.electronAPI.terminal.create({ id, cwd })
        if (result.error) {
          term.write(`\r\n\x1b[31m[Failed to start terminal: ${result.error}]\x1b[0m\r\n`)
          setConnectionState('failed')
          return
        }
        setConnectionState('connected')
        autoRestartCountRef.current = 0
      } catch (err) {
        term.write(`\r\n\x1b[31m[Failed to start terminal: ${err}]\x1b[0m\r\n`)
        setConnectionState('failed')
        return
      }

      // Send initial size to pty
      window.electronAPI.terminal.resize(id, term.cols, term.rows)
      term.focus()
    },
    [id, cwd, onExit, attemptRestart]
  )

  // ── Window resize → fit ────────────────────────────────
  useEffect(() => {
    const handleResize = () => debouncedFit()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [debouncedFit])

  // ── Visibility change (tab switch, app focus) ──────────
  // When the user switches back to this tab or the app regains focus,
  // re-fit the terminal (fixes zero-dimension bug) and re-focus it
  // (fixes the "can't type" bug).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Small delay to let CSS transitions complete
        setTimeout(() => {
          debouncedFit()
          // Re-focus the active terminal
          termRef.current?.focus()
        }, 50)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    const handleFocus = () => {
      setTimeout(() => {
        debouncedFit()
        termRef.current?.focus()
      }, 50)
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [debouncedFit])

  // ── Cleanup on unmount ─────────────────────────────────
  useEffect(() => {
    return () => {
      if (disposeGuardRef.current) return
      disposeGuardRef.current = true

      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current)
        restartTimerRef.current = null
      }
      if (fitTimerRef.current) {
        clearTimeout(fitTimerRef.current)
        fitTimerRef.current = null
      }

      for (const cleanup of cleanupRef.current) {
        try { cleanup() } catch {}
      }
      cleanupRef.current = []

      try { termRef.current?.dispose() } catch {}
      termRef.current = null
    }
  }, [])

  const fit = useCallback(() => {
    debouncedFit()
  }, [debouncedFit])

  // Focus the terminal programmatically (used by TerminalPanel on tab switch)
  const focus = useCallback(() => {
    termRef.current?.focus()
  }, [])

  return { attach, fit, focus, termRef, connectionState, manualRestart }
}

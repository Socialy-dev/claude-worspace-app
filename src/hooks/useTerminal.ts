import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface UseTerminalOpts {
  id: string
  cwd: string
  onExit?: (code: number) => void
}

export function useTerminal({ id, cwd, onExit }: UseTerminalOpts) {
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cleanupRef = useRef<(() => void)[]>([])

  const attach = useCallback(
    async (container: HTMLDivElement) => {
      if (termRef.current) return
      containerRef.current = container

      const term = new Terminal({
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorStyle: 'bar',
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

      // ─── Set up ALL IPC listeners BEFORE creating the pty ───
      // This prevents the race condition where the shell prompt
      // is emitted before the renderer listener is connected.

      // pty → xterm (receive shell output)
      const removeData = window.electronAPI.terminal.onData(id, (data) => {
        term.write(data)
      })
      cleanupRef.current.push(removeData)

      // xterm → pty (send keyboard input)
      const disposable = term.onData((data) => {
        window.electronAPI.terminal.write(id, data)
      })
      cleanupRef.current.push(() => disposable.dispose())

      // Handle process exit
      const removeExit = window.electronAPI.terminal.onExit(id, (code) => {
        term.write(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`)
        onExit?.(code)
      })
      cleanupRef.current.push(removeExit)

      // Handle terminal resize
      const resizeDisposable = term.onResize(({ cols, rows }) => {
        window.electronAPI.terminal.resize(id, cols, rows)
      })
      cleanupRef.current.push(() => resizeDisposable.dispose())

      // ─── NOW create the pty process ───
      // All listeners are ready, so we won't miss any data.
      try {
        await window.electronAPI.terminal.create({ id, cwd })
      } catch (err) {
        term.write(`\r\n\x1b[31m[Failed to start terminal: ${err}]\x1b[0m\r\n`)
      }

      // Send initial size to pty
      window.electronAPI.terminal.resize(id, term.cols, term.rows)

      // Focus so the terminal receives keyboard input immediately
      term.focus()
    },
    [id, cwd, onExit]
  )

  // Fit on window resize
  useEffect(() => {
    const handleResize = () => {
      fitRef.current?.fit()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const cleanup of cleanupRef.current) {
        cleanup()
      }
      cleanupRef.current = []
      termRef.current?.dispose()
      termRef.current = null
    }
  }, [])

  const fit = useCallback(() => {
    fitRef.current?.fit()
  }, [])

  return { attach, fit, termRef }
}

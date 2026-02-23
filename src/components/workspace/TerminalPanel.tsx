import { useRef, useEffect, useCallback, useState } from 'react'
import { useTerminal } from '../../hooks/useTerminal'

interface Props {
  id: string
  cwd: string
}

export default function TerminalPanel({ id, cwd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const attachedRef = useRef(false)
  const [isDragOver, setIsDragOver] = useState(false)

  // Stable callback — prevents useTerminal's attach from being recreated every render
  const onExit = useCallback((code: number) => {
    console.log(`Terminal ${id} exited with code ${code}`)
  }, [id])

  const { attach, fit, termRef } = useTerminal({ id, cwd, onExit })

  useEffect(() => {
    if (containerRef.current && !attachedRef.current) {
      attachedRef.current = true
      attach(containerRef.current)
    }
  }, [attach])

  // Re-fit when panel becomes visible or resized
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      fit()
    })
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }
    return () => observer.disconnect()
  }, [fit])

  // Native DOM drag-and-drop listeners in capture phase so they fire
  // before xterm's internal canvas/textarea can swallow the events
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      setIsDragOver(true)
    }

    const onDragLeave = () => {
      setIsDragOver(false)
    }

    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)

      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length === 0) return

      const paths = files.map((f: any) => f.path).filter(Boolean)
      if (paths.length === 0) return

      const escaped = paths.map((p: string) => (p.includes(' ') ? `"${p}"` : p))
      termRef.current?.paste(escaped.join(' '))
    }

    container.addEventListener('dragover', onDragOver, true)
    container.addEventListener('dragleave', onDragLeave, true)
    container.addEventListener('drop', onDrop, true)

    return () => {
      container.removeEventListener('dragover', onDragOver, true)
      container.removeEventListener('dragleave', onDragLeave, true)
      container.removeEventListener('drop', onDrop, true)
    }
  }, [termRef])

  return (
    <div
      ref={containerRef}
      className={`h-full w-full bg-[#0f0f23] relative ${isDragOver ? 'ring-2 ring-inset ring-claude-accent/50' : ''}`}
    />
  )
}

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

  const { attach, fit } = useTerminal({ id, cwd, onExit })

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

  // Drag and drop visual feedback only — let xterm handle the actual drop
  // so Claude Code CLI receives the file via bracketed paste natively
  const handleDragOver = useCallback(() => {
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(() => {
    setIsDragOver(false)
  }, [])

  return (
    <div
      ref={containerRef}
      className={`h-full w-full bg-[#0f0f23] relative ${isDragOver ? 'ring-2 ring-inset ring-claude-accent/50' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    />
  )
}

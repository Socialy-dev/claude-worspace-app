import { useRef, useEffect, useCallback } from 'react'
import { useTerminal } from '../../hooks/useTerminal'

interface Props {
  id: string
  cwd: string
}

export default function TerminalPanel({ id, cwd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const attachedRef = useRef(false)

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

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-[#0f0f23]"
    />
  )
}

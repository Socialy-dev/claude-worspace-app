import { useRef, useEffect, useCallback, useState } from 'react'
import { useTerminal } from '../../hooks/useTerminal'

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
}

export default function TerminalPanel({ id, cwd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const attachedRef = useRef(false)
  const [dragState, setDragState] = useState<'none' | 'file' | 'image'>('none')
  const dragCounterRef = useRef(0)

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

  useEffect(() => {
    const observer = new ResizeObserver(() => fit())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [fit])

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

      // Escape with backslashes (not quotes!) so Claude Code can still
      // detect image extensions via /\.(png|jpe?g|gif|webp)$/i
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
      className={`h-full w-full bg-[#0f0f23] relative ${ringClass}`}
    />
  )
}

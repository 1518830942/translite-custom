import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { getStore, setStore } from '../lib/store'

interface PromptSettingsModalProps {
  title: string
  storeKey: string
  onClose: () => void
}

function highlightTemplate(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const re = /\{\{[^{}]*\}\}/g
  let last = 0
  let key = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(
      <span key={key++} className="bg-accent/15 text-accent rounded-sm px-0.5">{m[0]}</span>
    )
    last = re.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export default function PromptSettingsModal({ title, storeKey, onClose }: PromptSettingsModalProps) {
  const [prompt, setPrompt] = useState('')
  const [loaded, setLoaded] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getStore(storeKey).then((v) => {
      setPrompt(v || '')
      setLoaded(true)
    })
  }, [storeKey])

  const syncScroll = useCallback(() => {
    if (taRef.current && bgRef.current) {
      bgRef.current.scrollTop = taRef.current.scrollTop
    }
  }, [])

  function handleSave() {
    if (prompt.trim()) {
      setStore(storeKey, prompt.trim())
      onClose()
    }
  }

  if (!loaded) return null

  const editorText = 'text-sm leading-relaxed px-3 py-2 whitespace-pre-wrap break-words font-[inherit]'

  return (
    <div className="absolute inset-0 bg-overlay flex items-center justify-center z-50 p-6">
      <div className="bg-surface rounded-lg p-5 w-full h-full shadow-xl border border-edge flex flex-col">
        <h2 className="text-primary text-sm font-medium mb-3">{title}</h2>
        <div className="relative flex-1 min-h-0 rounded-md bg-muted/40 overflow-hidden">
          <div
            ref={bgRef}
            className={`absolute inset-0 overflow-hidden pointer-events-none text-primary ${editorText}`}
            aria-hidden="true"
          >
            {highlightTemplate(prompt)}
            {'\n'}
          </div>
          <textarea
            ref={taRef}
            className={`absolute inset-0 w-full h-full bg-transparent text-transparent resize-none outline-none highlight-editor ${editorText}`}
            style={{ caretColor: 'var(--text-primary)' }}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onScroll={syncScroll}
            autoFocus
            spellCheck={false}
          />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="text-sm text-secondary hover:text-primary px-3 py-1.5 rounded hover:bg-muted"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!prompt.trim()}
            className="text-sm text-primary bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

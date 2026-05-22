import { useState, useEffect, useRef, useCallback } from 'react'

const SPECIAL_KEYS: Record<string, string> = {
  ' ': 'Space',
  Tab: 'Tab',
  Enter: 'Return',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  CapsLock: 'CapsLock',
  NumLock: 'NumLock',
  ScrollLock: 'ScrollLock',
  Pause: 'Pause',
  PrintScreen: 'PrintScreen',
}

const MODIFIER_KEY_NAMES = ['Alt', 'AltGraph', 'Control', 'Shift', 'Meta']

function keyToAccelerator(key: string): string {
  if (key.startsWith('F') && /^F\d{1,2}$/.test(key)) return key
  if (key.length === 1) return key.toUpperCase()
  return SPECIAL_KEYS[key] || key
}

interface ShortcutSettingsModalProps {
  value: string
  onSave: (value: string) => Promise<boolean>
  onClose: () => void
}

export default function ShortcutSettingsModal({ value, onSave, onClose }: ShortcutSettingsModalProps) {
  const [listening, setListening] = useState(false)
  const [captured, setCaptured] = useState<string | null>(null)
  const [display, setDisplay] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const suspendedRef = useRef(false)
  const recRef = useRef<HTMLDivElement>(null)

  const stopListening = useCallback(
    (resume = true) => {
      setListening(false)
      if (resume && suspendedRef.current) {
        window.api.shortcut.resume()
        suspendedRef.current = false
      }
    },
    [],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        setCaptured(null)
        setDisplay(value)
        stopListening()
        return
      }

      const mods = new Set<string>()
      if (e.altKey) mods.add('Alt')
      if (e.ctrlKey) mods.add('Control')
      if (e.shiftKey) mods.add('Shift')
      if (e.metaKey) mods.add('CommandOrControl')

      if (MODIFIER_KEY_NAMES.includes(e.key)) {
        setDisplay([...mods].join('+') + '+')
        setCaptured(null)
        return
      }

      const parts = [...mods]
      parts.push(keyToAccelerator(e.key))
      const accelerator = parts.join('+')

      setDisplay(accelerator)
      setCaptured(accelerator)
      stopListening(false)
    },
    [value, stopListening],
  )

  useEffect(() => {
    if (!listening) return
    recRef.current?.focus()
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [listening, handleKeyDown])

  useEffect(() => {
    return () => {
      if (suspendedRef.current) {
        window.api.shortcut.resume()
        suspendedRef.current = false
      }
    }
  }, [])

  const canSave = captured !== null && captured !== value.trim() && !saving

  async function handleSave() {
    if (!captured || !canSave) return
    setSaving(true)
    setError(null)
    const saved = await onSave(captured)
    setSaving(false)
    if (saved) {
      suspendedRef.current = false
    } else {
      setError('快捷键无效或已被占用')
      await window.api.shortcut.resume()
      suspendedRef.current = false
    }
  }

  function handleClose() {
    stopListening()
    onClose()
  }

  async function startListening() {
    setError(null)
    setCaptured(null)
    await window.api.shortcut.suspend()
    suspendedRef.current = true
    setListening(true)
  }

  return (
    <div
      className="absolute inset-0 bg-overlay flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="bg-surface rounded-lg p-5 w-80 shadow-xl border border-edge">
        <h2 className="text-primary text-sm font-medium mb-3">设置快捷键</h2>
        <label className="block">
          <span className="block text-xs text-secondary mb-1">呼出/隐藏窗口</span>
          <div
            ref={recRef}
            tabIndex={0}
            className={`w-full bg-muted text-sm px-3 py-2 rounded outline-none border cursor-pointer select-none ${
              listening ? 'border-accent ring-1 ring-accent/30' : 'border-edge hover:border-accent/50'
            } ${!display && !listening ? 'text-dim' : 'text-primary'}`}
            onClick={startListening}
          >
            {listening ? (display.endsWith('+') ? display + '...' : '请按下快捷键组合…') : display || '点击此处设置快捷键'}
          </div>
        </label>
        <p className="text-xs text-dim mt-2">{listening ? '按下快捷键组合，按 Esc 取消' : '点击输入框开始录制快捷键'}</p>
        {error && <p className="text-xs text-danger mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={handleClose}
            className="text-sm text-secondary hover:text-primary px-3 py-1.5 rounded hover:bg-muted"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="text-sm text-on-accent bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

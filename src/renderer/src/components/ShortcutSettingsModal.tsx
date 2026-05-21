import { useState } from 'react'

interface ShortcutSettingsModalProps {
  value: string
  onSave: (value: string) => Promise<boolean>
  onClose: () => void
}

export default function ShortcutSettingsModal({ value, onSave, onClose }: ShortcutSettingsModalProps) {
  const [shortcut, setShortcut] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nextShortcut = shortcut.trim()
  const canSave = Boolean(nextShortcut) && nextShortcut !== value.trim() && !saving

  async function handleSave() {
    if (!canSave) return

    setSaving(true)
    setError(null)
    const saved = await onSave(nextShortcut)
    setSaving(false)
    if (!saved) setError('快捷键无效或已被占用')
  }

  return (
    <div className="absolute inset-0 bg-overlay flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg p-5 w-80 shadow-xl border border-edge">
        <h2 className="text-primary text-sm font-medium mb-3">设置快捷键</h2>
        <label className="block">
          <span className="block text-xs text-secondary mb-1">呼出/隐藏窗口</span>
          <input
            type="text"
            className="w-full bg-muted text-primary text-sm px-3 py-2 rounded outline-none border border-edge focus:border-accent"
            placeholder="Alt+1"
            value={shortcut}
            onChange={(e) => {
              setShortcut(e.target.value)
              setError(null)
            }}
            autoFocus
          />
        </label>
        <p className="text-xs text-dim mt-2">示例：Alt+1、Control+Alt+T、Shift+F1</p>
        {error && <p className="text-xs text-danger mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
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

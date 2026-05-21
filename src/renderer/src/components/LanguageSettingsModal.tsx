import { useState } from 'react'

export type LanguageCode = 'en' | 'ja' | 'ko' | 'zh' | 'fr' | 'de'

export interface LanguagePair {
  source: LanguageCode
  target: LanguageCode
}

interface LanguageOption {
  code: LanguageCode
  label: string
}

const languageOptions: LanguageOption[] = [
  { code: 'en', label: '英语' },
  { code: 'ja', label: '日语' },
  { code: 'ko', label: '韩语' },
  { code: 'zh', label: '中文' },
  { code: 'fr', label: '法语' },
  { code: 'de', label: '德语' },
]

interface LanguageSettingsModalProps {
  value: LanguagePair
  onSave: (value: LanguagePair) => void
  onClose: () => void
}

export function getLanguageLabel(code: LanguageCode): string {
  return languageOptions.find((option) => option.code === code)?.label || code
}

export default function LanguageSettingsModal({ value, onSave, onClose }: LanguageSettingsModalProps) {
  const [source, setSource] = useState<LanguageCode>(value.source)
  const [target, setTarget] = useState<LanguageCode>(value.target)

  function handleSave() {
    onSave({ source, target })
  }

  return (
    <div className="absolute inset-0 bg-overlay flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg p-5 w-80 shadow-xl border border-edge">
        <h2 className="text-primary text-sm font-medium mb-2">设置语言</h2>
        <p className="text-xs text-secondary mb-4">选择默认互译语言，底部语言按钮可切换方向。</p>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-secondary mb-1">源语言</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as LanguageCode)}
              className="w-full bg-muted text-primary text-sm px-3 py-2 rounded outline-none border border-edge focus:border-accent"
            >
              {languageOptions.map((option) => (
                <option key={option.code} value={option.code}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-secondary mb-1">目标语言</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as LanguageCode)}
              className="w-full bg-muted text-primary text-sm px-3 py-2 rounded outline-none border border-edge focus:border-accent"
            >
              {languageOptions.map((option) => (
                <option key={option.code} value={option.code}>{option.label}</option>
              ))}
            </select>
          </label>
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
            className="text-sm text-on-accent bg-accent hover:bg-accent-hover px-3 py-1.5 rounded"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

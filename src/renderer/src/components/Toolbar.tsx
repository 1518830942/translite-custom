import { useState, useEffect, useRef } from 'react'
import { type Theme } from '../lib/useTheme'
import { type LanguageCode } from '../lib/lang-detect'

interface ToolbarProps {
  theme: Theme
  onToggleTheme: () => void
  alwaysOnTop: boolean
  onToggleAlwaysOnTop: () => void
  targetLanguage: LanguageCode
  preferredLanguage: LanguageCode
  fallbackLanguage: LanguageCode
  onSelectPreferred: (lang: LanguageCode) => void
  onSelectFallback: (lang: LanguageCode) => void
}

const allLanguages: { code: LanguageCode; label: string }[] = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: '英语' },
  { code: 'ja', label: '日语' },
]

const languageLabels: Record<LanguageCode, string> = {
  zh: '中文',
  en: '英语',
  ja: '日语',
}

export default function Toolbar({ theme, onToggleTheme, alwaysOnTop, onToggleAlwaysOnTop, targetLanguage, preferredLanguage, fallbackLanguage, onSelectPreferred, onSelectFallback }: ToolbarProps) {
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const langBtnRef = useRef<HTMLButtonElement>(null)
  const langMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!langMenuOpen) return

    function handleClickOutside(e: MouseEvent) {
      if (
        langMenuRef.current?.contains(e.target as Node) ||
        langBtnRef.current?.contains(e.target as Node)
      ) return
      setLangMenuOpen(false)
    }

    function handleWindowBlur() {
      setLangMenuOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [langMenuOpen])

  function handleSelectPreferred(code: LanguageCode) {
    onSelectPreferred(code)
  }

  function handleSelectFallback(code: LanguageCode) {
    onSelectFallback(code)
  }

  const fallbackOptions = allLanguages.filter((l) => l.code !== preferredLanguage)

  return (
    <div className="flex items-center justify-between h-9 px-3 bg-surface border-t border-edge select-none">
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleAlwaysOnTop}
          className={`p-1.5 rounded ${alwaysOnTop ? 'bg-accent text-on-accent' : 'text-secondary hover:text-primary hover:bg-muted'}`}
          title="置顶"
          aria-label="置顶"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 4l6 6" />
            <path d="M4 14l6 6" />
            <path d="M14 4l-4 4" />
            <path d="M20 10l-4 4" />
            <path d="M10 8l6 6" />
            <path d="M9 15l-5 5" />
          </svg>
        </button>
        <div className="relative">
          <button
            ref={langBtnRef}
            onClick={() => setLangMenuOpen((v) => !v)}
            className="text-xs text-dim hover:text-primary cursor-pointer"
            title="语言设置"
          >
            → {languageLabels[targetLanguage]}
          </button>
          {langMenuOpen && (
            <div ref={langMenuRef} className="absolute left-0 bottom-full mb-1 w-28 bg-surface border border-edge rounded-md shadow-xl z-50 py-1">
              <div className="px-3 pt-1 pb-0.5 text-[10px] text-dim">目标</div>
              {allLanguages.map((opt) => (
                <button
                  key={opt.code}
                  className="w-full text-left text-xs px-3 py-1.5 text-secondary hover:text-primary hover:bg-muted flex items-center gap-1"
                  onClick={() => handleSelectPreferred(opt.code)}
                >
                  <span className="w-3 inline-block text-accent">{opt.code === preferredLanguage ? '✓' : ''}</span>
                  {languageLabels[opt.code]}
                </button>
              ))}
              <div className="border-t border-edge my-1" />
              <div className="px-3 pt-1 pb-0.5 text-[10px] text-dim">回退</div>
              {fallbackOptions.map((opt) => (
                <button
                  key={opt.code}
                  className="w-full text-left text-xs px-3 py-1.5 text-secondary hover:text-primary hover:bg-muted flex items-center gap-1"
                  onClick={() => handleSelectFallback(opt.code)}
                >
                  <span className="w-3 inline-block text-accent">{opt.code === fallbackLanguage ? '✓' : ''}</span>
                  {languageLabels[opt.code]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={onToggleTheme}
        className="p-1.5 rounded text-secondary hover:text-primary hover:bg-muted"
        title={theme === 'dark' ? '浅色模式' : '深色模式'}
        aria-label="切换主题"
      >
        {theme === 'dark' ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>
    </div>
  )
}

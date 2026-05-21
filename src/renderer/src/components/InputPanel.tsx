interface InputPanelProps {
  value: string
  onChange: (v: string) => void
  onSubmit: (mode: 'translate' | 'polish' | 'explain') => void
  loading: boolean
}

export default function InputPanel({ value, onChange, onSubmit, loading }: InputPanelProps) {
  const canSubmit = Boolean(value.trim()) && !loading

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSubmit) {
        onSubmit('translate')
      }
    }
  }

  const btnBase = 'p-2 rounded-full shadow-sm disabled:text-dim disabled:bg-muted/50 disabled:border-edge disabled:cursor-not-allowed border'
  const btnActive = 'text-accent bg-accent/10 hover:bg-accent/15 border-accent/20 dark:text-accent-hover'

  return (
    <div className="flex-1 p-3 relative min-h-0">
      <textarea
        className="w-full h-full bg-transparent text-primary text-sm resize-none outline-none placeholder-dim pr-28 pb-11 custom-scrollbar"
        placeholder="输入文本，按 Enter 翻译..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={loading}
        autoFocus
      />
      <div className="absolute right-3 bottom-4 flex items-center gap-1.5">
        <button
          type="button"
          className={`${btnBase} ${btnActive}`}
          onClick={() => onSubmit('translate')}
          disabled={!canSubmit}
          title="翻译"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 8 6 6" />
            <path d="m4 14 6-6 2-3" />
            <path d="M2 5h12" />
            <path d="M7 2h1" />
            <path d="m22 22-5-10-5 10" />
            <path d="M14 18h6" />
          </svg>
        </button>
        <button
          type="button"
          className={`${btnBase} ${btnActive}`}
          onClick={() => onSubmit('polish')}
          disabled={!canSubmit}
          title="润色"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
            <path d="M5 3v4" />
            <path d="M19 17v4" />
            <path d="M3 5h4" />
            <path d="M17 19h4" />
          </svg>
        </button>
        <button
          type="button"
          className={`${btnBase} ${btnActive}`}
          onClick={() => onSubmit('explain')}
          disabled={!canSubmit}
          title="解释"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            <circle cx="12" cy="10" r="1" fill="currentColor" />
            <path d="M12 14v-3" />
          </svg>
        </button>
      </div>
    </div>
  )
}

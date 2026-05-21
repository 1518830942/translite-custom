import { useState, type CSSProperties } from 'react'

interface TitleBarProps {
  onOpenSettings: () => void
  onOpenLanguageSettings: () => void
  onOpenShortcutSettings: () => void
  onOpenCloseBehavior: () => void
  onOpenTranslatePromptSettings: () => void
  onOpenPolishPromptSettings: () => void
  onOpenExplainPromptSettings: () => void
  onClose: () => void
  onQuit: () => void
}

export default function TitleBar({ onOpenSettings, onOpenLanguageSettings, onOpenShortcutSettings, onOpenCloseBehavior, onOpenTranslatePromptSettings, onOpenPolishPromptSettings, onOpenExplainPromptSettings, onClose, onQuit }: TitleBarProps) {
  const [open, setOpen] = useState(false)

  function handleMenuClick(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <div className="flex items-center justify-between h-8 px-3 bg-surface select-none" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
      <div className="relative flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <button
          className="text-secondary hover:text-primary w-6 h-6 flex items-center justify-center rounded hover:bg-muted"
          onClick={() => setOpen((value) => !value)}
          aria-label="打开菜单"
          title="菜单"
        >
          ☰
        </button>
        <span className="text-xs text-secondary font-medium">Translite</span>
        {open && (
          <div className="absolute left-0 top-7 w-40 bg-surface border border-edge rounded-md shadow-xl z-50 py-1">
            <button className="w-full text-left text-sm text-secondary hover:text-primary hover:bg-muted px-3 py-2" onClick={() => handleMenuClick(onOpenSettings)}>设置 API</button>
            <button className="w-full text-left text-sm text-secondary hover:text-primary hover:bg-muted px-3 py-2" onClick={() => handleMenuClick(onOpenLanguageSettings)}>设置互译语言</button>
            <button className="w-full text-left text-sm text-secondary hover:text-primary hover:bg-muted px-3 py-2" onClick={() => handleMenuClick(onOpenTranslatePromptSettings)}>设置翻译提示词</button>
            <button className="w-full text-left text-sm text-secondary hover:text-primary hover:bg-muted px-3 py-2" onClick={() => handleMenuClick(onOpenPolishPromptSettings)}>设置润色提示词</button>
            <button className="w-full text-left text-sm text-secondary hover:text-primary hover:bg-muted px-3 py-2" onClick={() => handleMenuClick(onOpenExplainPromptSettings)}>设置解释提示词</button>
            <button className="w-full text-left text-sm text-secondary hover:text-primary hover:bg-muted px-3 py-2" onClick={() => handleMenuClick(onOpenShortcutSettings)}>设置快捷键</button>
            <button className="w-full text-left text-sm text-secondary hover:text-primary hover:bg-muted px-3 py-2" onClick={() => handleMenuClick(onOpenCloseBehavior)}>设置关闭行为</button>
            <div className="border-t border-edge my-1" />
            <button className="w-full text-left text-sm text-danger hover:opacity-80 hover:bg-muted px-3 py-2" onClick={() => handleMenuClick(onQuit)}>退出应用</button>
          </div>
        )}
      </div>
      <button
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        className="text-secondary hover:text-primary text-sm leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-muted"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  )
}

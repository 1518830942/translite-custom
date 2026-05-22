import { useState, useEffect, useCallback, useMemo } from 'react'
import TitleBar from './components/TitleBar'
import InputPanel from './components/InputPanel'
import ResultPanel from './components/ResultPanel'
import Toolbar from './components/Toolbar'
import SettingsModal, { type ApiConfig } from './components/SettingsModal'
import CloseBehaviorModal from './components/CloseBehaviorModal'
import ShortcutSettingsModal from './components/ShortcutSettingsModal'
import PromptSettingsModal from './components/PromptSettingsModal'
import { translateStream } from './lib/translate'
import { getStore, setStore } from './lib/store'
import { useTheme } from './lib/useTheme'
import { detectLang, resolveTargetLang, type LanguageCode } from './lib/lang-detect'

type CloseBehavior = 'tray' | 'quit'
type TranslateMode = 'translate' | 'polish' | 'explain'

const allLanguageCodes: LanguageCode[] = ['zh', 'en', 'ja']
const defaultPreferredLanguage: LanguageCode = 'en'
const defaultFallbackLanguage: LanguageCode = 'zh'
const defaultShortcut = 'Alt+1'

function hasValidTranslateSource(config: ApiConfig): boolean {
  return Boolean(config.baseURL.trim() && config.apiKey.trim() && config.model.trim())
}

function isLanguageCode(value: unknown): value is LanguageCode {
  return value === 'en' || value === 'ja' || value === 'zh'
}

function parseLanguageValue(value: string | null, fallback: LanguageCode): LanguageCode {
  if (value && isLanguageCode(value)) return value
  return fallback
}

export default function App() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>(defaultPreferredLanguage)
  const [fallbackLanguage, setFallbackLanguage] = useState<LanguageCode>(defaultFallbackLanguage)
  const [showSettings, setShowSettings] = useState(false)
  const [showShortcutSettings, setShowShortcutSettings] = useState(false)
  const [showCloseBehavior, setShowCloseBehavior] = useState(false)
  const [closeBehaviorAction, setCloseBehaviorAction] = useState<'close' | 'settings'>('close')
  const [closeBehavior, setCloseBehavior] = useState<CloseBehavior | null>(null)
  const [closeBehaviorLoaded, setCloseBehaviorLoaded] = useState(false)
  const [apiConfig, setApiConfig] = useState<ApiConfig>({ baseURL: '', apiKey: '', model: '' })
  const [shortcut, setShortcut] = useState(defaultShortcut)
  const [showTranslatePromptSettings, setShowTranslatePromptSettings] = useState(false)
  const [showPolishPromptSettings, setShowPolishPromptSettings] = useState(false)
  const [showExplainPromptSettings, setShowExplainPromptSettings] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const inputLang = useMemo(() => input.trim() ? detectLang(input) : null, [input])
  const targetLanguage = useMemo(() => {
    if (!inputLang) return preferredLanguage
    return resolveTargetLang(inputLang, preferredLanguage, fallbackLanguage)
  }, [inputLang, preferredLanguage, fallbackLanguage])

  useEffect(() => {
    Promise.all([
      getStore('apiBaseURL'),
      getStore('apiKey'),
      getStore('apiModel'),
    ]).then(([baseURL, apiKey, model]) => {
      const config: ApiConfig = { baseURL: baseURL || '', apiKey: apiKey || '', model: model || '' }
      setApiConfig(config)
      if (!config.apiKey) {
        setShowSettings(true)
      }
    })
    getStore('alwaysOnTop').then((v) => {
      const flag = v !== 'false'
      setAlwaysOnTop(flag)
      window.api.window.setAlwaysOnTop(flag)
    })
    getStore('closeBehavior').then((v) => {
      if (v === 'quit' || v === 'tray') setCloseBehavior(v)
      setCloseBehaviorLoaded(true)
    })
    getStore('targetLanguage').then((v) => {
      setPreferredLanguage(parseLanguageValue(v, defaultPreferredLanguage))
    })
    getStore('fallbackLanguage').then((v) => {
      setFallbackLanguage(parseLanguageValue(v, defaultFallbackLanguage))
    })
    getStore('globalShortcut').then((v) => {
      setShortcut(v || defaultShortcut)
    })
  }, [])

  useEffect(() => {
    return window.api.window.onSetInputFromClipboard((text) => {
      setInput(text)
    })
  }, [])

  const handleSubmit = useCallback((mode: TranslateMode = 'translate') => {
    if (!input.trim() || loading) return
    setResult('')
    setError(null)

    if (!hasValidTranslateSource(apiConfig)) {
      setResult('请配置翻译源')
      return
    }

    setLoading(true)

    translateStream(input, targetLanguage, (chunk) => {
      setResult((prev) => prev + chunk)
    }, mode)
      .then(() => setLoading(false))
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [input, loading, targetLanguage, apiConfig])

  function handleToggleAlwaysOnTop() {
    const next = !alwaysOnTop
    setAlwaysOnTop(next)
    window.api.window.setAlwaysOnTop(next)
    setStore('alwaysOnTop', String(next))
  }

  function handleSaveApiConfig(config: ApiConfig) {
    setApiConfig(config)
    setStore('apiBaseURL', config.baseURL)
    setStore('apiKey', config.apiKey)
    setStore('apiModel', config.model)
    setShowSettings(false)
  }

  function handleInputChange(text: string) {
    setInput(text)
  }

  function handleSelectPreferredLanguage(value: LanguageCode) {
    setPreferredLanguage(value)
    setStore('targetLanguage', value)
    if (value === fallbackLanguage) {
      const firstAlternative = allLanguageCodes.find((l) => l !== value)!
      setFallbackLanguage(firstAlternative)
      setStore('fallbackLanguage', firstAlternative)
    }
  }

  function handleSelectFallbackLanguage(value: LanguageCode) {
    setFallbackLanguage(value)
    setStore('fallbackLanguage', value)
  }

  async function handleSelectCloseBehavior(value: CloseBehavior) {
    setCloseBehavior(value)
    await setStore('closeBehavior', value)
    setShowCloseBehavior(false)
    if (closeBehaviorAction === 'close') window.api.window.close(value)
  }

  async function handleClose() {
    if (!closeBehaviorLoaded) {
      const saved = await getStore('closeBehavior')
      setCloseBehaviorLoaded(true)
      if (saved === 'quit' || saved === 'tray') {
        setCloseBehavior(saved)
        window.api.window.close(saved)
        return
      }
    }

    if (closeBehavior) {
      window.api.window.close(closeBehavior)
      return
    }

    setCloseBehaviorAction('close')
    setShowCloseBehavior(true)
  }

  async function handleSaveShortcut(value: string): Promise<boolean> {
    const saved = await window.api.shortcut.set(value)
    if (saved) {
      setShortcut(saved)
      setShowShortcutSettings(false)
    }
    return Boolean(saved)
  }

  return (
    <div className="h-screen flex flex-col bg-base relative">
      <TitleBar
        onOpenSettings={() => setShowSettings(true)}
        onOpenShortcutSettings={() => setShowShortcutSettings(true)}
        onOpenCloseBehavior={() => { setCloseBehaviorAction('settings'); setShowCloseBehavior(true) }}
        onOpenTranslatePromptSettings={() => setShowTranslatePromptSettings(true)}
        onOpenPolishPromptSettings={() => setShowPolishPromptSettings(true)}
        onOpenExplainPromptSettings={() => setShowExplainPromptSettings(true)}
        onClose={handleClose}
        onQuit={() => window.api.window.quit()}
      />
      <InputPanel value={input} onChange={handleInputChange} onSubmit={handleSubmit} loading={loading} />
      <ResultPanel result={result} loading={loading} error={error} />
      <Toolbar
        theme={theme}
        onToggleTheme={toggleTheme}
        alwaysOnTop={alwaysOnTop}
        onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
        targetLanguage={targetLanguage}
        preferredLanguage={preferredLanguage}
        fallbackLanguage={fallbackLanguage}
        onSelectPreferred={handleSelectPreferredLanguage}
        onSelectFallback={handleSelectFallbackLanguage}
      />
      {showSettings && (
        <SettingsModal
          config={apiConfig}
          onSave={handleSaveApiConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showShortcutSettings && (
        <ShortcutSettingsModal
          value={shortcut}
          onSave={handleSaveShortcut}
          onClose={() => setShowShortcutSettings(false)}
        />
      )}
      {showCloseBehavior && (
        <CloseBehaviorModal
          value={closeBehavior}
          onSelect={handleSelectCloseBehavior}
          onCancel={() => setShowCloseBehavior(false)}
        />
      )}
      {showTranslatePromptSettings && (
        <PromptSettingsModal
          title="设置翻译提示词"
          storeKey="translatePrompt"
          onClose={() => setShowTranslatePromptSettings(false)}
        />
      )}
      {showPolishPromptSettings && (
        <PromptSettingsModal
          title="设置润色提示词"
          storeKey="polishPrompt"
          onClose={() => setShowPolishPromptSettings(false)}
        />
      )}
      {showExplainPromptSettings && (
        <PromptSettingsModal
          title="设置解释提示词"
          storeKey="explainPrompt"
          onClose={() => setShowExplainPromptSettings(false)}
        />
      )}
    </div>
  )
}

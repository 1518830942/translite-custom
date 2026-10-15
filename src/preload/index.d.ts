import type { WordPhonetics } from '../shared/phonetics'

interface ElectronAPI {
  platform: string
  translate: {
    start: (id: string, text: string, to: string, mode?: string) => void
    onChunk: (id: string, callback: (chunk: string) => void) => () => void
    onPhonetics: (id: string, callback: (phonetics: WordPhonetics | null) => void) => () => void
    onDone: (id: string, callback: () => void) => () => void
    onError: (id: string, callback: (err: string) => void) => () => void
    onCancelled: (id: string, callback: () => void) => () => void
    abort: (id: string) => void
  }
  store: {
    get: (key: string) => Promise<string | null>
    set: (key: string, value: string) => Promise<void>
  }
  window: {
    setAlwaysOnTop: (flag: boolean) => Promise<void>
    onSetInputFromClipboard: (callback: (text: string) => void) => () => void
    close: (behavior?: 'tray' | 'quit') => void
    quit: () => void
  }
  shortcut: {
    set: (shortcut: string) => Promise<string | null>
    suspend: () => Promise<string>
    resume: () => Promise<boolean>
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}

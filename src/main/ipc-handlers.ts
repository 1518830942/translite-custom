import { ipcMain, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { translate, clearTranslationCache } from './translate'
import { defaultTranslatePrompt, defaultPolishPrompt, defaultExplainPrompt } from './translate'

type CloseBehavior = 'tray' | 'quit'

const store = new Store()
const translationConfigKeys = new Set(['apiBaseURL', 'apiKey', 'apiModel', 'translatePrompt', 'polishPrompt', 'explainPrompt'])

function initializeDefaultPrompts() {
  if (!store.get('translatePrompt')) store.set('translatePrompt', defaultTranslatePrompt)
  if (!store.get('polishPrompt')) store.set('polishPrompt', defaultPolishPrompt)
  if (!store.get('explainPrompt')) store.set('explainPrompt', defaultExplainPrompt)
}

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  closeWindow: (behavior?: CloseBehavior) => void,
  registerGlobalShortcut: (shortcut: string) => string | null,
  suspendGlobalShortcut: () => string,
  resumeGlobalShortcut: () => boolean,
) {
  let activeRequest: { id: string; controller: AbortController; sender: Electron.WebContents } | null = null
  initializeDefaultPrompts()
  ipcMain.handle('store:get', (_event, key: string) => {
    return store.get(key, null)
  })

  ipcMain.handle('store:set', (_event, key: string, value: string) => {
    store.set(key, value)
    if (translationConfigKeys.has(key)) {
      clearTranslationCache()
      activeRequest?.controller.abort()
    }
  })

  ipcMain.handle('window:setAlwaysOnTop', (_event, flag: boolean) => {
    mainWindow.setAlwaysOnTop(flag)
  })

  ipcMain.on('window:close', (_event, behavior?: CloseBehavior) => {
    closeWindow(behavior)
  })

  ipcMain.on('window:quit', () => {
    closeWindow('quit')
  })

  ipcMain.handle('shortcut:set', (_event, shortcut: string) => {
    return registerGlobalShortcut(shortcut)
  })

  ipcMain.handle('shortcut:suspend', () => {
    return suspendGlobalShortcut()
  })

  ipcMain.handle('shortcut:resume', () => {
    return resumeGlobalShortcut()
  })

  ipcMain.on('translate:start', async (event, { id, text, to, mode }) => {
    const controller = new AbortController()
    const previous = activeRequest
    const request = { id, controller, sender: event.sender }
    activeRequest = request
    const send = (channel: string, data: object) => { if (!event.sender.isDestroyed()) event.sender.send(channel, data) }
    const current = () => activeRequest === request && !controller.signal.aborted

    try {
      const pending = translate({
        text,
        to,
        mode: mode || 'translate',
        signal: controller.signal,
        onPhonetics: (phonetics) => {
          if (current()) send('translate:phonetics', { id, phonetics })
        },
        onChunk: (chunk) => {
          if (current()) send('translate:chunk', { id, chunk })
        },
      })
      // Attach first: identical lookups share the existing network execution.
      previous?.controller.abort()
      await pending
      if (controller.signal.aborted) throw controller.signal.reason
      send('translate:done', { id })
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err))
      if (error.name === 'AbortError') send('translate:cancelled', { id })
      else send('translate:error', { id, error: error.message })
    } finally {
      if (activeRequest === request) activeRequest = null
    }
  })

  ipcMain.on('translate:abort', (event, id: string) => {
    if (activeRequest?.id === id && activeRequest.sender === event.sender) activeRequest.controller.abort()
  })
  mainWindow.webContents.once('destroyed', () => activeRequest?.controller.abort())
}

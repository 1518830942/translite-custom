import { ipcMain, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { translate } from './translate'
import { defaultTranslatePrompt, defaultPolishPrompt, defaultExplainPrompt } from './translate'

type CloseBehavior = 'tray' | 'quit'

const store = new Store()
const activeControllers = new Map<string, AbortController>()

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
  initializeDefaultPrompts()
  ipcMain.handle('store:get', (_event, key: string) => {
    return store.get(key, null)
  })

  ipcMain.handle('store:set', (_event, key: string, value: string) => {
    store.set(key, value)
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
    activeControllers.set(id, controller)

    try {
      await translate({
        text,
        to,
        mode: mode || 'translate',
        signal: controller.signal,
        onPhonetics: (phonetics) => {
          event.sender.send('translate:phonetics', { id, phonetics })
        },
        onChunk: (chunk) => {
          event.sender.send('translate:chunk', { id, chunk })
        },
      })
      event.sender.send('translate:done', { id })
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        event.sender.send('translate:error', { id, error: (err as Error).message })
      }
    } finally {
      activeControllers.delete(id)
    }
  })

  ipcMain.on('translate:abort', (_event, id: string) => {
    const controller = activeControllers.get(id)
    if (controller) {
      controller.abort()
      activeControllers.delete(id)
    }
  })
}

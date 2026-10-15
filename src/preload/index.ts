import { contextBridge, ipcRenderer } from 'electron'
import type { WordPhonetics } from '../shared/phonetics'

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  translate: {
    start: (id: string, text: string, to: string, mode?: string) => {
      ipcRenderer.send('translate:start', { id, text, to, mode })
    },
    onChunk: (id: string, callback: (chunk: string) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, data: { id: string; chunk: string }) => {
        if (data.id === id) callback(data.chunk)
      }
      ipcRenderer.on('translate:chunk', listener)
      return () => { ipcRenderer.removeListener('translate:chunk', listener) }
    },
    onPhonetics: (id: string, callback: (phonetics: WordPhonetics | null) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, data: { id: string; phonetics: WordPhonetics | null }) => {
        if (data.id === id) callback(data.phonetics)
      }
      ipcRenderer.on('translate:phonetics', listener)
      return () => { ipcRenderer.removeListener('translate:phonetics', listener) }
    },
    onDone: (id: string, callback: () => void) => {
      const listener = (_e: Electron.IpcRendererEvent, data: { id: string }) => {
        if (data.id === id) callback()
      }
      ipcRenderer.on('translate:done', listener)
      return () => { ipcRenderer.removeListener('translate:done', listener) }
    },
    onError: (id: string, callback: (err: string) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, data: { id: string; error: string }) => {
        if (data.id === id) callback(data.error)
      }
      ipcRenderer.on('translate:error', listener)
      return () => { ipcRenderer.removeListener('translate:error', listener) }
    },
    onCancelled: (id: string, callback: () => void) => {
      const listener = (_e: Electron.IpcRendererEvent, data: { id: string }) => { if (data.id === id) callback() }
      ipcRenderer.on('translate:cancelled', listener)
      return () => { ipcRenderer.removeListener('translate:cancelled', listener) }
    },
    abort: (id: string) => { ipcRenderer.send('translate:abort', id) },
  },
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('store:set', key, value),
  },
  window: {
    setAlwaysOnTop: (flag: boolean) => ipcRenderer.invoke('window:setAlwaysOnTop', flag),
    onSetInputFromClipboard: (callback: (text: string) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, text: string) => callback(text)
      ipcRenderer.on('input:setFromClipboard', listener)
      return () => { ipcRenderer.removeListener('input:setFromClipboard', listener) }
    },
    close: (behavior?: 'tray' | 'quit') => ipcRenderer.send('window:close', behavior),
    quit: () => ipcRenderer.send('window:quit'),
  },
  shortcut: {
    set: (shortcut: string) => ipcRenderer.invoke('shortcut:set', shortcut),
    suspend: () => ipcRenderer.invoke('shortcut:suspend'),
    resume: () => ipcRenderer.invoke('shortcut:resume'),
  },
})

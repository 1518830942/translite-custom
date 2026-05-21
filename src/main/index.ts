import { app, BrowserWindow, clipboard, globalShortcut, Menu, nativeImage, screen, Tray, type Rectangle } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { registerIpcHandlers } from './ipc-handlers'

type CloseBehavior = 'tray' | 'quit'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
const store = new Store()
const windowBoundsKey = 'windowBounds'
const closeBehaviorKey = 'closeBehavior'
const shortcutKey = 'globalShortcut'
const defaultShortcut = 'Alt+1'
const minWidth = 360
const minHeight = 420
let registeredShortcut = ''

function resolveIconPath(name: string): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, name)
  }
  return join(__dirname, '../../build', name)
}

function loadIcon(name: string): Electron.NativeImage {
  return nativeImage.createFromPath(resolveIconPath(name))
}

function loadTrayIcon(): Electron.NativeImage {
  return loadIcon('tray-icon.png')
}

function loadWindowIcon(): Electron.NativeImage {
  return loadIcon('icon.png')
}

function getDefaultBounds(): Rectangle {
  const { x: screenX, y: screenY, width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workArea
  const width = 420
  const height = 500

  return {
    width,
    height,
    x: screenX + screenWidth - width - 80,
    y: screenY + screenHeight - height - 120,
  }
}

function getInitialBounds(): Rectangle {
  const savedBounds = store.get(windowBoundsKey) as Partial<Rectangle> | undefined

  if (
    savedBounds &&
    typeof savedBounds.x === 'number' &&
    typeof savedBounds.y === 'number' &&
    typeof savedBounds.width === 'number' &&
    typeof savedBounds.height === 'number'
  ) {
    return {
      x: savedBounds.x,
      y: savedBounds.y,
      width: Math.max(savedBounds.width, minWidth),
      height: Math.max(savedBounds.height, minHeight),
    }
  }

  return getDefaultBounds()
}

function saveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  store.set(windowBoundsKey, mainWindow.getBounds())
}

function showWindow() {
  if (!mainWindow) return
  mainWindow.show()
  mainWindow.focus()
}

function sendClipboardTextToInput() {
  if (!mainWindow || mainWindow.isDestroyed()) return

  const text = clipboard.readText().trim()
  if (text) mainWindow.webContents.send('input:setFromClipboard', text)
}

function toggleWindow() {
  if (!mainWindow) return
  if (mainWindow.isVisible()) {
    closeWindow('tray')
  } else {
    sendClipboardTextToInput()
    showWindow()
  }
}

function normalizeShortcut(value: string): string {
  const aliases: Record<string, string> = {
    alt: 'Alt',
    option: 'Alt',
    ctrl: 'Control',
    control: 'Control',
    shift: 'Shift',
    cmd: 'Command',
    command: 'Command',
    meta: 'CommandOrControl',
    super: 'Super',
  }

  return value
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => aliases[part.toLowerCase()] || (part.length === 1 ? part.toUpperCase() : part))
    .join('+')
}

function registerGlobalShortcut(value: string): string | null {
  const shortcut = normalizeShortcut(value)
  if (!shortcut) return null
  if (shortcut === registeredShortcut) return shortcut

  if (registeredShortcut) globalShortcut.unregister(registeredShortcut)

  const registered = globalShortcut.register(shortcut, toggleWindow)
  if (!registered) {
    if (registeredShortcut) globalShortcut.register(registeredShortcut, toggleWindow)
    return null
  }

  registeredShortcut = shortcut
  store.set(shortcutKey, shortcut)
  return shortcut
}

function quitApp() {
  isQuitting = true
  app.quit()
}

function createTray() {
  if (tray) return

  const icon = loadTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('Translite')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示', click: showWindow },
    { label: '退出', click: quitApp },
  ]))
  tray.on('click', showWindow)
}

function closeWindow(behavior = store.get(closeBehaviorKey, 'tray') as CloseBehavior) {
  saveWindowBounds()
  if (behavior === 'quit') {
    quitApp()
    return
  }

  createTray()
  mainWindow?.hide()
}

function createWindow() {
  const bounds = getInitialBounds()

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth,
    minHeight,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    icon: loadWindowIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('moved', saveWindowBounds)
  mainWindow.on('resized', saveWindowBounds)

  mainWindow.on('close', (e) => {
    saveWindowBounds()
    if (isQuitting) return
    e.preventDefault()
    closeWindow()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  registerIpcHandlers(mainWindow, closeWindow, registerGlobalShortcut)
}

app.whenReady().then(() => {
  createWindow()

  const savedShortcut = store.get(shortcutKey, defaultShortcut) as string
  if (!registerGlobalShortcut(savedShortcut)) registerGlobalShortcut(defaultShortcut)
})

app.on('window-all-closed', () => {
  // Keep app running
})

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
})

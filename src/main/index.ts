import { app, BrowserWindow, clipboard, globalShortcut, Menu, nativeImage, screen, systemPreferences, Tray, type Rectangle } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { registerIpcHandlers } from './ipc-handlers'
import { execFile } from 'node:child_process'

type CloseBehavior = 'tray' | 'quit'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.setAppUserModelId('com.translite.app')

const store = new Store()
const windowBoundsKey = 'windowBounds'
const closeBehaviorKey = 'closeBehavior'
const shortcutKey = 'globalShortcut'
const openAtLoginKey = 'openAtLogin'
const defaultShortcut = 'Alt+E'
const minWidth = 360
const minHeight = 420
let registeredShortcut = ''
let capturingSelection = false

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
  const icon = loadIcon('tray-icon.png')
  if (process.platform === 'darwin') icon.setTemplateImage(true)
  return icon
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
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  if (process.platform === 'darwin') app.focus({ steal: true })
  // Windows may decline focus after asynchronous selection copying. Raise the
  // existing window explicitly without changing the user's always-on-top setting.
  mainWindow.moveTop()
  mainWindow.focus()
}

function sendClipboardTextToInput() {
  if (!mainWindow || mainWindow.isDestroyed()) return

  const text = clipboard.readText().trim()
  if (text) mainWindow.webContents.send('input:setFromClipboard', text)
}

async function activateWindow() {
  if (!mainWindow || capturingSelection) return
  capturingSelection = true
  try {
    if (process.platform === 'win32' || process.platform === 'darwin') {
      if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(true)) {
        showWindow()
        return
      }
      // Keep the source window focused until copying has completed.
      const text = await new Promise<string | null>((resolve) => {
        const helper = process.platform === 'win32' ? 'selection-copy.exe' : 'selection-copy-macos'
        execFile(resolveIconPath(helper), [], {
          windowsHide: true, timeout: 3500, maxBuffer: 4 * 1024 * 1024,
        }, (error, stdout) => {
          resolve(error ? null : Buffer.from(stdout.trim(), 'base64').toString('utf8'))
        })
      })
      if (!mainWindow || mainWindow.isDestroyed()) return
      if (text?.trim()) mainWindow.webContents.send('input:setFromClipboard', text)
    } else {
      sendClipboardTextToInput()
    }
    showWindow()
    if (process.platform === 'win32' && mainWindow && !mainWindow.isDestroyed()) {
      const handle = mainWindow.getNativeWindowHandle()
      const windowId = (handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())).toString()
      // Check actual Windows foreground ownership; Electron focus() is best effort.
      const activated = await new Promise<boolean>((resolve) => {
        execFile(resolveIconPath('selection-copy.exe'), ['--activate', windowId, String(process.pid)], {
          windowsHide: true, timeout: 1500,
        }, (error) => resolve(!error))
      })
      if (!activated && mainWindow && !mainWindow.isDestroyed()) mainWindow.flashFrame(true)
    }
  } finally {
    capturingSelection = false
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

  const registered = globalShortcut.register(shortcut, activateWindow)
  if (!registered) {
    if (registeredShortcut) globalShortcut.register(registeredShortcut, activateWindow)
    return null
  }

  registeredShortcut = shortcut
  store.set(shortcutKey, shortcut)
  return shortcut
}

function suspendGlobalShortcut(): string {
  if (registeredShortcut) globalShortcut.unregister(registeredShortcut)
  return registeredShortcut
}

function resumeGlobalShortcut(): boolean {
  if (!registeredShortcut) return false
  return globalShortcut.register(registeredShortcut, activateWindow)
}

function quitApp() {
  isQuitting = true
  app.quit()
}

function isOpenAtLogin(): boolean {
  return app.getLoginItemSettings().openAtLogin
}

function setOpenAtLogin(enabled: boolean) {
  if (!app.isPackaged) return
  store.set(openAtLoginKey, enabled)
  app.setLoginItemSettings({ openAtLogin: enabled })
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: '显示', click: showWindow },
    { type: 'separator' },
    { label: '开机启动', type: 'checkbox', checked: isOpenAtLogin(), click: (item) => setOpenAtLogin(item.checked) },
    { type: 'separator' },
    { label: '退出', click: quitApp },
  ])
}

function createTray() {
  if (tray) return

  const icon = loadTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('Translite')
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', showWindow)
}

function closeWindow(behavior = store.get(closeBehaviorKey, 'tray') as CloseBehavior) {
  saveWindowBounds()
  if (behavior === 'quit') {
    quitApp()
    return
  }

  mainWindow?.hide()
}

function createWindow() {
  const bounds = getInitialBounds()
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workArea
  const maxPixelWidth = 640
  const maxPixelHeight = 760
  const maxRatio = 0.8

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth,
    minHeight,
    maxWidth: Math.min(maxPixelWidth, Math.round(screenW * maxRatio)),
    maxHeight: Math.min(maxPixelHeight, Math.round(screenH * maxRatio)),
    frame: false,
    resizable: true,
    maximizable: false,
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

  registerIpcHandlers(mainWindow, closeWindow, registerGlobalShortcut, suspendGlobalShortcut, resumeGlobalShortcut)
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(() => {
  createWindow()
  createTray()

  const savedOpenAtLogin = store.get(openAtLoginKey, false) as boolean
  if (!app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: false })
  } else if (savedOpenAtLogin !== isOpenAtLogin()) {
    app.setLoginItemSettings({ openAtLogin: savedOpenAtLogin })
  }

  const savedShortcut = store.get(shortcutKey, defaultShortcut) as string
  if (!registerGlobalShortcut(savedShortcut)) registerGlobalShortcut(defaultShortcut)
})

app.on('window-all-closed', () => {
  // Keep app running
})

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
})

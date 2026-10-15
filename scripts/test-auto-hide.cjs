const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const source = ts.createSourceFile('index.ts', fs.readFileSync(path.join(__dirname, '../src/main/index.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
const names = new Set(['showWindowNearCursor', 'showWindow', 'sendClipboardTextToInput', 'hideWindowOnBlur', 'activateWindow', 'closeWindow', 'saveWindowBounds'])
const functions = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.has(n.name.text)).map(n => n.getText(source)).join('\n')
const createWindow = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === 'createWindow')
const registration = createWindow.body.statements.find(n => n.getText(source).startsWith("mainWindow.on('blur',"))
assert(registration, 'Production window must register the blur handler')
function fixture(platform = 'win32', realWindow, realScreen) {
  let visible = false
  let destroyed = false
  let hidden = 0
  let killed = 0
  let flashes = 0
  let quits = 0
  let copyCallback
  let focusCallback
  const sent = []
  const bounds = { x: 100, y: 100, width: 420, height: 500 }
  const mainWindow = realWindow || Object.assign(new EventEmitter(), {
    isDestroyed: () => destroyed, isVisible: () => visible, isMinimized: () => false,
    restore() {}, getBounds: () => ({ ...bounds }),
    setPosition: (x, y) => Object.assign(bounds, { x, y }),
    show: () => { visible = true }, focus() {}, moveTop() {},
    hide: () => { hidden++; visible = false; mainWindow.emit('blur') },
    flashFrame: () => { flashes++ }, getNativeWindowHandle: () => Buffer.alloc(8),
    webContents: { send: (...args) => sent.push(args) },
  })
  const screen = realScreen || { getCursorScreenPoint: () => ({ x: 200, y: 200 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }) }
  const execFile = (_, args, options, callback) => {
    if (args[0] === '--activate') focusCallback = callback
    else copyCallback = callback
    return { kill() { killed++; queueMicrotask(() => callback(new Error('Dismissed'), '')) } }
  }
  // A saved "quit" preference must not make an outside click quit the app.
  const store = { get: () => 'quit', set() {} }
  const code = 'let capturingSelection = false; let nativeFocusProcess = null; let isQuitting = false; const windowBoundsKey = "windowBounds"; const closeBehaviorKey = "closeBehavior";\n' +
    ts.transpile(functions + '\n' + registration.getText(source), { target: ts.ScriptTarget.ES2022 }) +
    ';return { activateWindow, showWindow, setQuitting: value => { isQuitting = value } };'
  const api = new Function('mainWindow', 'screen', 'process', 'app', 'systemPreferences', 'clipboard', 'execFile', 'Buffer', 'resolveIconPath', 'store', 'quitApp', code)(
    mainWindow, screen, { platform, pid: process.pid }, { focus() {} }, { isTrustedAccessibilityClient: () => true },
    { readText: () => '' }, execFile, Buffer, name => name, store, () => { quits++ })
  return { ...api, mainWindow, sent, state: () => ({ hidden, killed, flashes, quits }),
    finishCopy: text => copyCallback(text ? null : new Error('No selection'), text ? Buffer.from(text).toString('base64') : ''),
    finishFocus: () => focusCallback?.(null, ''), destroy: () => { destroyed = true } }
}
async function runUnit() {
  for (const platform of ['win32', 'darwin']) {
    const f = fixture(platform)
    f.showWindow()
    assert(f.mainWindow.isVisible())
    f.mainWindow.webContents.send('settings:input', 'editing')
    assert(f.mainWindow.isVisible(), 'In-window activity must not dismiss the window')
    f.mainWindow.emit('blur')
    assert(!f.mainWindow.isVisible())
    assert.equal(f.state().quits, 0)
    assert.equal(f.state().hidden, 1, 'hide-induced blur must not recurse')
    for (const text of ['New selection', null]) {
      const pending = f.activateWindow()
      f.finishCopy(text)
      await Promise.resolve()
      f.finishFocus()
      await pending
      assert(f.mainWindow.isVisible(), 'Next shortcut must show the window again')
      f.mainWindow.emit('blur')
    }
    assert(f.sent.some(([channel, text]) => channel === 'input:setFromClipboard' && text === 'New selection'))
    f.showWindow()
    f.setQuitting(true)
    f.mainWindow.emit('blur')
    assert(f.mainWindow.isVisible(), 'Do not interfere with app shutdown')
  }
  const pendingFocus = fixture()
  const pending = pendingFocus.activateWindow()
  pendingFocus.finishCopy('text')
  await Promise.resolve()
  pendingFocus.mainWindow.emit('blur')
  await pending
  assert.equal(pendingFocus.state().killed, 1)
  assert.equal(pendingFocus.state().flashes, 0)
  assert(!pendingFocus.mainWindow.isVisible(), 'Late native focus completion must not reopen the dismissed window')
  console.log('PASS: outside-focus hide, settings activity, shortcut reopen, no auto-quit, native focus cancellation')
}
async function runNative() {
  const { app, BrowserWindow, screen } = require('electron')
  app.setPath('userData', path.join(app.getPath('temp'), 'translite-auto-hide-test'))
  await app.whenReady()
  const main = new BrowserWindow({ width: 420, height: 500, show: false, frame: false, alwaysOnTop: true })
  const outside = new BrowserWindow({ width: 250, height: 120, show: false, title: 'Translite outside-window test' })
  const f = fixture('win32', main, screen)
  async function until(check) {
    for (let i = 0; i < 50; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 30)) }
    throw new Error('Real window focus check timed out')
  }
  f.showWindow()
  await until(() => main.isFocused())
  outside.show()
  outside.focus()
  await until(() => !main.isVisible())
  const pending = f.activateWindow()
  f.finishCopy(null)
  await Promise.resolve()
  f.finishFocus()
  await pending
  await until(() => main.isVisible() && main.isFocused())
  console.log('PASS: real Electron blur hides the window; next shortcut restores it')
  main.destroy()
  outside.destroy()
  app.exit(0)
}
runUnit().then(() => process.versions.electron ? runNative() : undefined).catch(error => {
  console.error(error)
  if (process.versions.electron) require('electron').app.exit(1)
  else process.exitCode = 1
})

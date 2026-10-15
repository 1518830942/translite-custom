const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const assert = require('node:assert/strict')
const source = ts.createSourceFile('index.ts', fs.readFileSync(path.join(__dirname, '../src/main/index.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
const names = new Set(['showWindowNearCursor', 'showWindow', 'sendClipboardTextToInput', 'activateWindow'])
const functions = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.has(n.name.text)).map(n => n.getText(source)).join('\n')
const js = ts.transpile(functions, { target: ts.ScriptTarget.ES2022 })
function fixture({ point = { x: 500, y: 300 }, area = { x: 0, y: 0, width: 1920, height: 1040 }, minimized = false, platform = 'win32', trusted = true } = {}) {
  const events = []
  let cursor = point
  let visible = false
  let destroyed = false
  let selectionCallback
  const bounds = { x: 10, y: 10, width: 420, height: 500 }
  const window = {
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    isMinimized: () => minimized,
    restore: () => { minimized = false; events.push('restore') },
    getBounds: () => ({ ...bounds }),
    setPosition: (x, y) => { Object.assign(bounds, { x, y }); events.push('position') },
    show: () => { visible = true; events.push('show') }, moveTop() {}, focus() {}, flashFrame() {},
    getNativeWindowHandle: () => Buffer.alloc(8),
    webContents: { send: (channel, text) => events.push({ channel, text }) },
  }
  const screen = {
    getCursorScreenPoint: () => ({ ...cursor }),
    getDisplayNearestPoint: point => { events.push({ displayPoint: point }); return { workArea: area, scaleFactor: 2 } },
  }
  const execFile = (_, args, options, callback) => {
    if (args[0] === '--activate') callback(null, '')
    else { events.push('capture'); selectionCallback = callback }
  }
  const api = new Function('mainWindow', 'screen', 'process', 'app', 'systemPreferences', 'clipboard', 'execFile', 'Buffer', 'resolveIconPath',
    'let capturingSelection = false; let nativeFocusProcess = null;\n' + js + ';return { showWindowNearCursor, showWindow, activateWindow };')(
      window, screen, { platform, pid: 123 }, { focus() {} }, { isTrustedAccessibilityClient: () => trusted },
      { readText: () => '' }, execFile, Buffer, name => name)
  return { ...api, bounds, events, moveCursor: point => { cursor = point }, destroy: () => { destroyed = true },
    finishCopy: text => selectionCallback(text ? null : new Error('No selection'), text ? Buffer.from(text).toString('base64') : '') }
}

;(async () => {
  for (const { point, area, expected } of [
    { point: { x: 500, y: 300 }, expected: [512, 312] },
    { point: { x: 1900, y: 1020 }, expected: [1468, 508] },
    { point: { x: -10, y: 1050 }, area: { x: -1920, y: 40, width: 1920, height: 1040 }, expected: [-442, 538] },
    { point: { x: 0, y: 1070 }, expected: [12, 540] },
    { point: { x: 100, y: 25 }, area: { x: 0, y: 30, width: 1440, height: 870 }, expected: [112, 37] },
  ]) {
    const f = fixture({ point, area, minimized: true })
    f.showWindowNearCursor(point)
    assert.deepEqual([f.bounds.x, f.bounds.y], expected)
    assert.deepEqual([f.bounds.width, f.bounds.height], [420, 500])
    assert(f.events.indexOf('restore') < f.events.indexOf('position'))
    assert(f.events.indexOf('position') < f.events.indexOf('show'))
  }
  for (const text of ['Selected text', null]) {
    const f = fixture()
    const pending = f.activateWindow()
    assert.deepEqual(f.events, ['capture'], 'Do not move or focus before copying')
    f.moveCursor({ x: 1900, y: 1000 })
    f.finishCopy(text)
    await pending
    assert.deepEqual([f.bounds.x, f.bounds.y], [512, 312], 'Use cursor position from the hotkey press')
    assert.equal(f.events.filter(e => e.channel === 'input:setFromClipboard').length, text ? 1 : 0)
  }
  const mac = fixture({ platform: 'darwin', trusted: false })
  await mac.activateWindow()
  assert(!mac.events.includes('capture'))
  assert.deepEqual([mac.bounds.x, mac.bounds.y], [512, 312])
  const closed = fixture()
  const pending = closed.activateWindow()
  closed.destroy()
  closed.finishCopy('text')
  await pending
  assert(!closed.events.includes('position'))
  const tray = fixture()
  tray.showWindow()
  assert(!tray.events.includes('position'), 'Tray and Dock opens should retain their current position')
  console.log('PASS: cursor placement, edge flip/clamp, negative monitor coordinates, DIP scaling, minimized restore, copy ordering and hotkey cursor snapshot')
})().catch(error => { console.error(error); process.exitCode = 1 })

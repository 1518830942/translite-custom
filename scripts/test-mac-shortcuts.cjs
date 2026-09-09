const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
function source(file) {
  return ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}
const main = source('src/main/index.ts')
const appSource = source('src/renderer/src/App.tsx')
const settings = source('src/renderer/src/components/ShortcutSettingsModal.tsx')
const variable = (node, name) => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText() === name)
for (const platform of ['darwin', 'win32']) {
  const window = { api: { platform } }
  const process = { platform }
  for (const file of [main, appSource]) {
    const declaration = file.statements.find(n => variable(n, 'defaultShortcut')).getText(file)
    const value = new Function('window', 'process', declaration + ';return defaultShortcut;')(window, process)
    assert.equal(value, platform === 'darwin' ? 'Control+D' : 'Alt+E')
  }
  const mapping = settings.statements.filter(n => variable(n, 'SPECIAL_KEYS') || (ts.isFunctionDeclaration(n) && n.name.text === 'keyToAccelerator')).map(n => n.getText(settings)).join('\n')
  const key = new Function('window', ts.transpile(mapping) + ';return keyToAccelerator;')(window)
  assert.equal(key('d', 'KeyD'), 'D')
  assert.equal(key('ArrowLeft', 'ArrowLeft'), 'Left')
  if (platform === 'darwin') {
    assert.equal(key('Dead', 'KeyE'), 'E')
    assert.equal(key('å', 'KeyA'), 'A')
    assert.equal(key('¡', 'Digit1'), '1')
  } else {
    assert.equal(key('å', 'KeyA'), 'Å', 'Windows mapping must stay unchanged')
    assert.equal(key('!', 'Digit1'), '!')
  }
  const app = new EventEmitter()
  app.focus = () => {}
  let hidden = true
  let minimized = true
  const mainWindow = { isDestroyed: () => false, isMinimized: () => minimized, restore: () => { minimized = false }, show: () => { hidden = false }, moveTop() {}, focus() {} }
  const show = main.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === 'showWindow').getText(main)
  const registration = main.statements.find(n => ts.isIfStatement(n) && n.getText(main).includes("app.on('activate', showWindow)")).getText(main)
  new Function('app', 'process', 'mainWindow', show + '\n' + registration)(app, process, mainWindow)
  app.emit('activate')
  assert.equal(hidden, platform !== 'darwin')
  assert.equal(minimized, platform !== 'darwin')
}
console.log('PASS: Mac Control+D, Option key recording, Dock restore; Windows default and recording unchanged')

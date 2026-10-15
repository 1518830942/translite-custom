// Interactive Windows regression: real global hotkey, native input and clipboard,
// isolated Chromium/WinForms fixtures. No translation provider or user config.
const { app, BrowserWindow, globalShortcut, screen } = require('electron')
const { execFile, execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const assert = require('node:assert/strict')
const root = path.join(__dirname, '..')
const helper = path.resolve(process.argv[2] || path.join(root, 'build/selection-copy.exe'))
const fixtures = path.join(root, '.tmp/hotkey-selection')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const run = (file, args) => new Promise((resolve, reject) => execFile(file, args, { windowsHide: true, timeout: 5000 }, (error, stdout) => error ? reject(error) : resolve(stdout)))
app.setPath('userData', path.join(app.getPath('temp'), 'translite-hotkey-replay'))
app.commandLine.appendSwitch('enable-features', 'UiaProvider')

app.whenReady().then(async () => {
  assert.equal(process.platform, 'win32', 'This native regression test requires Windows')
  fs.mkdirSync(fixtures, { recursive: true })
  const csc = path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe')
  for (const name of ['HotkeyInput', 'HotkeySelectionSource']) {
    execFileSync(csc, ['/nologo', '/target:exe', '/platform:x64', '/reference:System.Windows.Forms.dll',
      '/out:' + path.join(fixtures, name + '.exe'), path.join(__dirname, name + '.cs')], { windowsHide: true })
  }
  app.setAccessibilitySupportEnabled(true)
  const source = new BrowserWindow({ width: 650, height: 350, title: 'Translite keyboard source fixture' })
  const target = new BrowserWindow({ width: 420, height: 500, frame: false, show: false })
  const captures = []
  const results = []
  let task
  let independent
  let exitCode = 0
  try {
    await source.loadURL('data:text/html,<p id="text">Selected fixture</p>')
    await source.webContents.executeJavaScript(`
      window.copies = 0; window.escapes = 0;
      document.addEventListener('copy', () => window.copies++);
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') { window.escapes++; getSelection().removeAllRanges(); }
      });
    `)
    const main = ts.createSourceFile('index.ts', fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
    const names = new Set(['showWindowNearCursor', 'showWindow', 'sendClipboardTextToInput', 'activateWindow'])
    const functions = main.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name.text)).map(node => node.getText(main)).join('\n')
    const originalSend = target.webContents.send.bind(target.webContents)
    target.webContents.send = (channel, value) => {
      if (channel === 'input:setFromClipboard') captures.push(value)
      else originalSend(channel, value)
    }
    const activate = new Function('mainWindow', 'execFile', 'resolveIconPath', 'process', 'Buffer', 'screen',
      'let capturingSelection = false; let nativeFocusProcess = null;\n' + ts.transpile(functions) + '\nreturn activateWindow;')(
        target, execFile, () => helper, process, Buffer, screen)
    assert(globalShortcut.register('Alt+E', () => { task = activate() }), 'Close Translite first: Alt+E is occupied')
    const cases = [1, 15, 250].flatMap(holdMs => [0, 50].flatMap(gapMs => ['key-first', 'alt-first'].map(order => ({ holdMs, gapMs, order, selected: true }))))
    cases.push(...['key-first', 'alt-first'].map(order => ({ holdMs: 15, gapMs: 0, order, selected: false })))
    for (const kind of ['chromium', 'winforms']) for (const item of cases) {
      if (kind === 'winforms' && !item.selected) continue // Covered by TestSelectionCopy.cs.
      target.hide()
      const expected = `Hotkey selected fixture ${results.length}`
      let sourceHandle = source.getNativeWindowHandle().readBigUInt64LE().toString()
      let sourcePid = process.pid
      if (kind === 'winforms') {
        source.hide()
        independent = spawn(path.join(fixtures, 'HotkeySelectionSource.exe'), [expected], { windowsHide: true })
        sourceHandle = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Independent fixture not ready')), 3000)
          independent.stdout.once('data', value => { clearTimeout(timeout); resolve(value.toString().trim()) })
          independent.once('error', error => { clearTimeout(timeout); reject(error) })
        })
        sourcePid = independent.pid
      }
      await run(helper, ['--activate', sourceHandle, String(sourcePid)])
      await run(path.join(fixtures, 'HotkeyInput.exe'), ['escape'])
      await pause(30) // Drain only fixture setup input, before establishing the selection.
      if (kind === 'chromium') {
        source.webContents.focus()
        await source.webContents.executeJavaScript(`{
          window.copies = 0; window.escapes = 0;
          document.getElementById('text').textContent = ${JSON.stringify(expected)};
          const range = document.createRange(); range.selectNodeContents(document.getElementById('text'));
          getSelection().removeAllRanges(); ${item.selected ? 'getSelection().addRange(range);' : ''}
        }`)
      }
      const before = captures.length
      task = undefined
      const started = Date.now()
      await run(path.join(fixtures, 'HotkeyInput.exe'), [String(item.holdMs), item.order, String(item.gapMs)])
      for (let i = 0; !task && i < 50; i++) await pause(10)
      assert(task, 'Native hotkey did not trigger')
      await task
      const elapsed = Date.now() - started
      const captured = captures.length > before && captures.at(-1)?.trim() === expected
      const state = kind === 'chromium' ? await source.webContents.executeJavaScript('({ selection: getSelection().toString(), copies, escapes })') : null
      const passed = item.selected ? captured : captures.length === before
      results.push({ kind, ...item, passed, elapsed })
      assert(target.isVisible(), 'The shortcut must show the translation window')
      if (state) {
        assert.equal(state.selection, item.selected ? expected : '', 'The original selection must survive')
        assert.equal(state.copies, item.selected ? 1 : 0, 'Empty selection must not synthesize Ctrl+C')
        assert.equal(state.escapes, 0, 'Escape must never reach normal document content')
        if (!item.selected) assert(elapsed < 700, `Empty selection took ${elapsed} ms`)
      }
      if (independent) { independent.kill(); independent = null }
    }
    assert(results.every(result => result.passed), 'Quick/held key selection replay failed')
    console.log(`PASS: ${results.length} native hotkey cases, both release orders, 1/15/250 ms holds, Chromium + independent WinForms, empty selection without copying`)
  } catch (error) { console.error(error.message); exitCode = 1 }
  finally {
    independent?.kill()
    globalShortcut.unregisterAll()
    fs.writeFileSync(path.join(fixtures, 'replay.json'), JSON.stringify(results, null, 2))
    source.destroy(); target.destroy()
  }
  app.exit(exitCode)
}).catch(error => { console.error(error.message); app.exit(1) })

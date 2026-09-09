const { app, BrowserWindow } = require('electron')
const { spawn, execFile, execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const ts = require('typescript')
const assert = require('node:assert/strict')
app.setPath('userData', join(app.getPath('temp'), 'translite-focus-test'))
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 400, height: 300, alwaysOnTop: false })
  let source
  try {
    await win.loadURL('data:text/html,Translite focus regression target')
    const text = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf8')
    // Exercise the actual activation functions without starting the production app/API.
    const functions = text.slice(text.indexOf('function showWindow()'), text.indexOf('function normalizeShortcut('))
    const js = ts.transpile(functions, { target: ts.ScriptTarget.ES2022 })
    const activate = new Function('mainWindow', 'execFile', 'resolveIconPath', 'process', 'Buffer',
      'let capturingSelection = false;\n' + js + '\nreturn activateWindow;')(
        win, execFile, name => join(__dirname, '../build', name), process, Buffer)
    const foreground = () => execFileSync(join(__dirname, '../out/FocusSource.exe'), ['query'], { windowsHide: true, encoding: 'utf8' }).trim()
    const targetHandle = win.getNativeWindowHandle().readBigUInt64LE().toString()
    for (let i = 0; i < 10; i++) {
      source = spawn(join(__dirname, '../out/FocusSource.exe'), [], { windowsHide: true })
      const sourceHandle = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Source not ready')), 5000)
        source.stdout.once('data', (data) => { clearTimeout(timeout); resolve(data.toString().trim()) })
        source.once('error', reject)
      })
      await pause(200)
      assert.equal(foreground(), sourceHandle, 'Source must be the actual Windows foreground before activation')
      await activate()
      await pause(300)
      assert.equal(foreground(), targetHandle, 'Translation window must become actual Windows foreground after selection copy')
      assert.equal(win.isAlwaysOnTop(), false, 'Do not change the saved pin preference')
      source.kill()
      source = null
    }
    console.log('PASS: repeated activation from another process brings the still-open window to foreground')
    app.exit(0)
  } catch (error) {
    if (source) source.kill()
    console.error(error.message)
    app.exit(1)
  }
})

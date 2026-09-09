// Run after electron-vite build: electron scripts/test-clipboard.cjs
// Exercises the real renderer and preload with a fake translation provider.
const { app, BrowserWindow, ipcMain } = require('electron')
const { join } = require('node:path')
const assert = require('node:assert/strict')
const root = process.argv[2] || join(__dirname, '..')
app.setPath('userData', join(app.getPath('temp'), 'translite-clipboard-test'))
const calls = []
const config = { apiBaseURL: 'https://example.invalid/v1', apiKey: 'test', apiModel: 'test', targetLanguage: 'en', fallbackLanguage: 'zh' }
ipcMain.handle('store:get', (_, key) => config[key] ?? null)
ipcMain.handle('window:setAlwaysOnTop', () => true)
ipcMain.on('translate:start', (_, request) => calls.push(request))
const pause = () => new Promise(resolve => setTimeout(resolve, 30))
async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return
    await pause()
  }
  throw new Error('Timed out waiting for automatic translation')
}
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 420, height: 500, show: false, webPreferences: { preload: join(root, 'out/preload/index.js'), sandbox: false } })
  try {
    await win.loadFile(join(root, 'out/renderer/index.html'))
    await until(() => win.webContents.executeJavaScript('Boolean(document.querySelector("textarea"))'))
    // Allow initial settings and the clipboard subscription to settle.
    await new Promise(resolve => setTimeout(resolve, 200))
    win.webContents.send('input:setFromClipboard', 'Hello world')
    await until(() => calls.length === 1)
    assert.equal(calls[0].text, 'Hello world')
    assert.equal(calls[0].to, 'zh')
    assert.equal(calls[0].mode, 'translate')
    win.webContents.send('input:setFromClipboard', 'intermediate')
    win.webContents.send('input:setFromClipboard', '你好世界')
    await new Promise(resolve => setTimeout(resolve, 150))
    assert.equal(calls.length, 1)
    win.webContents.send('translate:done', { id: calls[0].id })
    await until(() => calls.length === 2)
    assert.equal(calls[1].text, '你好世界')
    assert.equal(calls[1].to, 'en')
    win.webContents.send('translate:chunk', { id: calls[1].id, chunk: 'Test result' })
    win.webContents.send('translate:done', { id: calls[1].id })
    await until(() => win.webContents.executeJavaScript('document.body.innerText.includes("Test result")'))
    win.webContents.send('input:setFromClipboard', '   ')
    await new Promise(resolve => setTimeout(resolve, 150))
    assert.equal(calls.length, 2)
    win.webContents.send('input:setFromClipboard', 'hello')
    await until(() => calls.length === 3)
    win.webContents.send('translate:phonetics', { id: calls[2].id, phonetics: { uk: '/həˈləʊ/', us: '/həˈloʊ/' } })
    win.webContents.send('translate:chunk', { id: calls[2].id, chunk: '你好；喂（用于问候或接电话）' })
    win.webContents.send('translate:done', { id: calls[2].id })
    await until(() => win.webContents.executeJavaScript('document.body.innerText.includes("/həˈloʊ/")'))
    assert.equal(await win.webContents.executeJavaScript('document.body.innerText.includes("/həˈləʊ/")'), true)
    win.showInactive()
    await new Promise(resolve => setTimeout(resolve, 250))
    require('node:fs').writeFileSync(join(__dirname, '../out/phonetics-preview.png'), (await win.webContents.capturePage()).toPNG())
    win.hide()
    win.webContents.send('input:setFromClipboard', 'A whole sentence')
    await until(() => calls.length === 4)
    await until(() => win.webContents.executeJavaScript('!document.body.innerText.includes("/həˈloʊ/")'))
    // Completed request listeners must no longer update the next translation.
    win.webContents.send('translate:phonetics', { id: calls[2].id, phonetics: { uk: '/stale/', us: '/stale/' } })
    await pause()
    assert.equal(await win.webContents.executeJavaScript('document.body.innerText.includes("/stale/")'), false)
    win.webContents.send('translate:done', { id: calls[3].id })
    console.log('PASS: UK/US phonetics rendered, cleared on next request, stale metadata ignored')
    console.log('PASS: automatic submit, latest clipboard queued, language detection, result rendering, empty clipboard ignored')
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})

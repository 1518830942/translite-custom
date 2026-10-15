// Reproduce selection in a chat transcript while another text control has focus.
const { app, BrowserWindow } = require('electron')
const { execFile } = require('node:child_process')
const path = require('node:path')
const assert = require('node:assert/strict')
const helper = path.resolve(process.argv[2] || path.join(__dirname, '../build/selection-copy.exe'))
app.setPath('userData', path.join(app.getPath('temp'), 'translite-document-selection'))
app.commandLine.appendSwitch('enable-features', 'UiaProvider')
const run = args => new Promise(resolve => execFile(helper, args, { windowsHide: true, timeout: 3500 }, (error, stdout) => resolve({ code: error?.code ?? 0, text: error ? null : Buffer.from(stdout.trim(), 'base64').toString('utf8') })))
app.whenReady().then(async () => {
  app.setAccessibilitySupportEnabled(true)
  const source = new BrowserWindow({ width: 700, height: 400, title: 'Translite document selection fixture' })
  const expected = 'Chat transcript selected fixture'
  const results = []
  let exitCode = 0
  try {
    const nested = '<section role="group">'.repeat(12) + '<input id="nested">' + '</section>'.repeat(12)
    await source.loadURL('data:text/html,' + encodeURIComponent(`<main><article><p id="text">${expected}</p></article><textarea id="textarea">Draft fixture</textarea><input id="input" value="Draft fixture"><div id="composer" contenteditable="true" role="textbox" tabindex="0">Draft fixture</div><button id="button">Quote</button>${nested}</main>`))
    await source.webContents.executeJavaScript(`window.copyCount = 0; document.addEventListener('copy', event => {
      window.copyCount++;
      if (!getSelection().toString() && !window.editorCopy) { event.clipboardData.setData('text/plain', 'Previous answer must not be translated'); event.preventDefault(); }
    });`)
    await run(['--activate', source.getNativeWindowHandle().readBigUInt64LE().toString(), String(process.pid)])
    for (const selected of [true, false]) for (const focus of ['textarea', 'input', 'composer', 'button', 'nested']) {
      await source.webContents.executeJavaScript(`{
        document.getElementById(${JSON.stringify(focus)}).focus();
        if ('setSelectionRange' in document.activeElement) document.activeElement.setSelectionRange(0, 0);
        const range = document.createRange(); range.selectNodeContents(document.getElementById('text'));
        getSelection().removeAllRanges(); ${selected ? 'getSelection().addRange(range);' : ''}
        window.copyCount = 0;
        window.editorCopy = false;
      }`)
      const state = await source.webContents.executeJavaScript('({ selected: getSelection().toString(), focused: document.activeElement.id })')
      const started = Date.now()
      const result = await run([])
      const elapsed = Date.now() - started
      const after = await source.webContents.executeJavaScript('({ selected: getSelection().toString(), copies: copyCount, draft: document.getElementById("textarea").value })')
      const captured = result.text?.trim() === expected
      results.push({ focus, hasSelection: selected, ...state, captured, code: result.code, elapsed })
      assert.equal(after.draft, 'Draft fixture', 'Document focus must preserve the composer draft')
      assert.equal(after.selected, selected ? expected : '', 'The document selection must survive')
      if (selected && captured) assert.equal(after.copies, 1, 'A selected transcript must be copied once')
      if (!selected) {
        assert.equal(result.text, null, 'No selection must not translate the previous answer')
        assert.equal(after.copies, 0, 'No selection must not synthesize Ctrl+C')
        assert(elapsed < 700, `Empty selection took ${elapsed} ms`)
      }
    }
    for (const focus of ['textarea', 'input', 'composer']) {
      const editorText = `Selected ${focus} fixture`
      await source.webContents.executeJavaScript(`{
        const editor = document.getElementById(${JSON.stringify(focus)}); editor.focus();
        getSelection().removeAllRanges(); window.copyCount = 0; window.editorCopy = true;
        if ('setSelectionRange' in editor) { editor.value = ${JSON.stringify(editorText)}; editor.select(); }
        else { editor.textContent = ${JSON.stringify(editorText)}; const range = document.createRange(); range.selectNodeContents(editor); getSelection().addRange(range); }
      }`)
      const result = await run([])
      results.push({ focus: `${focus}-own-selection`, hasSelection: true, captured: result.text?.trim() === editorText })
    }
    assert(results.filter(result => result.hasSelection).every(result => result.captured), 'A focused empty control must not hide the transcript selection')
    const emptyTimes = results.filter(result => !result.hasSelection).map(result => result.elapsed)
    console.log(`PASS: ${results.length} chat selection cases, focused editors/buttons, nested layout, editor selections, preserved drafts; empty selection ${Math.min(...emptyTimes)}-${Math.max(...emptyTimes)} ms without Ctrl+C or previous-answer copying`)
  } catch (error) { console.error(error.message, JSON.stringify(results)); exitCode = 1 }
  finally { source.destroy() }
  app.exit(exitCode)
}).catch(error => { console.error(error.message); app.exit(1) })

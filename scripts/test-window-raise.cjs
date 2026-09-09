const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const assert = require('node:assert/strict')
const source = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf8')
const body = source.slice(source.indexOf('function showWindow()'), source.indexOf('function sendClipboardTextToInput()'))
for (const minimized of [false, true]) {
  let covered = true
  let isMinimized = minimized
  const window = {
    isDestroyed: () => false,
    isMinimized: () => isMinimized,
    restore: () => { isMinimized = false },
    show: () => {},
    // Model Windows declining foreground focus while the existing window is covered.
    focus: () => {},
    moveTop: () => { covered = false },
  }
  new Function('mainWindow', body + '\nshowWindow();')(window)
  assert.equal(covered, false, 'Existing window must be raised even when focus is declined')
  assert.equal(isMinimized, false, 'Minimized window must be restored')
}
console.log('PASS: explicit window raise when focus is declined, minimized window restored')

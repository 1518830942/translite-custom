const { execFileSync } = require('node:child_process')
const { join } = require('node:path')
if (process.platform !== 'win32') process.exit(0)
execFileSync(join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), [
  '/nologo', '/target:exe', '/platform:x64', '/optimize+',
  '/reference:System.Windows.Forms.dll', '/out:' + join(__dirname, '../build/selection-copy.exe'),
  join(__dirname, '../src/native/SelectionCopy.cs'),
], { cwd: join(__dirname, '..'), windowsHide: true, stdio: 'inherit' })

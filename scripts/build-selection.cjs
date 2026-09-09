const { execFileSync } = require('node:child_process')
const { join } = require('node:path')
const { mkdirSync, rmSync } = require('node:fs')

const root = join(__dirname, '..')

if (process.platform === 'win32') {
  execFileSync(join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), [
    '/nologo', '/target:exe', '/platform:x64', '/optimize+',
    '/reference:System.Windows.Forms.dll', '/out:' + join(root, 'build/selection-copy.exe'),
    join(root, 'src/native/SelectionCopy.cs'),
  ], { cwd: root, windowsHide: true, stdio: 'inherit' })
} else if (process.platform === 'darwin') {
  execFileSync('xcrun', [
    'swiftc', '-O',
    '-target', 'arm64-apple-macos11.0',
    '-framework', 'AppKit',
    '-framework', 'ApplicationServices',
    '-o', join(root, 'build/selection-copy-macos'),
    join(root, 'src/native/SelectionCopy.swift'),
  ], { cwd: root, stdio: 'inherit' })

  const iconset = join(root, 'build/icon.iconset')
  rmSync(iconset, { recursive: true, force: true })
  mkdirSync(iconset)
  for (const [size, name] of [[16, '16x16'], [32, '16x16@2x'], [32, '32x32'], [64, '32x32@2x'], [128, '128x128'], [256, '128x128@2x'], [256, '256x256'], [512, '256x256@2x'], [512, '512x512'], [1024, '512x512@2x']]) {
    execFileSync('sips', ['-z', String(size), String(size), join(root, 'build/icon.png'), '--out', join(iconset, `icon_${name}.png`)], { stdio: 'ignore' })
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(root, 'build/icon.icns')], { stdio: 'inherit' })
  rmSync(iconset, { recursive: true, force: true })
}

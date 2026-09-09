// Explicit live verification: two short requests using the locally configured provider.
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const config = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'translite/config.json'), 'utf8'))
function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  const localRequire = id => {
    if (id === 'electron-store') return class { get(key, fallback) { return config[key] ?? fallback } }
    if (id === 'fs') return { mkdirSync() {}, appendFileSync() {} }
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'))
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports)
  return module.exports
}
;(async () => {
  const { translate } = load(path.join(__dirname, '../src/main/translate/index.ts'))
  for (const text of ['hello', 'Aseprite']) {
    let phonetics
    await translate({ text, to: 'zh', signal: AbortSignal.timeout(30000), onChunk() {}, onPhonetics: value => { phonetics = value } })
    console.log(JSON.stringify({ text, phonetics }))
    if (!phonetics?.uk || !phonetics?.us) throw new Error('Missing phonetics for test word')
  }
})().catch(() => { console.error('Live phonetics verification failed (provider details omitted)'); process.exitCode = 1 })

// Explicit live verification: two short requests using the locally configured provider.
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const config = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'translite/config.json'), 'utf8'))
let requests = 0
const observedFetch = (...args) => { requests++; return fetch(...args) }
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
  new Function('require', 'module', 'exports', 'fetch', code)(localRequire, module, module.exports, observedFetch)
  return module.exports
}
;(async () => {
  const { translate } = load(path.join(__dirname, '../src/main/translate/index.ts'))
  const words = process.argv.slice(2)
  for (const text of words.length ? words : ['hello', 'Aseprite']) {
    let phonetics, firstMs, chunks = 0
    const start = performance.now()
    await translate({ text, to: 'zh', signal: AbortSignal.timeout(30000), onChunk() { chunks++; firstMs ??= Math.round(performance.now() - start) }, onPhonetics: value => { phonetics = value } })
    console.log(JSON.stringify({ text, phonetics, firstMs, totalMs: Math.round(performance.now() - start), chunks }))
    if (!phonetics?.uk || !phonetics?.us) throw new Error('Missing phonetics for test word')
    const before = requests
    const replay = performance.now()
    await translate({ text, to: 'zh', onChunk() {} })
    if (requests !== before) throw new Error('Expected cached replay')
    console.log(JSON.stringify({ cachedReplayMs: Math.round(performance.now() - replay), extraRequests: requests - before }))
  }
})().catch(() => { console.error('Live phonetics verification failed (provider details omitted)'); process.exitCode = 1 })

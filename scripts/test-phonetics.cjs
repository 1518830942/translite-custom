const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const assert = require('node:assert/strict')
const config = { apiKey: 'test', apiBaseURL: 'https://example.invalid/v1', apiModel: 'test' }
let responseBody
let requestBody
let requests = 0
function load(file) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  const mockRequire = id => {
    if (id === 'electron-store') return class { get(key, fallback) { return config[key] ?? fallback } }
    if (id === 'fs') return { mkdirSync() {}, appendFileSync() {} }
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'))
    return require(id)
  }
  const mockFetch = async (_, options) => {
    requests++
    requestBody = JSON.parse(options.body)
    const content = JSON.stringify(responseBody)
    return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\ndata: [DONE]\n\n')
  }
  new Function('require', 'module', 'exports', 'fetch', compiled)(mockRequire, module, module.exports, mockFetch)
  return module.exports
}
const { translate } = load(path.join(__dirname, '../src/main/translate/index.ts'))
async function run(text, mode, response) {
  responseBody = response
  let result = ''
  let phonetics
  const before = requests
  await translate({ text, to: 'zh', mode, onChunk: chunk => { result += chunk }, onPhonetics: value => { phonetics = value } })
  assert.equal(requests, before + 1, 'Pronunciation must use the same translation request')
  return { result, phonetics, prompt: requestBody.messages[0].content }
}
;(async () => {
  const ipa = { uk: '/həˈləʊ/', us: '/həˈloʊ/' }
  const word = await run('hello', 'translate', { result: '你好', phonetics: ipa })
  assert.deepEqual(word.phonetics, ipa)
  assert.equal(word.result, '你好')
  assert.match(word.prompt, /General American IPA/)
  for (const [text, mode] of [['hello world', 'translate'], ['你好', 'translate'], ['hello', 'polish'], ['hello', 'explain']]) {
    const result = await run(text, mode, { result: 'text', phonetics: ipa })
    assert.equal(result.phonetics, undefined)
    assert.doesNotMatch(result.prompt, /General American IPA/)
  }
  assert.deepEqual((await run('hello', 'translate', { result: '你好' })).phonetics, { uk: null, us: null })
  assert.deepEqual((await run('Aseprite', 'translate', { result: 'Aseprite', phonetics: { uk: null, us: null } })).phonetics, { uk: null, us: null })
  assert.equal((await run('Aseprite', 'translate', { result: 'Aseprite', phonetics: { uk: '/test/', us: '/test/', estimated: true } })).phonetics.estimated, true)
  assert.deepEqual((await run('hello', 'translate', { result: '你好', phonetics: { uk: 1, us: ipa.us } })).phonetics, { uk: null, us: ipa.us })
  console.log('PASS: single-word UK/US metadata, one request, unchanged translation, sentence/mode isolation, missing or invalid phonetics')
})().catch(error => { console.error(error); process.exitCode = 1 })

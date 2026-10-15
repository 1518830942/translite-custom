const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('./load-ts.cjs')
const root = path.join(__dirname, '..')
const { createTranslationEngine } = createLoader()(path.join(root, 'src/main/translate/session.ts'))
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const tick = async () => { await Promise.resolve(); await Promise.resolve() }
const prepare = options => ({ key: options.text, endpoint: 'https://example.invalid', apiKey: 'fixture', body: {}, withPhonetics: false })
function lookup(engine, text, signal) {
  let output = '', phonetics
  const promise = engine.translate({ text, to: 'zh', signal, onChunk: chunk => { output += chunk }, onPhonetics: value => { phonetics = value } })
  return { promise, output: () => output, phonetics: () => phonetics }
}
function controlled(options = {}) {
  const executions = []
  const engine = createTranslationEngine({ prepare, execute: (request, callbacks) => new Promise(resolve => executions.push({ request, callbacks, resolve })), ...options })
  const complete = (index, text, fullText = text) => { const job = executions[index]; job.callbacks.onChunk(text); job.resolve({ text: fullText }) }
  return { engine, executions, complete }
}
;(async () => {
  const shared = controlled()
  const aController = new AbortController(), bController = new AbortController()
  const a = lookup(shared.engine, 'same', aController.signal)
  const aRejected = assert.rejects(a.promise, { name: 'AbortError' })
  await tick()
  shared.executions[0].callbacks.onChunk('partial ')
  const b = lookup(shared.engine, 'same', bController.signal)
  assert.equal(b.output(), 'partial ', 'Joiner must receive existing streamed text')
  aController.abort()
  await aRejected
  assert.equal(shared.executions[0].callbacks.signal.aborted, false)
  shared.complete(0, 'complete', 'partial complete')
  await b.promise
  assert.equal(b.output(), 'partial complete')
  const hit = lookup(shared.engine, 'same')
  await hit.promise
  assert.equal(hit.output(), 'partial complete')
  assert.equal(shared.executions.length, 1)

  const cancelled = controlled()
  const controller = new AbortController()
  const old = lookup(cancelled.engine, 'same', controller.signal)
  const oldRejected = assert.rejects(old.promise, { name: 'AbortError' })
  await tick()
  controller.abort()
  await oldRejected
  assert(cancelled.executions[0].callbacks.signal.aborted)
  const newer = lookup(cancelled.engine, 'same')
  await tick()
  cancelled.complete(0, 'late old result')
  cancelled.complete(1, 'new result')
  await newer.promise
  assert.equal(old.output(), '')
  assert.equal(newer.output(), 'new result')
  const cached = lookup(cancelled.engine, 'same')
  await cached.promise
  assert.equal(cached.output(), 'new result')

  for (const [label, options, activate, expected] of [
    ['first content', { firstContentMs: 20, totalMs: 500 }, () => () => {}, /等待模型/],
    ['idle gap', { firstContentMs: 500, idleMs: 20, totalMs: 500 }, callbacks => { callbacks.onActivity(); return () => {} }, /响应中断/],
    ['total', { firstContentMs: 500, idleMs: 100, totalMs: 50 }, callbacks => { callbacks.onActivity(); const timer = setInterval(callbacks.onActivity, 8); return () => clearInterval(timer) }, /总耗时/],
  ]) {
    const f = controlled(options)
    const query = lookup(f.engine, label)
    const rejected = assert.rejects(query.promise, error => error.name === 'TimeoutError' && expected.test(error.message))
    await tick()
    const cleanup = activate(f.executions[0].callbacks)
    await rejected
    cleanup()
    assert(f.executions[0].callbacks.signal.aborted)
    const retry = lookup(f.engine, label)
    await tick()
    f.complete(1, 'retry result')
    await retry.promise
    assert.equal(retry.output(), 'retry result', 'Timeout must not poison subsequent requests')
  }
  const invalidated = controlled()
  const oldConfig = lookup(invalidated.engine, 'config')
  await tick()
  invalidated.engine.clearCache()
  const newConfig = lookup(invalidated.engine, 'config')
  await tick()
  invalidated.complete(0, 'old config result')
  invalidated.complete(1, 'new config result')
  await Promise.all([oldConfig.promise, newConfig.promise])
  const configHit = lookup(invalidated.engine, 'config')
  await configHit.promise
  assert.equal(configHit.output(), 'new config result')

  let calls = 0
  const lru = createTranslationEngine({ prepare, maxEntries: 2, ttlMs: 25, execute: async (request, callbacks) => {
    calls++; callbacks.onChunk(request.key); return { text: request.key }
  } })
  for (const key of ['a', 'b', 'a', 'c', 'b']) await lookup(lru, key).promise
  assert.equal(calls, 4, 'LRU must preserve recent a and evict b')
  await pause(40)
  await lookup(lru, 'b').promise
  assert.equal(calls, 5, 'Expired cache entry must be fetched again')
  lru.clearCache()
  await lookup(lru, 'b').promise
  assert.equal(calls, 6)
  let largeCalls = 0
  const large = createTranslationEngine({ prepare, execute: async (_, callbacks) => {
    largeCalls++; const text = 'x'.repeat(70 * 1024); callbacks.onChunk(text); return { text }
  } })
  await lookup(large, 'large').promise
  await lookup(large, 'large').promise
  assert.equal(largeCalls, 2, 'Oversized results must not be retained')
  let byteCalls = 0
  const byteLimited = createTranslationEngine({ prepare, maxBytes: 80, execute: async (_, callbacks) => {
    byteCalls++; const text = 'x'.repeat(50); callbacks.onChunk(text); return { text }
  } })
  for (const key of ['a', 'b', 'a']) await lookup(byteLimited, key).promise
  assert.equal(byteCalls, 3, 'Total cached bytes must also be bounded')

  const config = { apiKey: 'fixture-key', apiBaseURL: 'https://example.invalid/v1', apiModel: 'fixture-model' }
  let providerCalls = 0
  let broken = false
  const load = createLoader({
    'electron-store': class { get(key, fallback) { return config[key] ?? fallback } },
    fs: { promises: { mkdir: async () => { throw new Error('optional log unavailable') } } },
    fetch: async () => {
      providerCalls++
      if (broken) return new Response('data:' + JSON.stringify({ choices: [{ delta: { content: 'This is only half of' } }] }) + '\n\n')
      return new Response('data:' + JSON.stringify({ choices: [{ delta: { content: JSON.stringify({ result: 'cached result', phonetics: { uk: '/test/', us: '/test/' } }) } }] }) + '\n\ndata:[DONE]\n\n')
    },
  })
  const actual = load(path.join(root, 'src/main/translate/index.ts'))
  const first = lookup(actual, 'hello')
  await first.promise
  const replay = lookup(actual, 'hello')
  await replay.promise
  assert.equal(providerCalls, 1)
  assert.deepEqual(replay.phonetics(), { uk: '/test/', us: '/test/' })
  for (const key of ['apiModel', 'apiBaseURL', 'apiKey', 'translatePrompt']) {
    config[key] += '-changed'
    const before = providerCalls
    await lookup(actual, 'hello').promise
    assert.equal(providerCalls, before + 1, key + ' must invalidate the request key')
  }
  const beforeMode = providerCalls
  await actual.translate({ text: 'hello', to: 'zh', mode: 'polish', onChunk() {} })
  await actual.translate({ text: 'hello', to: 'en', onChunk() {} })
  assert.equal(providerCalls, beforeMode + 2, 'Mode and target language must be part of the key')
  broken = true
  const beforeBroken = providerCalls
  for (let i = 0; i < 2; i++) await assert.rejects(lookup(actual, 'truncated fixture').promise, /未正常结束/)
  assert.equal(providerCalls, beforeBroken + 2, 'Truncated plain streams must never enter the cache')
  console.log('PASS: in-flight sharing/replay, independent cancellation, stale results, first/idle/total timeouts, retry, cache LRU/TTL/size/config invalidation, phonetics and optional log failures')
})().catch(error => { console.error(error); process.exitCode = 1 })

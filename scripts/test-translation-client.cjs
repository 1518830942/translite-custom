const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('./load-ts.cjs')
const listeners = new Set()
let scenario = 'cached', abortCalls = 0
const subscribe = (channel, id, callback) => {
  const item = { channel, id, callback }
  listeners.add(item)
  return () => listeners.delete(item)
}
const emit = (channel, id, value) => {
  for (const listener of [...listeners]) if (listener.channel === channel && listener.id === id) listener.callback(value)
}
global.window = { api: { translate: {
  onChunk: (id, callback) => subscribe('chunk', id, callback),
  onPhonetics: (id, callback) => subscribe('phonetics', id, callback),
  onDone: (id, callback) => subscribe('done', id, callback),
  onError: (id, callback) => subscribe('error', id, callback),
  onCancelled: (id, callback) => subscribe('cancelled', id, callback),
  start(id) {
    if (scenario === 'throw') throw new Error('Fixture start failure')
    if (scenario === 'cached') {
      emit('chunk', id, 'cached result')
      emit('phonetics', id, { uk: '/test/', us: '/test/' })
      emit('done', id)
    }
  },
  abort(id) { abortCalls++; emit('cancelled', id) },
} } }
;(async () => {
  const { translateStream } = createLoader()(path.join(__dirname, '../src/renderer/src/lib/translate.ts'))
  let output = '', phonetics
  const cached = translateStream('hello', 'zh', chunk => { output += chunk }, 'translate', value => { phonetics = value })
  assert.equal(await cached.promise, 'cached result')
  assert.equal(output, 'cached result')
  assert.deepEqual(phonetics, { uk: '/test/', us: '/test/' })
  assert.equal(listeners.size, 0, 'Synchronous cache replies must be received and cleaned up')
  cached.cancel()
  assert.equal(abortCalls, 0)
  scenario = 'throw'
  await assert.rejects(translateStream('hello', 'zh', () => {}).promise, /start failure/)
  assert.equal(listeners.size, 0)
  scenario = 'pending'
  const stopped = translateStream('hello', 'zh', () => {})
  const rejected = assert.rejects(stopped.promise, { name: 'AbortError' })
  stopped.cancel()
  await rejected
  assert.equal(listeners.size, 0)
  const failed = translateStream('hello', 'zh', () => {})
  const failure = assert.rejects(failed.promise, /Fixture timeout/)
  emit('error', failed.id, 'Fixture timeout')
  await failure
  assert.equal(listeners.size, 0)
  delete global.window
  console.log('PASS: synchronous cache reply ordering, cancellation/error/start failure settlement and listener cleanup')
})().catch(error => { delete global.window; console.error(error); process.exitCode = 1 })

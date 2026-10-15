const assert = require('node:assert/strict')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const createLoader = require('./load-ts.cjs')
const handlers = new Map(), operations = new Map(), requests = [], events = []
const config = { apiKey: 'fixture', apiBaseURL: 'https://example.invalid/v1', apiModel: 'fixture' }
let destroyed = false
const sender = Object.assign(new EventEmitter(), { isDestroyed: () => destroyed, send: (name, data) => events.push({ name, ...data }) })
const load = createLoader({
  electron: { ipcMain: { on: (name, handler) => handlers.set(name, handler), handle: (name, handler) => operations.set(name, handler) } },
  'electron-store': class { get(key, fallback) { return config[key] ?? fallback } set(key, value) { config[key] = value } },
  fs: { promises: { mkdir: async () => {}, appendFile: async () => {} } },
  fetch: async (_, options) => {
    const request = { signal: options.signal, closed: false }
    requests.push(request)
    return new Response(new ReadableStream({
      start(controller) {
        request.feed = text => { if (!request.closed) controller.enqueue(new TextEncoder().encode(text)) }
        request.fail = error => { request.closed = true; controller.error(error) }
        options.signal.addEventListener('abort', () => { if (!request.closed) request.fail(options.signal.reason) }, { once: true })
      }, cancel() { request.closed = true },
    }))
  },
})
load(path.join(__dirname, '../src/main/ipc-handlers.ts')).registerIpcHandlers({ webContents: sender }, () => {}, () => '', () => '', () => true)
const start = (id, text) => handlers.get('translate:start')({ sender }, { id, text, to: 'zh', mode: 'translate' })
const abort = id => handlers.get('translate:abort')({ sender }, id)
const frame = text => 'data:' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n'
const output = id => events.filter(event => event.id === id && event.name === 'translate:chunk').map(event => event.chunk).join('')
const terminals = id => events.filter(event => event.id === id && ['translate:done', 'translate:error', 'translate:cancelled'].includes(event.name))
async function until(check) { for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 5)) } throw new Error('Fixture timed out') }

;(async () => {
  const old = start('old', 'old fixture')
  await until(() => requests.length === 1)
  requests[0].feed(frame('{"result":"old partial'))
  await until(() => output('old') === 'old partial')
  const next = start('new', 'new fixture')
  await until(() => requests.length === 2)
  await old
  assert(requests[0].signal.aborted)
  assert.deepEqual(terminals('old').map(event => event.name), ['translate:cancelled'])
  requests[1].feed(frame('{"result":"new complete"}') + 'data:[DONE]\n\n')
  await next
  assert.equal(output('new'), 'new complete')
  assert.deepEqual(terminals('new').map(event => event.name), ['translate:done'])

  const firstShared = start('shared-1', 'shared fixture')
  await until(() => requests.length === 3)
  requests[2].feed(frame('{"result":"shared '))
  await until(() => output('shared-1') === 'shared ')
  const nextShared = start('shared-2', 'shared fixture')
  await firstShared
  assert.equal(requests.length, 3)
  assert.equal(requests[2].signal.aborted, false)
  assert.equal(output('shared-2'), 'shared ')
  requests[2].feed(frame('complete"}') + 'data:[DONE]\n\n')
  await nextShared
  assert.equal(output('shared-2'), 'shared complete')
  await start('cached', 'shared fixture')
  assert.equal(requests.length, 3)
  assert.equal(output('cached'), 'shared complete')

  operations.get('store:set')({}, 'apiModel', 'new-model')
  const changed = start('changed', 'shared fixture')
  await until(() => requests.length === 4)
  abort('old')
  assert.equal(requests[3].signal.aborted, false, 'Stale cancellation must not affect the current request')
  abort('changed')
  await changed
  assert.deepEqual(terminals('changed').map(event => event.name), ['translate:cancelled'])
  const afterCancel = start('after-cancel', 'shared fixture')
  await until(() => requests.length === 5)
  const timeout = new Error('fixture timeout'); timeout.name = 'TimeoutError'
  requests[4].fail(timeout)
  await afterCancel
  assert.deepEqual(terminals('after-cancel').map(event => event.name), ['translate:error'])
  const afterError = start('after-error', 'shared fixture')
  await until(() => requests.length === 6)
  requests[5].feed(frame('{"result":"recovered"}') + 'data:[DONE]\n\n')
  await afterError
  assert.equal(output('after-error'), 'recovered')
  const configPending = start('config-pending', 'pending fixture')
  await until(() => requests.length === 7)
  operations.get('store:set')({}, 'translatePrompt', 'updated prompt')
  await configPending
  assert.deepEqual(terminals('config-pending').map(event => event.name), ['translate:cancelled'])
  const closing = start('closing', 'closing fixture')
  await until(() => requests.length === 8)
  destroyed = true
  sender.emit('destroyed')
  await closing
  assert(requests[7].signal.aborted)
  console.log('PASS: real engine + IPC latest-query replacement, cancellation terminal, in-flight replay, cache/config invalidation, stale abort, error recovery and view cleanup')
})().catch(error => { console.error(error); process.exitCode = 1 })

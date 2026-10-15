const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('./load-ts.cjs')
const root = path.join(__dirname, '..')
const request = { key: 'fixture', endpoint: 'https://example.invalid', apiKey: 'fixture', body: {}, withPhonetics: false }
const encode = text => new TextEncoder().encode(text)
const event = content => 'data:' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\r\n\r\n'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const bounded = (promise, ms = 1000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Fixture timed out')), ms)
  promise.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
})

;(async () => {
  const { ResultDecoder } = createLoader()(path.join(root, 'src/main/translate/streaming.ts'))
  const expected = 'line\n"quoted" \\ slash / 中文 😀 end'
  const raw = JSON.stringify({ ignored: { result: 'wrong nested text' }, phonetics: { uk: '/test/' }, result: expected })
    .replace('😀', '\\uD83D\\uDE00').replace(/"result":/g, '"res\\u0075lt":')
  // Every split, including inside escapes and surrogate pairs; nested result keys are ignored.
  for (let split = 0; split <= raw.length; split++) {
    const decoder = new ResultDecoder()
    assert.equal(decoder.push(raw.slice(0, split)) + decoder.push(raw.slice(split)), expected)
  }
  const decoder = new ResultDecoder()
  assert.equal([...raw].map(character => decoder.push(character)).join(''), expected)

  let controller, cancelled = false, finished = false
  let resolveFirst
  const first = new Promise(resolve => { resolveFirst = resolve })
  const load = createLoader({ fetch: async () => new Response(new ReadableStream({ start(value) { controller = value }, cancel() { cancelled = true } })) })
  const { readCompletion } = load(path.join(root, 'src/main/translate/streaming.ts'))
  const chunks = []
  const pending = readCompletion({ ...request, withPhonetics: true }, {
    signal: new AbortController().signal, onActivity() {}, onChunk(chunk) { chunks.push(chunk); resolveFirst() },
  }).then(result => { finished = true; return result })
  await pause(0)
  controller.enqueue(encode(': heartbeat\r\nevent: message\r\n' + event('{"result":"早期 ')))
  await bounded(first)
  assert.equal(chunks.join(''), '早期 ')
  assert.equal(finished, false, 'First text must arrive before completion')
  controller.enqueue(encode(event('文字😀","phonetics":{"uk":"/test/","us":"/test/"}}') + 'data: [DONE]\r\n\r\n'))
  const result = await bounded(pending)
  assert.equal(result.text, '早期 文字😀')
  assert.equal(chunks.join(''), result.text)
  assert.deepEqual(result.phonetics, { uk: '/test/', us: '/test/' })
  assert(cancelled, '[DONE] must cancel a still-open transport instead of waiting for EOF')

  async function complete(body, options = {}) {
    let output = ''
    const read = createLoader({ fetch: async () => options.response || new Response(body) })(path.join(root, 'src/main/translate/streaming.ts')).readCompletion
    const result = await read(request, { signal: new AbortController().signal, onActivity() {}, onChunk: chunk => { output += chunk } })
    assert.equal(result.text, output)
    return result.text
  }
  const body = event('{"result":"中文 😀\\nline"}') + 'data:[DONE]\n\n'
  const bytes = encode(body)
  assert.equal(await complete(new ReadableStream({ start(value) { for (const byte of bytes) value.enqueue(Uint8Array.of(byte)); value.close() } })), '中文 😀\nline')
  const multi = JSON.stringify({ choices: [{ delta: { content: '{"result":"multiline SSE"}' } }] }, null, 2)
    .split('\n').map(line => 'data: ' + line).join('\n') + '\n\n'
  assert.equal(await complete(multi), 'multiline SSE')
  assert.equal(await complete('data:' + JSON.stringify({ choices: [{ delta: { content: '{"result":"EOF without newline"}' } }] })), 'EOF without newline')
  assert.equal(await complete(event('plain text') + 'data: [DONE]\n\n'), 'plain text')
  await assert.rejects(complete(event('This is only half of')), /未正常结束/)
  assert.equal(await complete('data:' + JSON.stringify({ choices: [{ delta: { content: 'complete plain text' }, finish_reason: 'stop' }] }) + '\n\n'), 'complete plain text')
  assert.equal(await complete(event('```json\n{"result":"fenced"}\n```') + 'data: [DONE]\n\n'), 'fenced')
  assert.equal(await complete('', { response: new Response(JSON.stringify({ choices: [{ message: { content: '{"result":"nonstream"}' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } }) }), 'nonstream')
  await assert.rejects(complete(event('{"result":"truncated') + 'data:[DONE]\n\n'), /不完整/)
  await assert.rejects(complete('data:{broken json}\n\n'), /无效/)
  await assert.rejects(complete(event('{"result":""}') + 'data:[DONE]\n\n'), /空结果/)
  await assert.rejects(complete('data:' + JSON.stringify({ choices: [{ delta: { content: '{"result":"partial"}' }, finish_reason: 'length' }] }) + '\n\n'), /未完整/)
  console.log('PASS: early text, DONE without EOF, fragmented SSE/UTF-8/JSON escapes, nested fields, phonetics, JSON/plain compatibility and incomplete-result rejection')
})().catch(error => { console.error(error); process.exitCode = 1 })

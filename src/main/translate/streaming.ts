import { parsePhonetics } from '../../shared/phonetics'
import { abortable, type ExecutionCallbacks, type PreparedRequest, type TranslationResult } from './types'

// Reads only the root object's result string, in one pass. JSON escapes and
// surrogate pairs may span model deltas; nested strings are never shown as text.
export class ResultDecoder {
  private depth = 0
  private state: 'key' | 'colon' | 'value' | 'comma' = 'key'
  private role: 'key' | 'result' | 'other' | null = null
  private key = ''
  private escaped = false
  private unicode: string | null = null
  private surrogate = ''
  found = false

  push(fragment: string): string {
    let output = ''
    const decoded = (character: string) => {
      if (this.role === 'key') { this.key += character; return }
      if (this.role !== 'result') return
      const code = character.charCodeAt(0)
      if (this.surrogate) {
        output += this.surrogate
        this.surrogate = ''
        if (code >= 0xdc00 && code <= 0xdfff) { output += character; return }
      }
      if (code >= 0xd800 && code <= 0xdbff) this.surrogate = character
      else output += character
    }
    for (let i = 0; i < fragment.length; i++) {
      const character = fragment[i]
      if (this.role !== null) {
        if (this.unicode !== null) {
          if (!/[0-9a-f]/i.test(character)) throw new Error('模型返回了无效的 Unicode 转义')
          this.unicode += character
          if (this.unicode.length === 4) { decoded(String.fromCharCode(parseInt(this.unicode, 16))); this.unicode = null }
        } else if (this.escaped) {
          this.escaped = false
          if (character === 'u') this.unicode = ''
          else {
            const escapes: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
            if (!(character in escapes)) throw new Error('模型返回了无效的 JSON 转义')
            decoded(escapes[character])
          }
        } else if (character === '\\') this.escaped = true
        else if (character === '"') {
          if (this.role === 'result' && this.surrogate) { output += this.surrogate; this.surrogate = '' }
          if (this.depth === 1) this.state = this.role === 'key' ? 'colon' : 'comma'
          this.role = null
        } else decoded(character)
      } else if (character === '"') {
        this.role = this.depth === 1 && this.state === 'key' ? 'key'
          : this.depth === 1 && this.state === 'value' && this.key === 'result' ? 'result' : 'other'
        if (this.role === 'key') this.key = ''
        if (this.role === 'result') this.found = true
      } else if (character === '{' || character === '[') this.depth++
      else if (character === '}' || character === ']') { this.depth--; if (this.depth === 1) this.state = 'comma' }
      else if (character === ':' && this.depth === 1) this.state = 'value'
      else if (character === ',' && this.depth === 1) this.state = 'key'
    }
    return output
  }
}

export interface CompletionResult extends TranslationResult {
  raw: string
  usage?: Record<string, unknown>
}

export async function readCompletion(request: PreparedRequest, callbacks: ExecutionCallbacks): Promise<CompletionResult> {
  const { signal, onChunk, onActivity } = callbacks
  const decoder = new ResultDecoder()
  let fullContent = ''
  let emitted = ''
  let pending = ''
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let format: 'json' | 'plain' | undefined
  let usage: Record<string, unknown> | undefined
  let finishReason: string | undefined
  let completed = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const flush = () => {
    clearTimeout(flushTimer)
    flushTimer = undefined
    if (pending && !signal.aborted) { const chunk = pending; pending = ''; emitted += chunk; onChunk(chunk) }
  }
  const publish = (chunk: string) => {
    if (!chunk) return
    pending += chunk
    if (!emitted) flush()
    else flushTimer ??= setTimeout(flush, 32)
  }
  const content = (text: string) => {
    if (!text) return
    onActivity()
    fullContent += text
    if (!format) {
      const first = fullContent.trimStart()[0]
      if (!first) return
      format = first === '{' || first === '`' ? 'json' : 'plain'
      publish(format === 'json' ? decoder.push(fullContent) : fullContent)
    } else publish(format === 'json' ? decoder.push(text) : text)
  }
  const frame = (data: string): boolean => {
    if (data.trim() === '[DONE]') { completed = true; return true }
    if (!data.trim()) return false
    let json: Record<string, any>
    try { json = JSON.parse(data) } catch { throw new Error('翻译服务返回了无效的流式数据') }
    if (json.error) throw new Error(String(json.error.message || '翻译服务返回错误'))
    const choice = json.choices?.[0]
    if (typeof choice?.delta?.content === 'string') content(choice.delta.content)
    if (choice?.finish_reason) finishReason = choice.finish_reason
    if (json.usage) usage = json.usage
    return false
  }

  try {
    const fetchPromise = fetch(request.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${request.apiKey}` },
      body: JSON.stringify(request.body), signal,
    })
    void fetchPromise.then(response => { if (signal.aborted) void response.body?.cancel().catch(() => {}) }, () => {})
    const response = await abortable(fetchPromise, signal)
    if (!response.ok) {
      const details = await abortable(response.text(), signal)
      throw new Error(`API error: ${response.status} ${details.slice(0, 1000)}`)
    }
    if (response.headers.get('content-type')?.includes('application/json')) {
      const json = await abortable(response.json(), signal)
      if (json.error) throw new Error(String(json.error.message || '翻译服务返回错误'))
      const choice = json.choices?.[0]
      if (typeof choice?.message?.content !== 'string') throw new Error('翻译服务未返回文本')
      content(choice.message.content)
      completed = true
      usage = json.usage
      finishReason = choice.finish_reason
    } else {
      if (!response.body) throw new Error('翻译服务未返回响应正文')
      reader = response.body.getReader()
      const utf8 = new TextDecoder()
      let buffer = ''
      let dataLines: string[] = []
      let doneMarker = false
      const line = (value: string) => {
        if (value === '') {
          if (dataLines.length) { doneMarker = frame(dataLines.join('\n')); dataLines = [] }
        } else if (value.startsWith('data:')) dataLines.push(value.slice(5).replace(/^ /, ''))
      }
      while (!doneMarker) {
        const chunk = await abortable(reader.read(), signal)
        buffer += chunk.done ? utf8.decode() : utf8.decode(chunk.value, { stream: true })
        let match: RegExpExecArray | null
        while (!doneMarker && (match = /\r\n|\r(?!$)|\n/.exec(buffer))) {
          line(buffer.slice(0, match.index))
          buffer = buffer.slice(match.index + match[0].length)
        }
        if (chunk.done) {
          if (!doneMarker && buffer) line(buffer.replace(/\r$/, ''))
          if (!doneMarker && dataLines.length) frame(dataLines.join('\n'))
          break
        }
      }
    }
    if (finishReason === 'length' || finishReason === 'content_filter') throw new Error('模型未完整返回翻译，请缩短文本后重试')
    let result: string
    let phonetics: TranslationResult['phonetics']
    if (format === 'plain') {
      if (!completed && finishReason !== 'stop') throw new Error('翻译流未正常结束，请重试')
      result = fullContent
    }
    else {
      const unwrapped = fullContent.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')
      let json: Record<string, unknown>
      try { json = JSON.parse(unwrapped) } catch { throw new Error('模型返回的翻译不完整或格式无效，请重试') }
      if (typeof json.result !== 'string') throw new Error('模型返回的翻译缺少 result 文本')
      result = json.result
      if (request.withPhonetics) phonetics = parsePhonetics(json.phonetics)
    }
    if (!result.trim()) throw new Error('翻译服务返回了空结果')
    flush()
    if (!result.startsWith(emitted)) throw new Error('翻译流与最终结果不一致，请重试')
    if (result.length > emitted.length) { pending = result.slice(emitted.length); flush() }
    return { text: result, phonetics: request.withPhonetics ? phonetics ?? null : undefined, raw: fullContent, usage }
  } finally {
    clearTimeout(flushTimer)
    if (reader) {
      // A provider may leave the transport open after [DONE]. Do not wait for EOF.
      void reader.cancel().catch(() => {})
    }
  }
}

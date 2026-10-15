import { abortReason, type ExecutionCallbacks, type PreparedRequest, type TranslateOptions, type TranslationResult } from './types'

interface Subscriber {
  options: TranslateOptions
  resolve: () => void
  reject: (error: Error) => void
  cleanup: () => void
}
interface Job {
  request: PreparedRequest
  controller: AbortController
  subscribers: Set<Subscriber>
  text: string
  settled: boolean
  generation: number
  timers: Array<ReturnType<typeof setTimeout>>
  idleTimer?: ReturnType<typeof setTimeout>
}
interface EngineOptions {
  prepare: (options: TranslateOptions) => PreparedRequest
  execute: (request: PreparedRequest, callbacks: ExecutionCallbacks) => Promise<TranslationResult>
  firstContentMs?: number
  idleMs?: number
  totalMs?: number
  ttlMs?: number
  maxEntries?: number
  maxBytes?: number
}

// One shared execution per request key. Subscribers cancel independently, so a
// new identical lookup can attach before the previous UI request is cancelled.
export function createTranslationEngine(options: EngineOptions) {
  const jobs = new Map<string, Job>()
  const cache = new Map<string, { result: TranslationResult; expires: number; bytes: number }>()
  const firstContentMs = options.firstContentMs ?? 20_000
  const idleMs = options.idleMs ?? 15_000
  const totalMs = options.totalMs ?? 60_000
  const ttlMs = options.ttlMs ?? 300_000
  const maxEntries = options.maxEntries ?? 128
  const maxBytes = options.maxBytes ?? 4 * 1024 * 1024
  let bytes = 0
  let generation = 0

  const removeCache = (key: string) => {
    const entry = cache.get(key)
    if (entry) bytes -= entry.bytes
    cache.delete(key)
  }
  const clearCache = () => { cache.clear(); bytes = 0; generation++ }
  const putCache = (job: Job, result: TranslationResult) => {
    if (job.generation !== generation || ttlMs <= 0) return
    const size = Buffer.byteLength(JSON.stringify(result))
    if (size > 64 * 1024 || size > maxBytes) return
    const now = Date.now()
    for (const [key, entry] of cache) if (entry.expires <= now) removeCache(key)
    removeCache(job.request.key)
    cache.set(job.request.key, { result, expires: now + ttlMs, bytes: size })
    bytes += size
    while (cache.size > maxEntries || bytes > maxBytes) removeCache(cache.keys().next().value!)
  }
  const settle = (job: Job, result?: TranslationResult, error?: Error) => {
    if (job.settled) return
    job.settled = true
    job.timers.forEach(clearTimeout)
    clearTimeout(job.idleTimer)
    if (jobs.get(job.request.key) === job) jobs.delete(job.request.key)
    if (result) putCache(job, result)
    for (const subscriber of job.subscribers) {
      subscriber.cleanup()
      if (error) subscriber.reject(error)
      else {
        try {
          if (result!.phonetics !== undefined) subscriber.options.onPhonetics?.(result!.phonetics)
          subscriber.resolve()
        } catch (failure) { subscriber.reject(failure instanceof Error ? failure : new Error(String(failure))) }
      }
    }
    job.subscribers.clear()
  }
  const timeout = (job: Job, message: string) => {
    const error = new Error(message)
    error.name = 'TimeoutError'
    job.controller.abort(error)
  }
  const start = (job: Job) => {
    job.controller.signal.addEventListener('abort', () => settle(job, undefined, abortReason(job.controller.signal)), { once: true })
    const first = setTimeout(() => timeout(job, '等待模型响应超时，请重试'), firstContentMs)
    job.timers.push(first, setTimeout(() => timeout(job, '翻译总耗时超时，请缩短文本后重试'), totalMs))
    // Start in a microtask so the first subscriber is registered before any delta.
    void Promise.resolve().then(async () => {
      if (job.settled) return
      const result = await options.execute(job.request, {
        signal: job.controller.signal,
        onActivity: () => {
          if (job.settled) return
          clearTimeout(first)
          clearTimeout(job.idleTimer)
          job.idleTimer = setTimeout(() => timeout(job, '翻译响应中断超时，请重试'), idleMs)
        },
        onChunk: chunk => {
          if (job.settled) return
          job.text += chunk
          for (const subscriber of [...job.subscribers]) {
            try { subscriber.options.onChunk(chunk) }
            catch (failure) {
              job.subscribers.delete(subscriber)
              subscriber.cleanup()
              subscriber.reject(failure instanceof Error ? failure : new Error(String(failure)))
            }
          }
          if (!job.subscribers.size) job.controller.abort()
        },
      })
      if (!job.settled) settle(job, result)
    }).catch(error => settle(job, undefined, error instanceof Error ? error : new Error(String(error))))
  }

  const translate = (input: TranslateOptions): Promise<void> => {
    if (input.signal?.aborted) return Promise.reject(abortReason(input.signal))
    let request: PreparedRequest
    try { request = options.prepare(input) } catch (error) { return Promise.reject(error) }
    const hit = cache.get(request.key)
    if (hit && hit.expires > Date.now()) {
      cache.delete(request.key)
      cache.set(request.key, hit)
      try {
        input.onChunk(hit.result.text)
        if (hit.result.phonetics !== undefined) input.onPhonetics?.(hit.result.phonetics)
        return Promise.resolve()
      } catch (error) { return Promise.reject(error) }
    }
    if (hit) removeCache(request.key)
    let job = jobs.get(request.key)
    if (job?.generation !== generation) job = undefined
    if (!job) {
      job = { request, controller: new AbortController(), subscribers: new Set(), text: '', settled: false, generation, timers: [] }
      jobs.set(request.key, job)
      start(job)
    }
    const current = job
    return new Promise((resolve, reject) => {
      const abort = () => {
        current.subscribers.delete(subscriber)
        subscriber.cleanup()
        reject(abortReason(input.signal!))
        if (!current.subscribers.size && !current.settled) current.controller.abort()
      }
      const subscriber: Subscriber = { options: input, resolve, reject, cleanup: () => input.signal?.removeEventListener('abort', abort) }
      current.subscribers.add(subscriber)
      input.signal?.addEventListener('abort', abort, { once: true })
      try { if (current.text) input.onChunk(current.text) }
      catch (error) {
        current.subscribers.delete(subscriber)
        subscriber.cleanup()
        reject(error)
        if (!current.subscribers.size) current.controller.abort()
      }
    })
  }
  return { translate, clearCache }
}

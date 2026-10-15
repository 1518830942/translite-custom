import type { WordPhonetics } from '../../shared/phonetics'

export type TranslateMode = 'translate' | 'polish' | 'explain'

export interface TranslateOptions {
  text: string
  to: string
  mode?: TranslateMode
  signal?: AbortSignal
  onChunk: (chunk: string) => void
  onPhonetics?: (phonetics: WordPhonetics | null) => void
}

export interface PreparedRequest {
  key: string
  endpoint: string
  apiKey: string
  body: Record<string, unknown>
  withPhonetics: boolean
}

export interface TranslationResult {
  text: string
  phonetics?: WordPhonetics | null
}

export interface ExecutionCallbacks {
  signal: AbortSignal
  onChunk: (chunk: string) => void
  onActivity: () => void
}

export function abortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason
  const error = new Error('翻译已取消')
  error.name = 'AbortError'
  return error
}

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal))
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(abortReason(signal)) }
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(value => { cleanup(); signal.aborted ? reject(abortReason(signal)) : resolve(value) }, error => { cleanup(); reject(error) })
  })
}

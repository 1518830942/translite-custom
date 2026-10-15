import type { WordPhonetics } from '../../../shared/phonetics'

export interface TranslationTask {
  id: string
  promise: Promise<string>
  cancel: () => void
}

export function translateStream(
  text: string,
  to: string,
  onChunk: (chunk: string) => void,
  mode?: string,
  onPhonetics?: (phonetics: WordPhonetics | null) => void,
): TranslationTask {
  const id = crypto.randomUUID()
  let settled = false
  const promise = new Promise<string>((resolve, reject) => {
    let result = ''
    const removePhonetics = window.api.translate.onPhonetics(id, (phonetics) => onPhonetics?.(phonetics))

    const removeChunk = window.api.translate.onChunk(id, (chunk) => {
      result += chunk
      onChunk(chunk)
    })

    const removeDone = window.api.translate.onDone(id, () => {
      cleanup()
      resolve(result)
    })

    const removeError = window.api.translate.onError(id, (err) => {
      cleanup()
      reject(new Error(err))
    })
    const removeCancelled = window.api.translate.onCancelled(id, () => {
      cleanup()
      const error = new Error('翻译已取消')
      error.name = 'AbortError'
      reject(error)
    })

    function cleanup() {
      settled = true
      removePhonetics()
      removeChunk()
      removeDone()
      removeError()
      removeCancelled()
    }
    // Cache hits may reply immediately; all listeners must exist before starting.
    try { window.api.translate.start(id, text, to, mode) }
    catch (error) { cleanup(); reject(error) }
  })
  return { id, promise, cancel: () => { if (!settled) window.api.translate.abort(id) } }
}

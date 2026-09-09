import type { WordPhonetics } from '../../../shared/phonetics'

export function translateStream(
  text: string,
  to: string,
  onChunk: (chunk: string) => void,
  mode?: string,
  onPhonetics?: (phonetics: WordPhonetics | null) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = window.api.translate.start(text, to, mode)

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

    function cleanup() {
      removePhonetics()
      removeChunk()
      removeDone()
      removeError()
    }
  })
}

export function abortTranslate(id: string) {
  window.api.translate.abort(id)
}

export interface WordPhonetics {
  uk: string | null
  us: string | null
  estimated?: boolean
}

export function isSingleEnglishWord(text: string): boolean {
  return /^[a-z]+(?:['’-][a-z]+)*$/i.test(text.trim()) && text.trim().length <= 64
}

export function parsePhonetics(value: unknown): WordPhonetics | null {
  if (!value || typeof value !== 'object') return { uk: null, us: null }
  const data = value as Record<string, unknown>
  const ipa = (v: unknown): string | null => {
    if (typeof v !== 'string') return null
    const text = v.trim()
    return /^\/[^/\r\n]{1,100}\/$/u.test(text) ? text : null
  }
  const uk = ipa(data.uk)
  const us = ipa(data.us)
  return data.estimated === true ? { uk, us, estimated: true } : { uk, us }
}

export type LanguageCode = 'en' | 'ja' | 'zh'

export type DetectedLang = 'zh' | 'ja' | 'en'

const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g
const HIRAGANA_RANGE = /[\u3040-\u309f]/g
const KATAKANA_RANGE = /[\u30a0-\u30ff]/g

export function detectLang(text: string): DetectedLang {
  const len = text.length
  if (len === 0) return 'en'

  const hiraganaCount = (text.match(HIRAGANA_RANGE) || []).length
  const katakanaCount = (text.match(KATAKANA_RANGE) || []).length
  const kanaCount = hiraganaCount + katakanaCount

  if (kanaCount / len > 0.05) return 'ja'

  const cjkCount = (text.match(CJK_RANGE) || []).length
  if (cjkCount / len > 0.1) return 'zh'

  return 'en'
}

export function resolveTargetLang(inputLang: LanguageCode, preferred: LanguageCode, fallback: LanguageCode): LanguageCode {
  if (inputLang === preferred) return fallback
  return preferred
}

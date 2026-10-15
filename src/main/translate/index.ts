import Store from 'electron-store'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { createHash } from 'node:crypto'
import { isSingleEnglishWord } from '../../shared/phonetics'
import { createTranslationEngine } from './session'
import { readCompletion } from './streaming'
import type { PreparedRequest, TranslateMode, TranslateOptions } from './types'

export type { TranslateMode, TranslateOptions } from './types'

const store = new Store()

export const defaultTranslatePrompt = [
  'You are a professional translator.',
  'Translate the given text to {{toName}}.',
  '',
  'Rules:',
  '- Provide a formal, literal translation based on the context of the sentence.',
  '- Preserve all markdown symbols and line breaks from the original text.',
  '',
  'You must respond with a JSON object:',
  '{"result": "translated text"}',
  '',
  'Example:',
  `{"text": "{{greetingFrom}}"} → {"result": "{{greetingTo}}"}`,
  '',
  'Do not include any text outside the JSON.',
].join('\n')

export const defaultPolishPrompt = [
  'You are a professional text polishing expert. Refine and optimize the user\'s input to make it more fluent, accurate, and natural while preserving the original meaning.',
  '',
  'Rules:',
  '- Preserve all markdown symbols and line breaks from the original text.',
  '- Keep the original language unchanged.',
  '- Output only the polished result.',
  '',
  'You must respond with a JSON object:',
  '{"result": "polished text"}',
  '',
  'Do not include any text outside the JSON.',
].join('\n')

export const defaultExplainPrompt = [
  'You are a professional text explanation assistant. Provide a detailed explanation of the user\'s input to help them understand its meaning, context, and key points.',
  '',
  'Rules:',
  '- Explanations should be clear and easy to understand.',
  '- Preserve all markdown symbols and line breaks from the original text.',
  '',
  'You must respond with a JSON object:',
  '{"result": "explanation content"}',
  '',
  'Do not include any text outside the JSON.',
].join('\n')

const languageNames: Record<string, string> = {
  en: 'English',
  ja: 'Japanese',
  zh: 'Chinese',
}

const greetings: Record<string, string> = {
  en: 'Hello',
  ja: 'こんにちは',
  zh: '你好',
}

function getGreetingForLang(code: string): string {
  for (const [lang, greeting] of Object.entries(greetings)) {
    if (lang !== code) return greeting
  }
  return 'Hello'
}

function buildEndpoint(baseURL: string): string {
  let url = baseURL.replace(/\/+$/, '')
  if (!url.endsWith('/chat/completions')) {
    url += '/chat/completions'
  }
  return url
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}

function buildSystemPrompt(mode: TranslateMode, to: string): string {
  if (mode === 'polish') {
    return (store.get('polishPrompt') as string) || defaultPolishPrompt
  }
  if (mode === 'explain') {
    return (store.get('explainPrompt') as string) || defaultExplainPrompt
  }
  const template = (store.get('translatePrompt') as string) || defaultTranslatePrompt
  return renderTemplate(template, {
    to,
    toName: languageNames[to] || to,
    greetingFrom: getGreetingForLang(to),
    greetingTo: greetings[to] || '',
  })
}

function appendRequestLog(entry: object): void {
  const logDir = path.join(os.homedir(), '.translite', 'ai-requests')
  const now = new Date()
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const logFile = path.join(logDir, `${dateStr}.jsonl`)
  // Logging must neither delay completion nor turn a successful translation into an error.
  try {
    const line = JSON.stringify(entry) + '\n'
    void fs.promises.mkdir(logDir, { recursive: true })
      .then(() => fs.promises.appendFile(logFile, line))
      .catch(() => {})
  } catch { /* Optional diagnostics may be unavailable. */ }
}

function prepareRequest({ text, to, mode = 'translate' }: TranslateOptions): PreparedRequest {
  const apiKey = store.get('apiKey', '') as string
  if (!apiKey) {
    throw new Error('API Key not configured')
  }

  const baseURL = store.get('apiBaseURL', '') as string
  if (!baseURL) {
    throw new Error('API Base URL not configured')
  }

  const model = store.get('apiModel', '') as string
  if (!model) {
    throw new Error('API Model not configured')
  }

  const withPhonetics = mode === 'translate' && isSingleEnglishWord(text)
  const systemContent = buildSystemPrompt(mode, to) + (withPhonetics ? [
    '', '', 'Additional single English word pronunciation metadata:',
    'Keep the translated text in the existing "result" field. Add a separate "phonetics" object with "uk" and "us" fields.',
    'Use standard British English and General American IPA respectively, enclosed in /slashes/.',
    'Use a common pronunciation consistent with the translated meaning. Never put IPA inside "result".',
    'Include English-language proper names, software names and brands, not just dictionary words.',
    'For a name without an established pronunciation, provide a plausible English spelling-based IPA reading and set phonetics.estimated to true. This will be labeled as a non-official reading suggestion, never as an authoritative pronunciation.',
    'For established pronunciations set estimated to false. If no reasonable reading can be given, return null for that field. Do not claim an official UK/US distinction when none is known.',
    'JSON shape: {"result":"translated text","phonetics":{"uk":"/IPA/","us":"/IPA/","estimated":false}}',
  ].join('\n') : '')
  const userContent = mode === 'translate'
    ? JSON.stringify({ text, target: languageNames[to] || to })
    : JSON.stringify({ text })
  const endpoint = buildEndpoint(baseURL)

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
    stream: true,
    enable_thinking: false,
    thinking: { type: 'disabled' },
    response_format: { type: 'json_object' },
  }

  // Include credentials in the digest (never in logs or the cache key itself),
  // so changing accounts, providers, models or prompts cannot reuse old results.
  const key = createHash('sha256').update(JSON.stringify({ endpoint, apiKey, mode, to, requestBody })).digest('hex')
  return { key, endpoint, apiKey, body: requestBody, withPhonetics }
}

const engine = createTranslationEngine({
  prepare: prepareRequest,
  execute: async (request, callbacks) => {
    const started = performance.now()
    const result = await readCompletion(request, callbacks)
    appendRequestLog({ timestamp: new Date().toISOString(), url: request.endpoint,
      request: request.body, response: result.raw, usage: result.usage || null,
      durationMs: Math.round(performance.now() - started) })
    return { text: result.text, phonetics: result.phonetics }
  },
})

export const translate = engine.translate
export const clearTranslationCache = engine.clearCache

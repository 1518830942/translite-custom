import Store from 'electron-store'
import os from 'os'
import fs from 'fs'
import path from 'path'

export type TranslateMode = 'translate' | 'polish' | 'explain'

export interface TranslateOptions {
  text: string
  to: string
  mode?: TranslateMode
  signal?: AbortSignal
  onChunk: (chunk: string) => void
}

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
  fs.mkdirSync(logDir, { recursive: true })
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n')
}

export async function translate({ text, to, mode = 'translate', signal, onChunk }: TranslateOptions): Promise<void> {
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

  const systemContent = buildSystemPrompt(mode, to)
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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
    signal,
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`API error: ${response.status} ${errText}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let sseBuffer = ''
  let fullContent = ''
  let usage: Record<string, unknown> | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    sseBuffer += decoder.decode(value, { stream: true })
    const lines = sseBuffer.split('\n')
    sseBuffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') continue

      try {
        const json = JSON.parse(data)
        const content = json.choices?.[0]?.delta?.content
        if (content) {
          fullContent += content
        }
        if (json.usage) {
          usage = json.usage as Record<string, unknown>
        }
      } catch {
        // skip malformed JSON
      }
    }
  }

  let resultText: string
  try {
    const parsed = JSON.parse(fullContent)
    resultText = parsed.result || ''
    onChunk(resultText)
  } catch {
    resultText = fullContent
    onChunk(fullContent)
  }

  appendRequestLog({
    timestamp: new Date().toISOString(),
    url: endpoint,
    request: requestBody,
    response: fullContent,
    usage: usage || null,
  })
}

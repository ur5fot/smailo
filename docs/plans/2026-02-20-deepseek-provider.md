# DeepSeek API Provider Support

## Overview
Добавить поддержку DeepSeek API как альтернативу Anthropic Claude.
Провайдер выбирается через переменную окружения `AI_PROVIDER=anthropic|deepseek`.
DeepSeek совместим с OpenAI API, поэтому используем пакет `openai` с кастомным `baseURL`.

## Context (from discovery)
- Files/components involved:
  - `server/src/services/claude.ts` — текущий AI сервис (переименуем в `aiService.ts`)
  - `server/src/routes/chat.ts` — импортирует `chatWithClaude` (строка ~64)
  - `server/src/routes/app.ts` — импортирует `chatWithClaude` (строка ~175)
  - `server/.env.example` — добавить новые переменные
  - `server/package.json` — добавить `openai` пакет
- Related patterns found: единая функция `chatWithClaude(messages, phase)`, JSON парсинг ответа одинаков для обоих провайдеров
- Dependencies identified: `@anthropic-ai/sdk` (уже есть), `openai` (нужно добавить)

## Development Approach
- **Testing approach**: Minimal viable — без тестов
- Переименовываем файл, не ломаем существующие импорты (обновим в роутах)
- Общий JSON парсинг и системные промпты остаются без изменений

## What Goes Where
- **Implementation Steps**: всё делается в этом репо
- **Post-Completion**: ручная проверка обоих провайдеров

## Implementation Steps

### Task 1: Установить openai пакет
- [x] добавить `openai` в `server/package.json` dependencies (^4.x)
- [x] запустить `npm install` в папке server

### Task 2: Создать unified aiService.ts
- [x] создать `server/src/services/aiService.ts`
- [x] перенести все типы из `claude.ts`: `ClaudePhase`, `ClaudeResponse`, `AppConfig`, `CronJobConfig`, `UiComponent`, `ChatMessage`
- [x] перенести системные промпты `BRAINSTORM_SYSTEM_PROMPT` и `IN_APP_SYSTEM_PROMPT`
- [x] перенести функцию парсинга JSON ответа (strip markdown fences + validate fields)
- [x] добавить Anthropic-провайдер: инициализация `Anthropic` клиента, вызов `messages.create`, извлечение `response.content[0].text`
- [x] добавить DeepSeek-провайдер: инициализация `OpenAI` клиента с `baseURL: 'https://api.deepseek.com'` и `apiKey: process.env.DEEPSEEK_API_KEY`, вызов `chat.completions.create`, извлечение `response.choices[0].message.content`
- [x] экспортировать `chatWithAI(messages, phase)` — выбирает провайдер по `process.env.AI_PROVIDER` (default: `'anthropic'`)
- [x] экспортировать `chatWithClaude` как алиас `chatWithAI` для обратной совместимости

### Task 3: Обновить импорты в роутах
- [x] в `server/src/routes/chat.ts` — заменить импорт `chatWithClaude` из `./claude` на `./aiService`
- [x] в `server/src/routes/app.ts` — заменить импорт `chatWithClaude` из `./claude` на `./aiService`

### Task 4: Обновить конфигурацию окружения
- [ ] в `.env.example` добавить:
  ```
  AI_PROVIDER=anthropic
  DEEPSEEK_API_KEY=your_deepseek_key_here
  DEEPSEEK_MODEL=deepseek-chat
  ```
- [ ] в `README.md` добавить строки в таблицу Environment Variables: `AI_PROVIDER`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`

### Task 5: Verify
- [ ] убедиться что сервер стартует без ошибок (`npm run dev` в server)
- [ ] проверить что при `AI_PROVIDER=anthropic` работает как раньше
- [ ] проверить что при `AI_PROVIDER=deepseek` вызывается DeepSeek API

## Technical Details

**Anthropic вызов:**
```typescript
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 2048,
  system: systemPrompt,
  messages: messages.map(m => ({ role: m.role, content: m.content }))
})
const text = (response.content[0] as { text: string }).text
```

**DeepSeek вызов:**
```typescript
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY
})
const response = await openai.chat.completions.create({
  model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
  max_tokens: 2048,
  messages: [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
  ]
})
const text = response.choices[0].message.content ?? ''
```

**Выбор провайдера:**
```typescript
export async function chatWithAI(messages: ChatMessage[], phase: ClaudePhase): Promise<ClaudeResponse> {
  const provider = process.env.AI_PROVIDER ?? 'anthropic'
  const rawText = provider === 'deepseek'
    ? await callDeepSeek(messages, phase)
    : await callAnthropic(messages, phase)
  return parseResponse(rawText)
}
```

## Post-Completion
**Ручная проверка DeepSeek:**
- Получить API ключ на platform.deepseek.com
- Добавить в `.env`: `AI_PROVIDER=deepseek`, `DEEPSEEK_API_KEY=sk-...`
- Запустить `npm run dev`, открыть http://localhost:5173
- Написать сообщение Smailo — убедиться что ответ приходит от DeepSeek

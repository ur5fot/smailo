# Этап 5: Многостраничность и навигация

## Overview

Добавляем поддержку многостраничных приложений. В конфиге приложения появляется
опциональный массив `pages`. Если он присутствует — над контентом отображаются
вкладки (PrimeVue Tabs), URL отражает активную страницу (`/:userId/:hash/:pageId`).
Приложения без `pages` работают без изменений (обратная совместимость).

Ключевая граница: Stage 5 реализует только навигацию по страницам, созданным AI.
Редактор страниц через UI — это Stage 7.

## Context

- Config хранится в `apps.config` (JSON) в SQLite — изменений схемы БД не требуется
- `uiComponents` верхнего уровня остаются для совместимости (одностраничные приложения)
- `computedValues` от сервера используют глобальные индексы (flatMap всех страниц);
  клиент пересчитывает в локальные индексы текущей страницы
- Валидация компонентов: `server/src/services/aiService.ts` → `validateUiComponents()`
- AI-ответ расширяется полем `pagesUpdate?: Page[]` (заменяет весь массив `pages`)

## Development Approach

- **Testing approach**: Regular (код первым, потом тесты)
- Завершать каждый таск полностью перед переходом к следующему
- Все тесты должны проходить перед началом следующего таска
- Обновлять чекбоксы сразу при завершении

## Implementation Steps

### Task 1: Добавить тип Page и серверную валидацию

- [x] добавить интерфейс `Page` в `server/src/services/aiService.ts`:
  `{ id: string; title: string; icon?: string; uiComponents: UiComponent[] }`
- [x] добавить `pages?: Page[]` в тип `AppConfig`
- [x] добавить `pagesUpdate?: Page[]` в тип `ClaudeResponse`
- [x] добавить `validatePages(items: unknown[]): Page[]` в `server/src/services/aiService.ts`:
  - max 10 страниц на приложение
  - id: `/^[a-zA-Z0-9_-]{1,50}$/`, уникальные
  - title: непустой, max 100 символов
  - icon: опционально, строка, max 50 символов
  - uiComponents каждой страницы — через существующий `validateUiComponents()` (max 20)
- [x] написать тесты для `validatePages` (valid, too many pages, invalid id, duplicate id,
  empty title, backward compat без pages)
- [x] запустить тесты — должны проходить

### Task 2: Обновить обработку uiUpdate/pagesUpdate в chat endpoint

- [x] прочитать `server/src/routes/app.ts` — найти место применения `uiUpdate`
- [x] при наличии `pagesUpdate` в ответе AI: валидировать через `validatePages()`,
  сохранить `config.pages = pagesUpdate` в БД (остальные поля config не трогать)
- [x] при наличии `uiUpdate` (без `pagesUpdate`) — поведение не меняется (backward compat)
- [x] добавить утилиту `getGlobalComponents(config: AppConfig): UiComponent[]`:
  если `config.pages` есть → `pages.flatMap(p => p.uiComponents)`;
  иначе → `config.uiComponents`
- [x] обновить вызов `evaluateComputedValues` в `GET /api/app/:hash/data` и
  `GET /api/app/:hash` для использования `getGlobalComponents()`
- [x] написать тесты для pagesUpdate handling и getGlobalComponents
- [x] запустить тесты — должны проходить

### Task 3: Обновить AI system prompts

- [x] обновить `BRAINSTORM_SYSTEM_PROMPT` в `server/src/services/aiService.ts`:
  - добавить секцию о `pages` (когда использовать, структура, ограничения)
  - пример конфига многостраничного приложения
- [x] обновить `IN_APP_SYSTEM_PROMPT`:
  - добавить описание `pagesUpdate` как способа изменить многостраничное приложение
  - `uiUpdate` по-прежнему работает для одностраничных приложений
- [x] обновить или добавить тесты промптов (проверить наличие ключевых слов pages/pagesUpdate)
- [x] запустить тесты — должны проходить

### Task 4: Vue Router — маршрут с pageId

- [x] прочитать `client/src/router/index.ts`
- [x] добавить маршрут `/:userId/:hash/:pageId` → AppView, расположить после `/:userId/:hash`
- [x] убедиться, что legacy маршрут `/app/:hash` не затронут
- [x] запустить клиентские тесты — должны проходить

### Task 5: AppView — вкладки и страничная навигация

- [x] прочитать `client/src/views/AppView.vue` и `client/src/stores/app.ts` полностью
- [x] в `app.ts` store: добавить геттер `pages` из `appConfig?.pages`
- [x] в `AppView.vue`:
  - добавить `currentPageId` из `route.params.pageId`
  - computed `currentPage`: найти страницу по id или взять первую
  - computed `currentComponents`: `currentPage?.uiComponents ?? appConfig?.uiComponents ?? []`
  - если `pages` есть и нет `pageId` → `router.replace({ params: { pageId: pages[0].id } })`
  - рендерить PrimeVue Tabs над AppRenderer когда `pages` присутствует
  - при смене таба → `router.push({ name: 'app', params: { userId, hash, pageId } })`
  - передавать `currentComponents` в AppRenderer вместо `appConfig?.uiComponents`
- [x] computed `localComputedValues`: пересчитать глобальные индексы в локальные
  (offset = sum of uiComponents.length for pages before current)
- [x] передавать `localComputedValues` в AppRenderer
- [x] backward compat: если `pages` нет — всё работает как раньше
- [x] написать тесты для store (pages геттер) и router
- [x] запустить тесты — должны проходить

### Task 6: Verify acceptance criteria

- [x] одностраничное приложение (без `pages`) работает без изменений
- [x] многостраничное приложение: вкладки отображаются, URL меняется при переходе
- [x] прямая ссылка на `/:userId/:hash/:pageId` открывает нужную страницу
- [x] несуществующий `pageId` в URL → редирект на первую страницу
- [x] `computedValue` компоненты работают корректно на всех страницах
- [x] запустить `npm test --workspace=server` — все тесты проходят
- [x] запустить `npm test --workspace=client` — все тесты проходят

### Task 7: Обновить документацию

- [x] обновить `README.md`: добавить описание многостраничности в секцию App config
- [x] обновить `README.ru.md`: то же самое на русском
- [x] обновить `CLAUDE.md` если описание uiComponents устарело (поле pages в конфиге)

*Note: ralphex automatically moves completed plans to `docs/plans/completed/`*

## Technical Details

### Структура Page

```typescript
interface Page {
  id: string         // URL-safe: /^[a-zA-Z0-9_-]{1,50}$/
  title: string      // Текст вкладки, max 100 символов
  icon?: string      // Опционально, PrimeVue icon name
  uiComponents: UiComponent[]  // max 20 компонентов на страницу
}
```

### Расширение AppConfig

```typescript
interface AppConfig {
  appName: string
  description: string
  uiComponents: UiComponent[]  // Сохраняется для backward compat (одностраничные)
  pages?: Page[]               // Если присутствует — многостраничный режим
  // ...остальные поля без изменений
}
```

### Расширение ClaudeResponse

```typescript
interface ClaudeResponse {
  // ...существующие поля
  uiUpdate?: UiComponent[]  // Для одностраничных (без изменений)
  pagesUpdate?: Page[]      // Для многостраничных: заменяет весь config.pages
}
```

### Маршруты после изменений

```
/                          → HomeView
/:userId                   → UserView
/:userId/:hash             → AppView (первая страница, redirect если pages)
/:userId/:hash/:pageId     → AppView (конкретная страница)
/app/:hash                 → AppView (legacy, без pageId)
```

### computedValues — глобальные индексы

```
pages: [
  { id: "main",    uiComponents: [C0, C1, C2] },   // глобальные индексы 0,1,2
  { id: "reports", uiComponents: [C0, C1] },         // глобальные индексы 3,4
]

getGlobalComponents(config) → [C0, C1, C2, C0, C1]
evaluateComputedValues → { 0: v0, 2: v2, 4: v4 }

На странице "reports" (offset=3):
localComputedValues = { 0: computedValues[3], 1: computedValues[4] }
```

## Post-Completion

**Ручная проверка:**
- Создать тестовое многостраничное приложение через чат и убедиться, что AI корректно генерирует `pages`
- Проверить переходы между страницами в браузере
- Проверить bookmark URL конкретной страницы и открытие по прямой ссылке

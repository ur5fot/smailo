# User System, UX Overhaul & PrimeVue Components

## Overview

Большой рефакторинг трёх направлений:
1. **Система пользователей** — анонимные пользователи с генерируемым ID, личная страница со списком приложений
2. **Новый layout** — домашняя страница-лендинг, страница пользователя с AI-ассистентом, двухколоночный layout приложения
3. **Расширение компонентов** — добавить оставшиеся PrimeVue компоненты + UX-практики в AI промпт + нумерация вариантов

## Маршруты после изменений

```
/                   → HomeView       (минимальный лендинг: создать/войти)
/:userId            → UserView       (список приложений + AI чат для создания)
/:userId/:hash      → AppView        (приложение слева, AI ассистент справа)
/app/:hash          → redirect → /:userId/:hash (обратная совместимость — если userId не известен, открывать без userId)
```

## Context

- **DB**: нет таблицы users — нужно добавить; apps нужен userId FK
- **Client**: 2 вью (HomeView, AppView), 2 стора (chat.ts, app.ts), роутер с 2 маршрутами
- **Server**: `/api/chat` (домашний чат), `/api/app/*` (приложения)
- **Текущий AppView**: всё в одну колонку — AppRenderer сверху, чат снизу
- **Smailo.vue**: поддерживает 5 настроений через GSAP, размер через props

## Development Approach

- **Testing approach**: Regular (code first)
- Нет тестов в проекте — не добавлять
- Сохранять обратную совместимость: старые URL `/app/:hash` должны работать
- Данные существующих приложений не трогать

## Progress Tracking

- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document blockers with ⚠️ prefix

---

## Implementation Steps

### Task 1: DB — таблица users + userId в apps

- [x] В `server/src/db/schema.ts` добавить таблицу `users` (id PK, userId text unique, createdAt)
- [x] Добавить поле `userId` (text, nullable) в таблицу `apps`
- [x] Запустить `npm run db:push` для применения миграции
- [x] Проверить что существующие apps (userId = null) доступны как прежде

### Task 2: Серверные эндпоинты для пользователей

- [x] Создать `server/src/routes/users.ts` с Router
- [x] `POST /api/users` — генерировать userId (nanoid 10 символов, alphanumeric), вставить в users, вернуть `{ userId }`
- [x] `GET /api/users/:userId` — вернуть `{ userId, createdAt }` или 404
- [x] `GET /api/users/:userId/apps` — вернуть список приложений пользователя `[{ hash, appName, description, createdAt, lastVisit }]`
- [x] Зарегистрировать `usersRouter` в `server/src/index.ts` под `/api/users`

### Task 3: Привязка приложений к пользователю

- [ ] В `server/src/routes/chat.ts`: при создании приложения (фаза `created`) читать `userId` из тела запроса и сохранять в apps.userId
- [ ] `GET /api/app/:hash` — включать `userId` в ответ (клиенту нужно знать для построения URL)
- [ ] Обновить `BRAINSTORM_SYSTEM_PROMPT` — убрать из него создание сессий, т.к. теперь userId приходит снаружи (сессия в чате остаётся sessionId, а userId — отдельный параметр)

### Task 4: Новая домашняя страница (лендинг)

- [ ] Переписать `client/src/views/HomeView.vue`:
  - По центру: Smailo (200px, mood='idle') + заголовок "Smailo"
  - Кнопка "Создать нового пользователя" → POST /api/users → redirect `/:userId`
  - Разделитель "или"
  - Поле InputText "Введите ID пользователя" + кнопка "Перейти" → redirect `/:userId`
  - Если userId не найден (GET /api/users/:userId вернул 404) — показать ошибку
- [ ] Убрать весь старый чат-интерфейс из HomeView (он переедет в UserView)
- [ ] Хранить userId в localStorage `smailo_user_id` — если уже есть, предзаполнить поле или сразу редиректить

### Task 5: UserView — страница пользователя

- [ ] Создать `client/src/views/UserView.vue`
- [ ] **Layout**: два столбца — левый (список приложений), правый (AI ассистент)
  - Левый (ширина ~55%): заголовок "Мои приложения", список карточек приложений (appName, description, ссылка на `/:userId/:hash`), кнопка "Создать приложение" которая активирует чат справа
  - Правый (ширина ~45%): Smailo + чат для создания приложений (весь текущий HomeView чат-интерфейс)
  - На мобильных — одна колонка (список сверху, чат снизу)
- [ ] Перенести логику чата из HomeView в UserView (использовать существующий `chatStore`)
- [ ] При создании приложения (фаза `created`) — передавать `userId` в POST /api/chat, redirect на `/:userId/:hash`
- [ ] Создать `client/src/stores/user.ts` — state: `{ userId, apps[] }`, methods: `fetchApps(userId)`, `createUser()`
- [ ] Добавить маршрут `/:userId` → `UserView` в `client/src/router/index.ts`

### Task 6: Обновить AppView — двухколоночный layout

- [ ] Обновить `client/src/views/AppView.vue`:
  - **Layout**: два столбца side-by-side
  - Левый (~60%): заголовок (appName) + AppRenderer + данные — без чата
  - Правый (~40%): Smailo + in-app чат (редактирование приложения)
  - На мобильных: левый сверху, правый снизу (collapsible)
- [ ] InputBar перенести в правую колонку
- [ ] Smailo отображается в верхней части правой колонки, показывает что делает
- [ ] Обновить маршруты: добавить `/:userId/:hash` → AppView; старый `/app/:hash` оставить как redirect или direct access (userId = null)

### Task 7: Обновить роутер

- [ ] `client/src/router/index.ts`:
  - `'/'` → `HomeView`
  - `'/:userId'` → `UserView` (lazy)
  - `'/:userId/:hash'` → `AppView` (lazy)
  - `'/app/:hash'` → `AppView` (обратная совместимость, userId = null)
- [ ] В `AppView.vue` читать `userId` из `route.params` (если есть — используем для ссылок назад, если нет — работаем как раньше)
- [ ] В `UserView.vue` читать `userId` из `route.params`

### Task 8: Добавить PrimeVue компоненты в AppRenderer

Добавить в `client/src/components/AppRenderer.vue` + `componentMap` + валидацию на сервере:

- [ ] `Accordion` — сворачиваемые секции (нужен wrapper `AppAccordion.vue` т.к. использует слоты; принимает `value` массив `[{ header, content }]`)
- [ ] `Panel` — панель с заголовком (wrapper `AppPanel.vue`; принимает `header` prop + `value` dataKey для содержимого)
- [ ] `Chip` — метка/тег (простой компонент, prop `label`)
- [ ] `Badge` — бейдж с числом (prop `value`, `severity`)
- [ ] `Slider` — ползунок (read-only display; prop `value` от dataKey, `min`, `max`)
- [ ] `Rating` — звёздная оценка (read-only; prop `value` от dataKey, `stars`)
- [ ] `Tabs` — вкладки (wrapper `AppTabs.vue`; принимает `tabs: [{label, dataKey}]` — каждая вкладка показывает данные по dataKey)
- [ ] `Image` — изображение (prop `src` от dataKey или props, `width`, `alt`)
- [ ] `MeterGroup` — прогресс с несколькими секциями (prop `value` массив `[{label, value, color}]`)
- [ ] Обновить whitelist компонентов в `server/src/services/aiService.ts` (validateUiComponents)
- [ ] Обновить `CLAUDE.md` — список разрешённых компонентов

### Task 9: Обновить AI промпты

- [ ] **UX best practices** в `BRAINSTORM_SYSTEM_PROMPT`:
  ```
  UX RULES (always follow when designing apps):
  - Use the user's language for all labels, titles, button text
  - Every app must have at least 1 display component (Card/Chart/DataTable/Tag) to show data
  - Group related components logically (input → display, button → result card)
  - Max 8-10 components total — keep apps focused and uncluttered
  - Button labels must be action-oriented: "Сохранить вес", "Обновить курс" (not "Click here")
  - Use Card for single values, DataTable for lists/history, Chart for trends over time
  - Use Tag for status labels, ProgressBar/Knob for percentages/dials, Rating for scores
  - Use Accordion to group related but less-important info (hide clutter)
  - Always show a "last updated" Card or Tag using {outputKey}_updated_at when fetch_url is used
  ```
- [ ] **Numbered options** в `BRAINSTORM_SYSTEM_PROMPT` и `IN_APP_SYSTEM_PROMPT`:
  ```
  NUMBERED OPTIONS: When presenting multiple choices or asking the user to pick between options,
  ALWAYS number them: "1. Option A\n2. Option B\n3. Option C"
  If the user replies with just a number (e.g. "2"), treat it as selecting that option.
  ```
- [ ] Добавить описание новых компонентов (Accordion, Panel, Tabs, Image, Chip, Badge, Slider, Rating, MeterGroup) в систем промпт

### Task 10: Нумерация вариантов на фронте

- [ ] В `InputBar.vue` добавить быстрые кнопки-числа (1, 2, 3) которые появляются под полем ввода когда последнее сообщение ассистента содержит нумерованный список (`/^\d+\./m`)
- [ ] При нажатии кнопки-цифры — вставлять число в поле ввода и сразу отправлять
- [ ] Работает и в UserView (создание) и в AppView (редактирование)

### Task 11: Обновить CLAUDE.md и READMEs

- [ ] Обновить `CLAUDE.md` — новые маршруты, структура views, users таблица, новые компоненты
- [ ] Обновить `README.md` (EN) — новая архитектура пользователей
- [ ] Обновить `README.ru.md` (RU) — то же самое

---

## Technical Details

### Схема users
```typescript
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().unique(),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});
```

### userId формат
nanoid(10) — 10 символов A-Za-z0-9, например `V1StGXR8_Z`
Хранится в localStorage как `smailo_user_id`

### Новые PrimeVue компоненты — правила AI
```
- Accordion: { "component": "Accordion", "props": { "tabs": [{"header": "Заголовок", "dataKey": "key"}] } }
- Panel: { "component": "Panel", "props": { "header": "Заголовок" }, "dataKey": "key" }
- Chip: { "component": "Chip", "props": { "label": "Статус" } } или dataKey
- Tabs: { "component": "Tabs", "props": { "tabs": [{"label": "Данные", "dataKey": "key"}] } }
- Image: { "component": "Image", "props": { "width": "200", "alt": "Изображение" }, "dataKey": "image_url" }
- Slider: { "component": "Slider", "props": { "min": 0, "max": 100 }, "dataKey": "progress" }
- Rating: { "component": "Rating", "props": { "stars": 5 }, "dataKey": "score" }
- MeterGroup: { "component": "MeterGroup", "dataKey": "metrics" } // value = [{label,value,color}]
```

### Layout breakpoints
- Desktop (≥768px): двухколоночный layout (flex row)
- Mobile (<768px): одна колонка (flex column)
- Левая колонка: `flex: 3` (60%), правая: `flex: 2` (40%)

## Post-Completion

**Ручное тестирование:**
- Создать нового пользователя → проверить redirect на /:userId
- Ввести несуществующий userId → проверить сообщение об ошибке
- Создать приложение от имени пользователя → проверить что оно появляется в списке
- Открыть старый URL `/app/:hash` → должен работать
- Проверить на мобильном размере (< 768px)
- Проверить нумерованные варианты в чате (AI предлагает 3 варианта → появляются кнопки 1/2/3)
- Проверить каждый новый PrimeVue компонент через создание тестового приложения

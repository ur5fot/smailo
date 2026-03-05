# Мульти-пользовательский доступ (Этап 8)

## Overview
- Добавить систему ролей для приложений: `owner`, `editor`, `viewer`
- Приглашения пользователей по ссылке с выбором роли
- Row-level security (RLS): пользователь видит только свои строки в таблицах с включённым RLS (owner/editor видят всё)
- Унификация auth через глобальный JWT (заменяет X-User-Id header)
- Обратная совместимость: существующие приложения без app_members работают как раньше

## Context (from discovery)
- Текущая модель: один владелец (`apps.userId`), два механизма auth (JWT per-app для password + X-User-Id header для ownership)
- `requireAuthIfProtected` middleware: для protected → проверяет JWT `{ hash }`, для unprotected → сравнивает X-User-Id с `row.userId`
- Нет таблицы `app_members`, нет ролей, нет приглашений
- JWT сейчас per-app (`smailo_token_<hash>`) и не содержит userId
- `user_rows` не имеет `createdByUserId` — нельзя фильтровать по автору
- Axios interceptor отправляет оба: JWT + X-User-Id на каждый запрос
- Ключевые файлы: `server/src/middleware/auth.ts`, `server/src/routes/app.ts`, `server/src/routes/tables.ts`, `server/src/routes/users.ts`, `client/src/api/index.ts`, `client/src/stores/user.ts`, `client/src/stores/app.ts`

## Development Approach
- **Testing approach**: Regular (code first, tests after)
- Complete each task fully before moving to the next
- Make small, focused changes
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
- **CRITICAL: all tests must pass before starting next task**
- **CRITICAL: update this plan file when scope changes during implementation**
- Run tests after each change
- Maintain backward compatibility

## Testing Strategy
- **Unit tests**: required for every task (vitest)
- Server tests: `npm test --workspace=server`
- Client tests: `npm test --workspace=client`

## Progress Tracking
- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix
- Update plan if implementation deviates from original scope

## Permission Model

```
Role         | Read app | Read data | Write data | Chat              | Write rows | Config/cron | Members | Password
-------------|----------|-----------|------------|-------------------|------------|-------------|---------|--------
owner        | ✓        | ✓         | ✓          | ✓ (full)          | ✓          | ✓           | ✓       | ✓
editor       | ✓        | ✓         | ✓          | ✓ (no config chg) | ✓          | ✗           | ✗       | ✗
viewer       | ✓        | ✓         | ✗          | ✗                 | read-only* | ✗           | ✗       | ✗
anonymous    | unprotected only | unprotected only | ✗ | ✗           | ✗          | ✗           | ✗       | ✗

* viewer + RLS: видит только свои строки в таблицах с rlsEnabled=true
```

"Write data" = POST /api/app/:hash/data, POST /api/app/:hash/actions/fetch-url
"Chat" = POST /api/app/:hash/chat (editor может общаться, но uiUpdate/pagesUpdate от AI отклоняется сервером для non-owner)
"Config/cron" = PUT /api/app/:hash/config, set-password
"Members" = invite, change role, remove

## Implementation Steps

### Task 1: DB schema — таблица app_members + createdByUserId
- [x] Добавить таблицу `app_members` в `server/src/db/schema.ts`: `id` (PK), `appId` (FK → apps.id, cascade delete), `userId` (text), `role` (text: 'owner'|'editor'|'viewer'), `invitedAt` (text), `joinedAt` (text)
- [x] Добавить unique constraint: `(appId, userId)` — один пользователь = одна роль в приложении
- [x] Добавить колонку `createdByUserId` (text, nullable) в `user_rows` для RLS
- [x] Добавить колонку `rlsEnabled` (integer, default 0) в `user_tables` для включения RLS
- [x] Запустить `npm run db:push` для применения миграции
- [x] Написать тесты для схемы (вставка/чтение app_members, unique constraint, cascade delete)
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 2: Глобальный JWT — выдача при создании пользователя
- [x] Обновить `POST /api/users` в `users.ts`: после создания userId, генерировать JWT `{ userId }` (долгоживущий, 30 дней), вернуть `{ userId, token }`
- [x] ⚠️ НЕ создавать `GET /api/users/:userId/token` — это auth bypass (любой зная userId получит JWT). Восстановление: пользователь создаёт нового userId
- [x] Обновить клиентский `user.ts` store: после `createUser()` сохранять JWT в localStorage как `smailo_token`
- [x] Обновить клиентский `api/index.ts` interceptor: отправлять глобальный JWT из `smailo_token` (заменяет X-User-Id); для password-protected apps дополнительно отправлять per-app JWT из `smailo_token_<hash>`
- [x] Явно прекратить отправку `X-User-Id` header из interceptor — удалить полностью
- [x] Написать тесты для JWT генерации, валидации, interceptor логики
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 3a: Auth middleware — resolveUserAndRole + requireRole
- [ ] Создать новый middleware `resolveUserAndRole` в `server/src/middleware/auth.ts`:
  - Извлекает userId из глобального JWT (header `Authorization: Bearer <token>`)
  - Находит app row по hash
  - Ищет роль в `app_members` для данного userId+appId
  - Если нет роли → anonymous
  - Для password-protected apps: anonymous → 401 (нужен пароль или invite)
  - Для unprotected apps: anonymous → viewer-level read (GET только)
  - Аттачит на req: `app_row`, `userId`, `userRole` ('owner'|'editor'|'viewer'|'anonymous')
  - ⚠️ Игнорировать X-User-Id header полностью — только JWT
- [ ] Создать middleware `requireRole(...roles)` — проверяет `req.userRole`, возвращает 403 если роль недостаточна
- [ ] Обратная совместимость: если app не имеет ни одного app_members row, fallback → `apps.userId === req.userId` значит owner, остальные anonymous
- [ ] Написать тесты для resolveUserAndRole (all role combinations, anonymous, password-protected, legacy apps)
- [ ] Написать тесты для requireRole (allowed, denied, missing role)
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 3b: Применить новый auth ко всем routes
- [ ] Обновить все routes в `app.ts`: заменить `requireAuthIfProtected` на `resolveUserAndRole` + `requireRole(...)`:
  - GET /:hash, GET /:hash/data, GET /:hash/chat → viewer+ (anonymous OK для unprotected)
  - POST /:hash/data, POST /:hash/actions/fetch-url → `requireRole('editor', 'owner')`
  - POST /:hash/chat → `requireRole('editor', 'owner')` (⚠️ editor НЕ может менять конфиг — если AI возвращает uiUpdate/pagesUpdate, отклонять для editor)
  - PUT /:hash/config → `requireRole('owner')`
  - POST /:hash/set-password → `requireRole('owner')` (⚠️ требует JWT, не доступен без аутентификации)
- [ ] Обновить routes в `tables.ts`: GET → viewer+, POST/PUT/DELETE rows → editor+, POST/PUT/DELETE tables → owner
- [ ] Обновить существующие тесты в `app.ts` и `tables.ts` под новый middleware
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 3c: computedValue + RLS guard
- [ ] ⚠️ Серверные computedValue формулы (`evaluateComputedValues`) обходят RLS — формула может прочитать данные из таблиц, к которым viewer не имеет доступа
- [ ] Решение: передавать `userRole` и `userId` в `evaluateComputedValues`; для viewer с RLS-таблицей — фильтровать rows перед вычислением формул
- [ ] Написать тесты: viewer с computedValue на RLS-таблице видит только агрегат своих строк
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 4: Password-protected apps — интеграция с ролями
- [ ] Обновить `POST /:hash/verify` — при успешной верификации пароля: если пользователь (из JWT) не имеет роли в app_members, добавить как `viewer` (идемпотентно — повторный verify не дублирует)
- [ ] Обновить per-app JWT payload: `{ hash, userId }` — теперь содержит userId
- [ ] Обновить middleware: для password-protected apps, если есть per-app JWT с userId → искать роль в app_members
- [ ] Пользователи с ролью в app_members не требуют пароль (доступ по глобальному JWT)
- [ ] ⚠️ Смена пароля (`set-password`): ревокировать все per-app JWT — увеличить `passwordVersion` counter, проверять в middleware
- [ ] Написать тесты для verify + auto-add viewer, per-app JWT с userId, member bypass password, password change revocation
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 5: Auto-migration — создание owner записей
- [ ] При старте сервера: для всех apps с `userId IS NOT NULL` и без owner в app_members — создать owner запись
- [ ] При создании нового приложения (POST /api/chat, фаза created): автоматически добавлять owner запись в app_members
- [ ] Идемпотентность: повторный запуск миграции не создаёт дубликаты (INSERT OR IGNORE)
- [ ] Написать тесты для миграции (создание, идемпотентность, пропуск legacy apps без userId)
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 6: Invite system — отдельная таблица app_invites
- [ ] Создать таблицу `app_invites` в schema.ts: `id`, `appId` (FK), `role` ('editor'|'viewer'), `token` (32-char hex, unique), `createdAt`, `expiresAt` (7 дней), `acceptedByUserId` (nullable — заполняется при принятии)
- [ ] ⚠️ НЕ хранить invite на `app_members` — userId неизвестен при создании приглашения
- [ ] `POST /api/app/:hash/members/invite` (owner only): создать запись в `app_invites`, вернуть `{ token, inviteUrl }`
- [ ] `POST /api/app/:hash/members/invite/:token/accept` — принять приглашение (⚠️ POST не GET — state-mutating):
  - Проверить: токен существует, не истёк (`expiresAt > now`), не использован (`acceptedByUserId IS NULL`)
  - Записать `acceptedByUserId = req.userId`
  - Создать запись в `app_members` (или skip если userId уже member)
  - Вернуть `{ appHash, role }`
- [ ] Invite токен single-use: после accept, другие пользователи не могут использовать тот же токен
- [ ] Написать тесты: create invite, accept, expired token, reused token, already member
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 7a: Member management API (CRUD)
- [ ] Создать `server/src/routes/members.ts` — маршруты под `/api/app/:hash/members`
- [ ] `GET /api/app/:hash/members` — список участников (owner only), возвращает `[{ userId, role, joinedAt }]`
- [ ] `PUT /api/app/:hash/members/:userId` — изменить роль (owner only): `{ role }`. Нельзя изменить свою роль. Нельзя сделать другого owner
- [ ] `DELETE /api/app/:hash/members/:userId` — удалить участника (owner only). Нельзя удалить себя (owner)
- [ ] Rate limit: 30 req/min (chatLimiter)
- [ ] Написать тесты для каждого endpoint (success, auth, validation, edge cases)
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 7b: Row-level security — серверная фильтрация
- [ ] При создании строки (`POST /:tableId/rows`): записывать `createdByUserId` из `req.userId`
- [ ] При чтении (`GET /:tableId`): если `table.rlsEnabled` и `req.userRole === 'viewer'` → фильтровать rows по `createdByUserId === req.userId`
- [ ] Owner и editor видят все строки независимо от RLS
- [ ] Anonymous (unprotected apps) не видят строки в RLS-таблицах
- [ ] `PUT /api/app/:hash/tables/:tableId` — owner может включить/выключить RLS (`rlsEnabled` field)
- [ ] `DELETE /:tableId/rows/:rowId` — viewer может удалить только свою строку в RLS-таблице
- [ ] `PUT /:tableId/rows/:rowId` — viewer может обновить только свою строку в RLS-таблице
- [ ] Написать тесты для RLS фильтрации (owner sees all, viewer sees own, editor sees all, anonymous blocked)
- [ ] Написать тесты для RLS write restrictions (viewer can only edit/delete own rows)
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 8: GET /api/app/:hash — вернуть роль пользователя
- [ ] Обновить ответ `GET /api/app/:hash`: добавить поле `myRole: 'owner'|'editor'|'viewer'|null` на основе `req.userRole`
- [ ] Обновить ответ `GET /api/app/:hash`: добавить `members: [{ userId, role }]` (только для owner)
- [ ] Обновить `appStore.fetchApp()`: сохранять `myRole` в store
- [ ] Написать тесты для myRole в ответе (owner, editor, viewer, anonymous)
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 9: Client — UserView и список shared apps
- [ ] Обновить `GET /api/users/:userId/apps` — возвращать также приложения где пользователь = member (не только owner). Добавить поле `role` в ответе
- [ ] Обновить `user.ts` store: разделить на `myApps` (owner) и `sharedApps` (editor/viewer)
- [ ] Обновить `UserView.vue`: показать две секции — "Мои приложения" и "Общие со мной"
- [ ] Для shared apps: показать роль бейджем (editor/viewer)
- [ ] Написать тесты для store и endpoint
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 10: Client — AppView role-aware UI
- [ ] Скрыть кнопку редактора (pi-pencil) для viewer (нет доступа к config)
- [ ] Скрыть кнопку редактора для editor (нет доступа к config)
- [ ] InputBar/chat: disabled для viewer (нет доступа к POST /chat)
- [ ] AppButton, AppInputText, AppForm: disabled для viewer (нет записи данных)
- [ ] Показать бейдж роли в header (editor/viewer)
- [ ] Кнопка "Участники" в header для owner → открывает панель управления участниками
- [ ] Написать тесты для role-aware UI logic
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 11: Client — панель управления участниками
- [ ] Создать `client/src/components/MembersPanel.vue` — диалог/drawer для управления участниками
- [ ] Список текущих участников с ролями
- [ ] Кнопка "Пригласить" → генерирует invite ссылку с выбором роли (editor/viewer)
- [ ] Копирование ссылки в буфер
- [ ] Изменение роли участника (dropdown)
- [ ] Удаление участника (с подтверждением)
- [ ] Написать тесты для MembersPanel logic
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 12: Client — accept invite page
- [ ] Создать route `/invite/:hash/:token` → `InviteView.vue`
- [ ] При открытии: проверить что пользователь залогинен (имеет userId + JWT)
- [ ] Если нет userId — предложить создать аккаунт, затем accept
- [ ] Вызвать `POST /api/app/:hash/members/invite/:token/accept` для принятия
- [ ] После принятия: redirect на `/:userId/:hash`
- [ ] Ошибки: невалидный/истёкший/использованный токен, уже являешься участником
- [ ] Написать тесты для invite flow
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 13: Client — RLS UI в визуальном редакторе
- [ ] В PropertyEditor: для компонентов с dataSource, показать RLS статус таблицы
- [ ] В MembersPanel или отдельной настройке: toggle RLS для каждой таблицы (owner only)
- [ ] Визуальный индикатор в DataTable/CardList когда RLS активен (например, иконка замка)
- [ ] Написать тесты для RLS UI logic
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 14: Verify acceptance criteria
- [ ] Verify: owner может пригласить editor и viewer по ссылке
- [ ] Verify: editor может читать и писать данные, но не менять конфиг
- [ ] Verify: viewer может только читать (кнопки disabled, chat disabled)
- [ ] Verify: RLS работает — viewer видит только свои строки
- [ ] Verify: owner видит все строки независимо от RLS
- [ ] Verify: invite token: single-use, expires after 7 days
- [ ] Verify: обратная совместимость — старые приложения без members работают
- [ ] Verify: password-protected apps работают с новой auth моделью
- [ ] Verify: shared apps отображаются в UserView
- [ ] Run full test suite (server + client)

### Task 15: [Final] Update documentation
- [ ] Обновить `README.md` — описание мульти-пользовательского доступа
- [ ] Обновить `README.ru.md` — описание мульти-пользовательского доступа
- [ ] Обновить `CLAUDE.md` — добавить секции: app_members, app_invites, роли, RLS, auth, invite flow, новые endpoints
- [ ] Обновить `docs/roadmap-v2.md` — отметить Этап 8 как реализованный

## Technical Details

### app_members schema
```ts
export const appMembers = sqliteTable('app_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  appId: integer('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),        // 'owner' | 'editor' | 'viewer'
  joinedAt: text('joined_at').notNull(),
}, (table) => ({
  uniqueMember: unique().on(table.appId, table.userId),
}))
```

### app_invites schema (отдельная таблица — userId неизвестен при создании invite)
```ts
export const appInvites = sqliteTable('app_invites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  appId: integer('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),              // 'editor' | 'viewer'
  token: text('token').notNull().unique(),   // 32-char random hex
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),   // +7 days from creation
  acceptedByUserId: text('accepted_by_user_id'),  // null until accepted, then single-use
})
```

### user_rows — новая колонка
```ts
createdByUserId: text('created_by_user_id'),  // nullable for backward compat
```

### user_tables — новая колонка
```ts
rlsEnabled: integer('rls_enabled').default(0),  // 0=off, 1=on
```

### Глобальный JWT
```ts
// Payload
{ userId: string }

// Expiry: 30 days
// Storage: localStorage key 'smailo_token'
// Header: Authorization: Bearer <token>
```

### Per-app JWT (password-protected)
```ts
// Payload (extended)
{ hash: string, userId: string }

// Expiry: 7 days (unchanged)
// Storage: localStorage key 'smailo_token_<hash>'
// Header: X-App-Token: <token> (отдельный header чтобы не конфликтовать с глобальным)
```

### Auth middleware flow
```
Request → Extract global JWT → userId
       → Find app row by hash
       → Lookup app_members(appId, userId) → role
       → If no role + unprotected app → 'anonymous' (GET only)
       → If no role + protected app → check per-app JWT → if valid, 'viewer'
       → If no role + protected app + no JWT → 401
       → Attach: req.app_row, req.userId, req.userRole
```

### Новые API endpoints
```
GET    /api/app/:hash/members                     — list members (owner only)
POST   /api/app/:hash/members/invite              — create invite (owner only)
POST   /api/app/:hash/members/invite/:token/accept — accept invite (any authenticated user, POST не GET!)
PUT    /api/app/:hash/members/:userId              — change role (owner only)
DELETE /api/app/:hash/members/:userId              — remove member (owner only)
```

### Invite URL format
```
https://<domain>/invite/<hash>/<token>
```
Client route перехватывает URL и делает POST на accept endpoint.

### Новые client routes
```
/invite/:hash/:token  → InviteView.vue
```

## Post-Completion

**Manual verification:**
- Создать приложение → пригласить другого пользователя (другой браузер) → проверить роли
- Включить RLS на таблице → viewer видит только свои строки
- Password-protected app + member access: member заходит без пароля
- Старые приложения без members: работают как раньше
- Mobile: invite link работает на телефоне

**Security review:**
- Invite token не поддаётся brute-force (32 hex = 128 bits)
- Invite token single-use + 7-day expiry (отдельная таблица `app_invites`)
- Accept invite через POST (не GET) — нет CSRF через prefetch/img tags
- Owner не может удалить себя или сменить свою роль
- Viewer не может escalate до editor через API
- RLS фильтрация на сервере, не на клиенте
- computedValue формулы уважают RLS для viewer
- X-User-Id header полностью удалён — только JWT
- Editor не может менять конфиг через chat (uiUpdate/pagesUpdate отклоняется)
- set-password требует JWT (owner only)
- Смена пароля ревокирует все per-app JWT
- JWT секрет должен быть достаточно длинным (ENV: JWT_SECRET)

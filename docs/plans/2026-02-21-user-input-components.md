# User Input Components: Button, InputText, Form

## Overview

Add three interactive input components to Smailo apps: **Button**, **InputText**, and **Form**.
Each component uses a declarative `action` config in JSON to write data to `appData` — no arbitrary JS, no XSS vectors.
This unblocks use cases like mood trackers with "плохо / нормально / хорошо" buttons or weight-entry forms.

Currently all `appData` writes go through cron jobs or AI responses. After this change, users can trigger writes directly from the app UI.

## Context

- **Component whitelist** (2 server locations):
  - `server/src/routes/chat.ts:113` — app creation
  - `server/src/routes/app.ts:287` — in-app chat uiUpdate
- **AI system prompts** (both forbid Form/Input/Button): `server/src/services/aiService.ts:107,155`
- **AppRenderer** dynamic rendering: `client/src/components/AppRenderer.vue`
- **Wrapper component pattern**: `AppCard.vue`, `AppDataTable.vue`
- **Data write gap**: no `POST /api/app/:hash/data` endpoint exists
- **App store**: `client/src/stores/app.ts` — `fetchData(hash)` refreshes appData
- **App hash**: available via `route.params.hash` in `AppView.vue`, must be threaded into AppRenderer

## Development Approach

- **Testing approach**: Regular (code first)
- Complete each task fully before moving to the next
- No automated tests in this project — manual verification via running the app

## JSON Config Shape (agreed design)

```json
// Button
{
  "component": "Button",
  "props": { "label": "Хорошо", "severity": "success" },
  "action": { "key": "mood", "value": 3 }
}

// InputText — field + inline Save button
{
  "component": "InputText",
  "props": { "label": "Вес (кг)", "type": "number", "placeholder": "70" },
  "action": { "key": "weight" }
}

// Form — multiple fields + Submit button
{
  "component": "Form",
  "props": { "submitLabel": "Сохранить" },
  "fields": [
    { "name": "weight", "type": "number", "label": "Вес (кг)" },
    { "name": "note",   "type": "text",   "label": "Заметка" }
  ],
  "outputKey": "weight_entry"
}
```

## Implementation Steps

### Task 1: New API endpoint `POST /api/app/:hash/data`

- [x] Add route in `server/src/routes/app.ts` after the `GET /:hash/data` route
- [x] Apply `requireAuthIfProtected` middleware (same as other app routes)
- [x] Validate `key`: string, non-empty, max 100 chars, only `[a-zA-Z0-9_]` characters
- [x] Validate `value`: must be present; JSON-serialized size must not exceed 10 KB
- [x] Write to `appData` table via `db.insert(appData).values({ appId, key, value })`
- [x] Apply rate limit: reuse `chatLimiter` (30 req/min) or create a dedicated `dataLimiter`
- [x] Return `{ ok: true }` on success
- [x] Manual check: `curl -X POST .../api/app/:hash/data -d '{"key":"mood","value":3}'` returns 200

### Task 2: Extend `UiConfigItem` type in `AppRenderer.vue`

- [x] Add `action?: { key: string; value?: unknown }` to `UiConfigItem` interface
- [x] Add `fields?: Array<{ name: string; type: string; label: string }>` to `UiConfigItem`
- [x] Add `outputKey?: string` to `UiConfigItem`
- [x] Add `hash` prop to AppRenderer: `const props = defineProps<{ uiConfig, appData, hash: string }>()`

### Task 3: `AppButton.vue` wrapper component

- [x] Create `client/src/components/AppButton.vue`
- [x] Accept props: `label: string`, `severity?: string`, `action: { key: string; value: unknown }`, `hash: string`
- [x] On click: call `api.post('/app/' + hash + '/data', { key: action.key, value: action.value })`
- [x] Show loading state on the button while request is in flight
- [x] On success: emit `'data-written'` event so parent can refresh appData
- [x] On error: show brief error message (use PrimeVue `Toast` or inline text)
- [x] Manual check: Button renders, click writes to appData

### Task 4: `AppInputText.vue` wrapper component

- [x] Create `client/src/components/AppInputText.vue`
- [x] Accept props: `label?: string`, `type?: 'text' | 'number'`, `placeholder?: string`, `action: { key: string }`, `hash: string`
- [x] Render PrimeVue `InputText` (or `InputNumber` for type=number) + inline "Сохранить" button
- [x] On save: call `api.post('/app/' + hash + '/data', { key: action.key, value: inputValue })`
- [x] Clear the field after successful save
- [x] Emit `'data-written'` on success
- [x] Manual check: Enter value, click Save, verify appData updated

### Task 5: `AppForm.vue` wrapper component

- [x] Create `client/src/components/AppForm.vue`
- [x] Accept props: `fields: Array<{name,type,label}>`, `outputKey: string`, `submitLabel?: string`, `hash: string`
- [x] Render each field as PrimeVue `InputText` / `InputNumber` based on `type`
- [x] Show `submitLabel` button (default "Сохранить")
- [x] On submit: build object `{ field1: val1, field2: val2, timestamp: new Date().toISOString() }`, call `api.post('/app/' + hash + '/data', { key: outputKey, value: formObject })`
- [x] Clear all fields after successful submit
- [x] Emit `'data-written'` on success
- [x] Manual check: Fill form, submit, verify appData contains full object under outputKey

### Task 6: Register new components in `AppRenderer.vue`

- [x] Import `AppButton`, `AppInputText`, `AppForm` in `AppRenderer.vue`
- [x] Add `v-else-if` blocks before the generic `<component :is>` fallback (same pattern as AppCard/AppDataTable)
- [x] Pass `hash` and `action`/`fields`/`outputKey` from the item config to each wrapper
- [x] Listen for `'data-written'` event on all three components; on event emit `'data-written'` upward
- [x] Update `AppView.vue`: pass `hash` to `<AppRenderer>`; on `'data-written'` call `appStore.fetchData(hash)` to refresh

### Task 7: Update server-side component whitelists

- [ ] `server/src/routes/chat.ts:113` — add `'Button', 'InputText', 'Form'` to `ALLOWED_COMPONENTS`
- [ ] `server/src/routes/app.ts:287` — add `'Button', 'InputText', 'Form'` to `ALLOWED_COMPONENTS`
- [ ] In both places: extend the props validation to also accept `action`, `fields`, `outputKey` keys (or simply relax the check to allow any non-array object props, which is already the case)

### Task 8: Update AI system prompts

- [ ] `server/src/services/aiService.ts` — remove `Form, Input, Button` from the "NEVER use" line in `BRAINSTORM_SYSTEM_PROMPT` (line ~107)
- [ ] Remove `Form, Input, Button` from "NEVER use" in `IN_APP_SYSTEM_PROMPT` (line ~155)
- [ ] Add `Button` to COMPONENT GUIDE in `BRAINSTORM_SYSTEM_PROMPT` with example:
  ```
  - Button: use "label" prop. Use "action" with { key, value } to write on click.
    Example: { "component": "Button", "props": { "label": "Хорошо", "severity": "success" }, "action": { "key": "mood", "value": 3 } }
  ```
- [ ] Add `InputText` to COMPONENT GUIDE with example showing `action: { key }` (value comes from input)
- [ ] Add `Form` to COMPONENT GUIDE with `fields` array and `outputKey` example
- [ ] Update IN_APP_SYSTEM_PROMPT UIUPDATE section with same three components

### Task 9: Update documentation

- [ ] Update `README.md` — mention user input components in the architecture section
- [ ] Update `README.ru.md` — same changes in Russian
- [ ] Update `CLAUDE.md` — add note about input components and new endpoint

## Technical Details

**New endpoint contract:**
```
POST /api/app/:hash/data
Authorization: Bearer <jwt>  (if password-protected)
Body: { "key": "mood", "value": 3 }

Response 200: { "ok": true }
Response 400: { "error": "key must be alphanumeric/underscore, max 100 chars" }
Response 413: { "error": "value too large" }
```

**Key validation regex:** `/^[a-zA-Z0-9_]{1,100}$/`

**Value size check:** `JSON.stringify(value).length <= 10_000`

**Data refresh flow:**
```
User clicks Button
  → AppButton calls POST /api/app/:hash/data
  → emits 'data-written'
  → AppRenderer re-emits 'data-written'
  → AppView.vue calls appStore.fetchData(hash)
  → appDataMap recomputed
  → AppRenderer re-renders with new data
```

**`action` prop is NOT a prop in the current `UiConfigItem.props` map** — it's a top-level field on the config item alongside `component`, `props`, `dataKey`. This keeps it separate from PrimeVue props and avoids any filtering issues.

## Post-Completion

**Manual verification scenarios:**
- Mood tracker: create app with 3 buttons (1/2/3), click each, verify `appData` key updates, verify 7-day avg cron reads the written values
- Weight entry: InputText with type=number, verify value saved under correct key
- Full form: Form with 2 fields, submit, verify object written with timestamp
- Password-protected app: verify button click requires valid JWT
- Rate limiting: rapid clicking should eventually get 429

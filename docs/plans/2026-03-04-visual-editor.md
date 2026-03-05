# Визуальный редактор (Этап 7)

## Overview
- Добавить визуальный drag-and-drop редактор приложений как альтернативу чату
- Пользователь может переключаться между чатом и редактором кнопкой в правой панели
- Редактор показывает компоненты на CSS Grid (12 колонок), позволяет перетаскивать, изменять размер, добавлять из палитры и редактировать свойства
- Подход B: отдельный `AppEditor.vue` со своим рендер-циклом (карточки компонентов с контролами), не WYSIWYG
- Обратная совместимость: существующие приложения без layout метаданных рендерятся как раньше (full-width стек)

## Context (from discovery)
- Текущий рендеринг: `AppRenderer.vue` — вертикальный flex-column, компоненты стакаются сверху вниз
- 22 компонента, 11 с кастомными обёртками (`AppCard`, `AppButton`, `AppForm`, etc.)
- Нет layout метаданных в конфиге — нет col/row/span
- Нет API для прямого сохранения конфига (только через AI chat + `uiUpdate`)
- Нет drag-and-drop библиотеки
- PrimeVue 4 (Aura)
- Multi-page поддержка: `config.pages[]` с per-page `uiComponents[]`

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

## Implementation Steps

### Task 1: Config schema — добавить layout метаданные
- [x] Добавить опциональное поле `layout?: { col: number; colSpan: number; row?: number; rowSpan?: number }` в тип `UiComponent` (в `aiService.ts`)
- [x] `col` — начальная колонка (1-12), `colSpan` — ширина в колонках (1-12), `row`/`rowSpan` — опциональные
- [x] Обновить `validateUiComponents()` — валидировать layout поля (числа в допустимых диапазонах, col + colSpan ≤ 13)
- [x] Невалидный layout → удалить поле (fallback на full-width), не отклонять весь компонент
- [x] Обновить `validatePages()` — layout в per-page компонентах тоже валидируется
- [x] Написать тесты для валидации layout (валидные, невалидные, отсутствующие значения)
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 2: API эндпоинт для прямого сохранения конфига
- [ ] Создать `PUT /api/app/:hash/config` в `server/src/routes/app.ts`
- [ ] Принимает `{ uiComponents?: UiComponent[], pages?: Page[] }` — одно из двух
- [ ] Валидация через существующие `validateUiComponents()` и `validatePages()`
- [ ] Защита: `requireAuthIfProtected` middleware (JWT для protected, X-User-Id для unprotected)
- [ ] Rate limit: `chatLimiter` (30 req/min)
- [ ] Сохранение в БД: обновить `apps.config`
- [ ] Написать тесты для эндпоинта (success, validation errors, auth, rate limit)
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 3: AppRenderer — рендеринг CSS Grid
- [ ] Изменить `.app-renderer` с `flex-direction: column` на `display: grid; grid-template-columns: repeat(12, 1fr); gap: 1rem`
- [ ] Каждый компонент получает `grid-column: col / span colSpan` из `item.layout`
- [ ] Fallback (нет layout): `grid-column: 1 / -1` (full-width) — обратная совместимость
- [ ] Если указан `row`/`rowSpan`: `grid-row: row / span rowSpan`
- [ ] Responsive: на мобильных (≤767px) все компоненты full-width (`grid-column: 1 / -1`)
- [ ] Проверить что ConditionalGroup и multi-page рендерятся корректно с grid
- [ ] Написать тесты (если есть клиентские тесты для AppRenderer) или ручная проверка
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 4: Editor store — состояние редактора
- [ ] Создать `client/src/stores/editor.ts` — Pinia store
- [ ] State: `isEditMode: boolean`, `selectedComponentIndex: number | null`, `editableConfig: UiComponent[]` (рабочая копия), `isDirty: boolean`, `activePage: string | null` (для multi-page)
- [ ] Actions: `enterEditMode(config)` — копирует конфиг, `exitEditMode()` — сбрасывает, `selectComponent(index)`, `updateComponent(index, partial)`, `removeComponent(index)`, `addComponent(component, index?)`, `moveComponent(fromIndex, toIndex)`, `updateLayout(index, layout)`, `saveConfig(hash)` — вызывает PUT API
- [ ] Getters: `selectedComponent`, `currentPageComponents` (для multi-page)
- [ ] Написать тесты для всех actions и getters
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 5: Переключение режимов в AppView
- [ ] Добавить кнопку-переключатель в header AppView (иконка pi-pencil / pi-comments)
- [ ] При переключении в edit mode: правая панель показывает editor UI вместо чата
- [ ] При переключении в view mode: правая панель показывает чат (как сейчас)
- [ ] Левая панель: в edit mode показывает `AppEditor`, в view mode — `AppRenderer`
- [ ] Инициализация: `editorStore.enterEditMode(appConfig)` при входе в edit mode
- [ ] Unsaved changes warning: при переключении обратно в view mode спрашивать, если `isDirty`
- [ ] Написать тесты для переключения режимов
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 6: AppEditor canvas — карточки компонентов на grid
- [ ] Создать `client/src/components/editor/AppEditor.vue`
- [ ] CSS Grid 12 колонок — зеркально AppRenderer но с edit-карточками
- [ ] Каждый компонент — карточка `EditorComponentCard.vue`: иконка типа, название/label, dataKey/dataSource инфо, drag handle, кнопка удаления
- [ ] Клик по карточке → `editorStore.selectComponent(index)` → синяя рамка
- [ ] Пустой grid: показать placeholder "Перетащите компоненты из палитры"
- [ ] Визуальная сетка (тонкие линии) для ориентирования при размещении
- [ ] Multi-page: табы сверху (как в AppView), редактирование per-page
- [ ] Написать тесты для EditorComponentCard
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 7: Drag-and-drop — библиотека и интеграция
- [ ] Установить `vue-draggable-plus` (обёртка sortablejs для Vue 3)
- [ ] Реорганизация компонентов на canvas (drag handle на карточке)
- [ ] Grid snapping: при перетаскивании компонент привязывается к колонкам сетки
- [ ] Drag из палитры на canvas (cross-container drag)
- [ ] Resize handles: изменение `colSpan` перетаскиванием правого края карточки
- [ ] Обновление `editorStore` при drag-end и resize-end
- [ ] Написать тесты для drag-and-drop логики (events → store updates)
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 8: Палитра компонентов
- [ ] Создать `client/src/components/editor/ComponentPalette.vue`
- [ ] Размещение: верхняя часть правой панели (над property editor)
- [ ] Группировка по категориям: Display (Card, DataTable, Chart, Timeline, Knob, Tag, ProgressBar, Calendar, CardList, Image, MeterGroup, Badge, Chip, Slider, Rating), Input (Button, InputText, Form), Layout (Accordion, Panel, Tabs, ConditionalGroup)
- [ ] Каждый элемент: иконка + название, draggable в canvas
- [ ] При drop: создаёт компонент с default props для типа (определить defaults)
- [ ] Компактный вид: горизонтальные чипы или иконки с tooltip
- [ ] Написать тесты для default props генерации
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 9: Property editor panel
- [ ] Создать `client/src/components/editor/PropertyEditor.vue`
- [ ] Размещение: нижняя часть правой панели (под палитрой), скроллится
- [ ] Секции (аккордеон/tabs): General, Props, Data, Actions, Conditional, Layout
- [ ] **General**: component type (read-only), кнопка удаления
- [ ] **Props**: динамическая форма из `item.props` — InputText для строк, InputNumber для чисел, Checkbox для boolean, Dropdown для enum
- [ ] **Data**: dataKey (InputText), dataSource (Dropdown таблиц + опциональный filter builder), computedValue (InputText с подсказкой формулы)
- [ ] **Actions**: action chain builder — список шагов, добавить/удалить шаг, per-step форма по типу (writeData, navigateTo, toggleVisibility, runFormula, fetchUrl)
- [ ] **Conditional**: showIf (InputText), styleIf builder (condition + class dropdown)
- [ ] **Layout**: col (InputNumber 1-12), colSpan (InputNumber 1-12), row (InputNumber), rowSpan (InputNumber)
- [ ] Все изменения → `editorStore.updateComponent(index, partial)` → `isDirty = true`
- [ ] Написать тесты для property editor logic
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 10: Сохранение и синхронизация
- [ ] Кнопка "Сохранить" в header editor (активна когда `isDirty`)
- [ ] `editorStore.saveConfig(hash)` → `PUT /api/app/:hash/config` → обновить `appStore.appConfig`
- [ ] После сохранения: `isDirty = false`, можно переключиться в view mode и увидеть результат
- [ ] Кнопка "Отменить" — сбросить `editableConfig` к `appStore.appConfig`
- [ ] Keyboard shortcut: Ctrl+S для сохранения в edit mode
- [ ] Написать тесты для save/discard flow
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 11: Multi-page поддержка в редакторе
- [ ] Табы страниц в AppEditor с возможностью: переключить, добавить новую, удалить, переименовать
- [ ] Drag-and-drop табов для изменения порядка страниц
- [ ] При добавлении страницы: диалог с id, title, icon
- [ ] Переключение single-page ↔ multi-page: если добавляется вторая страница, конвертировать uiComponents в pages
- [ ] Property editor для страницы: title, icon, id (read-only после создания)
- [ ] Написать тесты для page management
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 12: AI промпты — обновить документацию по layout
- [ ] Обновить `BRAINSTORM_SYSTEM_PROMPT` и `IN_APP_SYSTEM_PROMPT` в `aiService.ts` — добавить документацию по `layout` полю
- [ ] AI должен генерировать layout для новых приложений (разумные defaults: cards по 6 колонок, tables/charts full-width, buttons по 3-4 колонки)
- [ ] Обновить примеры в промптах
- [ ] Написать тесты для валидации AI-генерируемых layout
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 13: Verify acceptance criteria
- [ ] Verify: можно создать приложение через чат, переключиться в редактор, изменить layout/props, сохранить
- [ ] Verify: drag-and-drop работает (reorder, resize, add from palette)
- [ ] Verify: property editor корректно отображает и сохраняет все типы props
- [ ] Verify: CSS Grid layout рендерится в view mode
- [ ] Verify: обратная совместимость — старые приложения без layout работают
- [ ] Verify: multi-page приложения редактируются корректно
- [ ] Run full test suite (unit tests)
- [ ] Run linter — all issues must be fixed

### Task 14: [Final] Update documentation
- [ ] Обновить `README.md` — описание визуального редактора
- [ ] Обновить `README.ru.md` — описание визуального редактора
- [ ] Обновить `CLAUDE.md` — добавить секцию про редактор, layout, новые файлы
- [ ] Обновить `docs/roadmap-v2.md` — отметить Этап 7 как реализованный

## Technical Details

### Layout metadata в UiComponent
```ts
layout?: {
  col: number      // 1-12, начальная колонка
  colSpan: number  // 1-12, ширина в колонках (col + colSpan ≤ 13)
  row?: number     // опциональная строка (auto если не указан)
  rowSpan?: number // опциональная высота в строках (default 1)
}
```
Default (нет layout): `grid-column: 1 / -1` (full-width, как сейчас).

### CSS Grid в AppRenderer
```css
.app-renderer {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 1rem;
}
.app-renderer__item {
  grid-column: var(--col) / span var(--col-span);
}
@media (max-width: 767px) {
  .app-renderer__item { grid-column: 1 / -1; }
}
```

### Новые файлы
```
client/src/stores/editor.ts           — editor state management
client/src/components/editor/
  AppEditor.vue                        — main editor canvas
  EditorComponentCard.vue              — component card in editor
  ComponentPalette.vue                 — component palette
  PropertyEditor.vue                   — property editor panel
```

### API
```
PUT /api/app/:hash/config
Body: { uiComponents?: UiComponent[] } | { pages?: Page[] }
Auth: requireAuthIfProtected
Rate: 30 req/min
Response: { ok: true, config: {...} }
```

### Drag-and-drop библиотека
`vue-draggable-plus` — Vue 3 wrapper для SortableJS. Поддерживает cross-container drag (палитра → canvas), сортировку, cloning.

## Post-Completion

**Manual verification:**
- Создать приложение через чат → переключиться в редактор → изменить layout → сохранить → проверить в view mode
- Проверить drag-and-drop на мобильном устройстве
- Проверить performance с 20 компонентами на grid
- Проверить что AI-генерируемые layout выглядят хорошо

**Follow-up improvements (не входят в этот план):**
- Undo/redo (Ctrl+Z / Ctrl+Y)
- Copy/paste компонентов
- Шаблоны layout (dashboard, form, etc.)
- Превью в реальном времени внутри editor cards

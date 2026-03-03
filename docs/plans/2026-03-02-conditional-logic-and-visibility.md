# Этап 4: Условная логика и видимость

## Overview
Добавить `showIf`, `styleIf` и `ConditionalGroup` — три механизма условного отображения и стилизации компонентов на основе данных приложения. Позволит строить интерактивные UI, где компоненты появляются/скрываются и меняют стиль в зависимости от состояния.

- `showIf` — выражение на любом компоненте, определяющее его видимость
- `styleIf` — массив условных CSS-классов на любом компоненте
- `ConditionalGroup` — контейнер, показывающий/скрывающий группу вложенных компонентов

Используется существующий парсер формул из Этапа 3. Валидация выражений — на сервере, вычисление — на клиенте (реактивно по данным из стора).

## Context (from discovery)
- Парсер формул: `server/src/utils/formula/` (tokenizer, parser, evaluator)
- Валидация компонентов: `server/src/services/aiService.ts` → `validateUiComponents()`
- Рендеринг: `client/src/components/AppRenderer.vue` — `v-for` по `uiConfig`
- Стор: `client/src/stores/app.ts` — `appData`, `computedValues`, `tableData`
- Паттерн `computedValues`: сервер вычисляет формулы, клиент получает результаты через `GET /data`
- Тип `UiComponent`: `server/src/services/aiService.ts` (lines 29-39)

## Development Approach
- **Testing approach**: Regular (код, потом тесты)
- **Вычисление showIf/styleIf**: на клиенте (реактивно) — парсер формул нужно портировать на клиент
- Complete each task fully before moving to the next
- Make small, focused changes
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
- **CRITICAL: all tests must pass before starting next task**
- **CRITICAL: update this plan file when scope changes during implementation**
- Run tests after each change
- Maintain backward compatibility

## Testing Strategy
- **Unit tests**: vitest для серверной валидации (showIf/styleIf парсинг, ConditionalGroup валидация)
- **Unit tests**: vitest для клиентского вычисления (формулы против appData/tableData)
- **Manual testing**: создать тестовое приложение с showIf/styleIf через чат

## Progress Tracking
- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix
- Update plan if implementation deviates from original scope

## Implementation Steps

### Task 1: Портировать парсер формул на клиент
Формулы showIf/styleIf вычисляются на клиенте — нужна клиентская версия парсера.
- [x] Скопировать `server/src/utils/formula/` → `client/src/utils/formula/` (tokenizer, parser, evaluator, index)
- [x] Адаптировать импорты (убрать серверные зависимости если есть)
- [x] Создать `client/src/utils/showIf.ts` — функция `evaluateShowIf(expression: string, context: Record<string, unknown>): boolean`
- [x] Создать `client/src/utils/styleIf.ts` — функция `evaluateStyleIf(conditions: Array<{condition: string, class: string}>, context: Record<string, unknown>): string[]`
- [x] Написать тесты для `evaluateShowIf` (различные выражения, типы данных, null/undefined)
- [x] Написать тесты для `evaluateStyleIf` (множественные условия, пустые массивы)
- [x] Запустить тесты — должны проходить перед Task 2

### Task 2: Серверная валидация showIf и styleIf
Сервер валидирует выражения при сохранении конфига, но не вычисляет.
- [x] Расширить тип `UiComponent` в `aiService.ts`: добавить `showIf?: string`, `styleIf?: Array<{condition: string, class: string}>`
- [x] В `validateUiComponents()` добавить валидацию `showIf`: парсинг формулы через `parseFormula()`, невалидные → `undefined`
- [x] В `validateUiComponents()` добавить валидацию `styleIf`: проверка массива, парсинг каждого `condition`, валидация `class` (алфавитно-цифровой + дефис/подчёркивание)
- [x] Написать тесты валидации: валидный showIf, невалидный showIf (дропается), валидный styleIf, невалидный condition (фильтруется), пустой class (фильтруется)
- [x] Запустить тесты — должны проходить перед Task 3

### Task 3: Клиентская логика showIf в AppRenderer
Реактивное скрытие/показ компонентов на основе appData и tableData.
- [x] В `AppRenderer.vue` добавить функцию `buildFormulaContext()` — собирает контекст из `appStore.appData` и `appStore.tableData`
- [x] Добавить функцию `shouldShow(item, index): boolean` — вызывает `evaluateShowIf` с контекстом
- [x] Обернуть каждый компонент в шаблоне в `v-if="shouldShow(item, index)"`
- [x] Убедиться что компоненты без `showIf` всегда отображаются (default: true)
- [x] Написать тесты для `buildFormulaContext` (преобразование appData массива в Record)
- [x] Запустить тесты — должны проходить перед Task 4

### Task 4: Клиентская логика styleIf в AppRenderer
Условные CSS-классы на компонентах.
- [x] Определить набор предустановленных CSS-классов (warning, critical, success, muted, highlight) в `client/src/assets/` или scoped в AppRenderer
- [x] В `AppRenderer.vue` добавить функцию `getConditionalClasses(item, index): string[]` — вызывает `evaluateStyleIf`
- [x] Применить результат через `:class` на обёртке каждого компонента
- [x] Написать тесты для корректного применения классов
- [x] Запустить тесты — должны проходить перед Task 5

### Task 5: Компонент ConditionalGroup
Контейнер для условного показа группы вложенных компонентов.
- [x] Добавить `'ConditionalGroup'` в `ALLOWED_UI_COMPONENTS`
- [x] Расширить тип `UiComponent`: добавить `condition?: string`, `children?: UiComponent[]`
- [x] В `validateUiComponents()` добавить валидацию для ConditionalGroup: парсинг `condition`, рекурсивная валидация `children` (с ограничением вложенности — max 1 уровень)
- [x] Создать `client/src/components/AppConditionalGroup.vue` — принимает `condition`, `children`, `hash`; рендерит children через те же обёртки AppRenderer
- [x] В `AppRenderer.vue` добавить обработку `ConditionalGroup` — передавать children для рендеринга
- [x] Написать тесты для валидации ConditionalGroup (валидный, без condition, пустые children, вложенный ConditionalGroup)
- [x] Запустить тесты — должны проходить перед Task 6

### Task 6: Обновить AI-промпты
Документировать showIf, styleIf и ConditionalGroup в обоих системных промптах.
- [ ] В `BRAINSTORM_SYSTEM_PROMPT` добавить секцию CONDITIONAL RENDERING с примерами showIf, styleIf, ConditionalGroup
- [ ] В `IN_APP_SYSTEM_PROMPT` добавить документацию showIf/styleIf/ConditionalGroup в UIUPDATE COMPONENT GUIDE
- [ ] Обновить тесты промптов в `buildSystemPrompt.test.ts` (проверить наличие showIf/styleIf/ConditionalGroup в промптах)
- [ ] Запустить тесты — должны проходить перед Task 7

### Task 7: Verify acceptance criteria
- [ ] Проверить что все требования из Overview реализованы
- [ ] Проверить что существующие приложения без showIf/styleIf работают без изменений (обратная совместимость)
- [ ] Проверить edge cases: несуществующий dataKey в showIf, деление на 0 в условии, null значения
- [ ] Запустить полный тест suite (`npm test --workspace=server`)
- [ ] Убедиться что все тесты проходят

### Task 8: [Final] Обновить документацию
- [ ] Обновить `CLAUDE.md` — добавить описание showIf/styleIf/ConditionalGroup
- [ ] Обновить `README.md` и `README.ru.md` если нужно
- [ ] Обновить `docs/roadmap-v2.md` — пометить Этап 4 как ✅ реализован

## Technical Details

### showIf
- Поле `showIf: string` на любом `UiComponent`
- Выражение парсится на сервере (`parseFormula`) для валидации
- Вычисляется на клиенте реактивно при изменении `appData`/`tableData`
- Контекст: все ключи из appData + tableData доступны как переменные
- Falsy результат (false, null, 0, "") → компонент скрыт
- Отсутствие showIf → компонент всегда виден

### styleIf
- Поле `styleIf: Array<{condition: string, class: string}>` на любом `UiComponent`
- Каждый `condition` — формула, вычисляемая на клиенте
- `class` — CSS-класс, применяемый если condition truthy
- Несколько классов могут применяться одновременно
- Предустановленные классы: `warning` (жёлтый), `critical` (красный), `success` (зелёный), `muted` (серый), `highlight` (подсветка)

### ConditionalGroup
- `component: "ConditionalGroup"`, `condition: string`, `children: UiComponent[]`
- Если condition truthy — рендерятся все children, иначе — ничего
- Максимум 1 уровень вложенности (ConditionalGroup внутри ConditionalGroup запрещён)
- children проходят ту же валидацию что и обычные компоненты

### Клиентский парсер формул
- Копия серверного парсера (`server/src/utils/formula/`)
- Контекст для вычисления: `Record<string, unknown>` собранный из appData + tableData
- Агрегатные функции (SUM, AVG, COUNT) работают если tableData загружены в стор

## Post-Completion

**Manual verification:**
- Создать тестовое приложение через чат с showIf на компонентах
- Проверить что компоненты реактивно появляются/скрываются при изменении данных
- Проверить styleIf — условные стили применяются корректно
- Проверить ConditionalGroup — группа компонентов показывается/скрывается

# Smailo

Персональный конструктор AI-приложений. Общайтесь со Smailo — выразительным AI-ассистентом — чтобы проектировать и создавать личные приложения: трекеры, планировщики, визуализаторы данных. Каждое приложение получает динамический интерфейс на PrimeVue и опциональные cron-задания, которые выполняются автоматически в фоне.

## Как это работает

1. Откройте главную страницу — создайте новый ID пользователя или введите существующий
2. На личной странице опишите идею приложения Smailo в AI-чате
3. Smailo проведёт вас через фазы: брейнсторм → подтверждение → создание
4. После создания приложение получает уникальный URL `/:userId/:hash`, который можно сохранить в закладки
5. При желании установите пароль для защиты приложения
6. Внутри приложения общайтесь со Smailo в правой панели, чтобы обновить интерфейс или добавить автоматизации
7. Все ваши приложения доступны на личной странице `/:userId`

## Требования

- Node.js 20+
- API-ключ выбранного AI-провайдера: Anthropic (по умолчанию) или DeepSeek

## Установка

```sh
# 1. Скопируйте файл окружения и заполните значения
cp .env.example .env

# 2. Установите все зависимости (корень + client + server)
npm install

# 3. Создайте таблицы базы данных SQLite
npm run db:push

# 4. Запустите сервер разработки
npm run dev
```

Клиент запускается на http://localhost:5173, сервер — на http://localhost:3000.

## Переменные окружения

| Переменная         | Описание                                              | По умолчанию              |
|--------------------|-------------------------------------------------------|---------------------------|
| PORT               | Порт сервера                                          | 3000                      |
| ANTHROPIC_API_KEY  | API-ключ Anthropic (обязателен для anthropic)         | —                         |
| ANTHROPIC_MODEL    | Название модели Anthropic                             | claude-sonnet-4-6         |
| JWT_SECRET         | Секрет для подписи токенов доступа к приложениям      | —                         |
| DATABASE_URL       | Путь к файлу базы данных SQLite                       | ./data.sqlite             |
| CLIENT_URL         | Origin, разрешённый CORS                              | http://localhost:5173     |
| AI_PROVIDER        | AI-провайдер: anthropic или deepseek                  | anthropic                 |
| DEEPSEEK_API_KEY   | API-ключ DeepSeek (обязателен для deepseek)           | —                         |
| DEEPSEEK_MODEL     | Название модели DeepSeek                              | deepseek-chat             |

## Архитектура

```
smailo/
├── client/                 # Фронтенд на Vue 3 + Vite
│   └── src/
│       ├── components/
│       │   ├── Smailo.vue        # Анимированный SVG-персонаж (5 настроений)
│       │   ├── InputBar.vue      # Ввод текста с кнопками-цифрами для нумерованных вариантов
│       │   ├── AppRenderer.vue   # Динамический рендерер PrimeVue-компонентов
│       │   ├── AppCard.vue       # Обёртка для Card (использует слоты PrimeVue)
│       │   ├── AppDataTable.vue  # Обёртка для DataTable (автогенерация колонок)
│       │   ├── AppButton.vue     # Кнопка, записывающая данные в appData по клику
│       │   ├── AppInputText.vue  # Текстовое/числовое поле с кнопкой «Сохранить»
│       │   ├── AppForm.vue       # Многопольная форма, сохраняющая объект целиком
│       │   ├── AppAccordion.vue  # Обёртка для сворачиваемых секций Accordion
│       │   ├── AppPanel.vue      # Обёртка для Panel с заголовком
│       │   └── AppTabs.vue       # Обёртка для Tabs с данными по вкладкам
│       ├── views/
│       │   ├── HomeView.vue      # Лендинг — создание или ввод userId
│       │   ├── UserView.vue      # Личная страница: список приложений (слева) + AI-чат (справа)
│       │   └── AppView.vue       # Двухколоночный вид: AppRenderer (слева) + AI-чат (справа)
│       ├── stores/
│       │   ├── user.ts           # Pinia-стор для идентификации пользователя и списка приложений
│       │   ├── chat.ts           # Pinia-стор для состояния чата создания приложений
│       │   └── app.ts            # Pinia-стор для данных приложения и авторизации
│       ├── api/index.ts          # Axios с JWT-интерцептором
│       └── router/index.ts       # Vue Router: /, /:userId, /:userId/:hash, /app/:hash
│
└── server/                 # Бэкенд на Express + TypeScript
    └── src/
        ├── db/
        │   ├── schema.ts         # Drizzle-схема: users, apps, cronJobs, appData, chatHistory
        │   └── index.ts          # Подключение SQLite + Drizzle
        ├── services/
        │   ├── aiService.ts      # Единый AI-сервис: Anthropic или DeepSeek через AI_PROVIDER
        │   └── cronManager.ts    # Планировщик node-cron для автоматизаций приложений
        ├── routes/
        │   ├── users.ts          # POST/GET /api/users — создание и поиск пользователей
        │   ├── chat.ts           # POST /api/chat — поток брейнсторма на главной
        │   └── app.ts            # GET/POST /api/app/:hash — доступ и чат в приложении
        └── index.ts              # Точка входа Express
```

### Маршруты

| Путь | Вид | Описание |
|------|-----|----------|
| `/` | HomeView | Лендинг — создать нового пользователя или ввести userId |
| `/:userId` | UserView | Личная страница: список приложений и AI-чат для создания |
| `/:userId/:hash` | AppView | Вид приложения с двухколоночным лейаутом |
| `/app/:hash` | AppView | Обратная совместимость (userId = null) |

### Поток данных

- Создание пользователя: клиент → `POST /api/users` → возвращает `{ userId }` → сохраняется в `localStorage`
- Список приложений: клиент → `GET /api/users/:userId/apps` → список приложений пользователя
- Чат создания: клиент → `POST /api/chat` (с `userId`) → AI-сервис (фаза брейнсторм) → ответ с настроением/фазой
- Создание приложения: когда AI-сервис возвращает `phase: 'created'`, сервер генерирует 64-символьный hex-хэш, создаёт запись приложения (с `userId`) и планирует cron-задания
- Доступ к приложению: клиент → `GET /api/app/:hash` → возвращает конфиг + последние appData (JWT обязателен при наличии пароля)
- Чат в приложении: клиент → `POST /api/app/:hash/chat` → AI-сервис (фаза chat) → опциональное обновление UI
- Пользовательские записи: компоненты Button/InputText/Form → `POST /api/app/:hash/data` → appData обновляется, UI перерисовывается
- Cron-задания: node-cron выполняет запланированные действия (log_entry, fetch_url, send_reminder, aggregate_data) и записывает результаты в appData

### Ключевые технологии

- Фронтенд: Vue 3, Pinia, Vue Router, PrimeVue 4 (тема Aura), GSAP, Axios
- Бэкенд: Express, Drizzle ORM, better-sqlite3, node-cron, @anthropic-ai/sdk, openai
- Авторизация: bcryptjs (хэширование паролей), jsonwebtoken (токены доступа к приложениям)

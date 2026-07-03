# TariffCalcBitrix24

MVP калькулятора стоимости перевозки для встраивания в карточку сделки Bitrix24. Проект сделан как TypeScript-монорепозиторий: backend на NestJS, frontend на React/Vite, хранение расчетов через Prisma/PostgreSQL.

Текущая версия покрывает локальный сценарий разработки: форма калькулятора, временный расчет, сохранение результата, история расчетов и базовая заготовка Bitrix24 placement. Реальные тарифные таблицы, полноценный OAuth Bitrix24 и запись результата обратно в сделку пока находятся в TODO.

## Что уже есть

- React-страница калькулятора: `http://localhost:5173/deal-calculator`
- NestJS API: `http://localhost:9099`
- Health endpoint: `GET /health`
- Справочники для UI: `GET /dictionaries/bootstrap`
- Расчет без сохранения: `POST /calculator/calculate`
- Сохранение и чтение истории расчетов: `/calculations/*`
- Bitrix24 shell для вкладки сделки: `GET /bitrix/deal-tab`
- DEV-привязка placement через входящий вебхук Bitrix24: `/bitrix/placement/bind`

## Стек

- Node.js 18+ / npm 9+
- TypeScript
- NestJS
- React 18 + Vite
- Prisma 5
- PostgreSQL
- Docker Compose для локальной инфраструктуры

## Структура проекта

```text
apps/
  api/        NestJS backend
  web/        React/Vite frontend
prisma/
  schema.prisma
docs/
  *.md        подробные документы по API, модели, Bitrix24 и бизнес-логике
```

## Быстрый локальный запуск

1. Установите зависимости:

```bash
npm install
```

2. Подготовьте env-файлы:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Для backend минимально нужны:

```env
APP_PORT=9099
APP_PUBLIC_URL=http://localhost:9099
WEB_PUBLIC_URL=http://localhost:5173
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME"
BITRIX_PORTAL_DOMAIN=
BITRIX_WEBHOOK_URL=
```

Для frontend:

```env
VITE_API_URL=http://localhost:9099
```

3. Синхронизируйте Prisma-схему с базой:

```bash
npm run prisma:validate
npm run prisma:generate
npm run prisma:push
```

Для текущего MVP используется `prisma db push`, а не миграции.

4. Запустите backend и frontend:

```bash
npm run dev
```

После запуска:

- frontend: `http://localhost:5173/deal-calculator`
- backend health: `http://localhost:9099/health`

## Docker Compose

В проекте есть `docker-compose.yml`, который поднимает PostgreSQL, API и web:

```bash
npm run docker:up
```

Остановка:

```bash
npm run docker:down
```

Если запускаете через Compose, проверьте наличие корневого `.env`, потому что сервис `api` подключает `env_file: .env`. Для локального запуска через `npm run dev` используется `apps/api/.env`.

## Основные команды

```bash
npm run dev                 # API + Web
npm run dev:api             # только backend
npm run dev:web             # только frontend
npm run build               # сборка API + Web
npm run typecheck           # проверка типов API + Web
npm run prisma:validate     # проверка Prisma schema
npm run prisma:generate     # генерация Prisma Client
npm run prisma:push         # применение schema через db push
```

## API MVP

В текущем коде нет глобального префикса `/api`; endpoints доступны от корня backend origin.

### `GET /health`

Проверка доступности API.

### `GET /dictionaries/bootstrap`

Возвращает стартовые значения для формы:

- типы маршрутов: `KLD_OUT`, `KLD_IN`
- типы транспорта: `AUTO`, `RAIL`, `SEA`, `MULTIMODAL`
- типы контейнеров
- статусы контейнера
- валюты
- типы маржи

### `POST /calculator/calculate`

Выполняет расчет без записи в БД. Сейчас используется временная формула:

- базовая перевозка: `weightKg * 2 + volumeM3 * 50`
- ПРР: `150`, если включено
- хранение: `50`, если включено
- реф-подключение: `75`, если включено
- аренда контейнера: `100`, если включено
- маржа: процент от себестоимости или фиксированная сумма

Ответ содержит `totalCost`, `margin`, `clientPrice`, `currency`, строки детализации и warning о временной формуле.

### `/calculations`

- `POST /calculations` - сохранить расчет и строки детализации
- `GET /calculations/recent` - последние 20 расчетов
- `GET /calculations/by-deal/:dealId` - последние 20 расчетов по сделке
- `GET /calculations/:id` - расчет по ID

## Bitrix24

Для разработки формы, расчета, сохранения и истории туннели не нужны. Они нужны только для проверки встраивания в облачный Bitrix24, потому что Bitrix24 должен видеть публичные HTTPS URL.

Текущие endpoints:

- `GET /bitrix/install` - HTML-страница проверки конфигурации и ручного bind
- `POST /bitrix/install` - заготовка install handler
- `GET /bitrix/deal-tab` - HTML shell с iframe на frontend `/deal-calculator`
- `POST /bitrix/placement/bind` - регистрация вкладки сделки `CRM_DEAL_DETAIL_TAB`
- `POST /bitrix/placement/unbind` - снятие привязки
- `GET /bitrix/placement/status` - статус конфигурации
- `GET /bitrix/debug/context` - диагностика placement query/context

Для DEV-режима можно указать входящий вебхук:

```env
BITRIX_WEBHOOK_URL=https://example.bitrix24.ru/rest/...
APP_PUBLIC_URL=https://public-backend-url
WEB_PUBLIC_URL=https://public-frontend-url
```

После этого `POST /bitrix/placement/bind` вызовет Bitrix24 REST `placement.bind`. Полный OAuth-flow и надежное хранение токенов в БД пока не реализованы.

## Данные

Prisma-схема сейчас содержит:

- роли и пользователей
- порталы и токены Bitrix24
- сохраненные расчеты
- строки расчетов

Тарифные справочники и реальные тарифные таблицы пока не добавлены в schema. Они описаны как следующий этап в `docs/business-logic.md` и `docs/data-model.md`.

## Документация

Подробные документы лежат в `docs/`:

- `docs/local-development.md` - локальная разработка без туннелей
- `docs/deployment-vps.md` - деплой на VPS через PM2, Nginx и Let's Encrypt
- `docs/bitrix24-integration.md` - целевой сценарий Bitrix24
- `docs/api-contracts.md` - целевые API-контракты
- `docs/business-logic.md` - бизнес-логика и открытые вопросы
- `docs/data-model.md` - модель данных
- `docs/deployment.md` - заметки по деплою
- `docs/examples.md` - примеры
- `docs/migration-plan.md` - план миграции/развития
- `docs/codex-prompts.md` - рабочие промпты для дальнейшей разработки

## Текущие ограничения

- Формула расчета временная и не использует реальные тарифы.
- Bitrix24 OAuth install flow не завершен: install payload пока не сохраняется.
- Запись результатов в поля сделки Bitrix24 не реализована.
- PDF/XLSX экспорт и импорт тарифов не реализованы.
- В подробных docs часть контрактов описывает целевое состояние и может отличаться от текущего MVP.

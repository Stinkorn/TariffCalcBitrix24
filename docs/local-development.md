# Локальный запуск без туннелей

Локальная разработка UI и калькулятора выполняется без `ngrok`/`localtunnel`.

## Шаги

1. Установить зависимости:

```bash
npm install
```

2. Настроить env backend:

```bash
cp apps/api/.env.example apps/api/.env
```

3. Настроить env frontend:

```bash
cp apps/web/.env.example apps/web/.env
```

4. Синхронизировать Prisma-схему (использовать только `db push`):

```bash
npm run prisma:validate
npm run prisma:generate
npm run prisma:push
```

5. Запустить backend + frontend:

```bash
npm run dev
```

6. Открыть страницу калькулятора:

`http://localhost:5173/deal-calculator`

## Важные замечания

- Для localhost используйте `APP_PUBLIC_URL=http://localhost:9099`.
- Для localhost используйте `WEB_PUBLIC_URL=http://localhost:5173`.
- Туннели нужны только для проверки встраивания в облачный Bitrix24 (`/bitrix/*`, placement/install).
- Для разработки формы, расчетов, сохранения и истории туннели не нужны.

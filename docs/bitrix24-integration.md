# Интеграция с облачным Битрикс24

## Тип приложения

Целевая версия должна быть реализована как внешнее локальное приложение для облачного Битрикс24.

- `NEEDS_CONFIRMATION`: в терминологии Bitrix24 это может быть "внешнее приложение" с удаленным backend/frontend
- для целей этого ТЗ используется формулировка пользователя: внешнее локальное приложение

## Где размещается приложение

Приложение размещается вне Битрикс24:

- frontend и backend деплоятся на отдельную инфраструктуру
- Bitrix24 открывает приложение по HTTPS URL
- база данных и файловое хранилище находятся на стороне приложения

Минимальная схема:

- `Frontend URL`: `https://app.example.com`
- `Backend URL`: `https://api.example.com` или общий origin

## Как открывается во вкладке сделки

Приложение должно открываться внутри карточки сделки CRM как отдельная вкладка.

Используемый placement:

- `CRM_DEAL_DETAIL_TAB`

Сценарий:

1. Пользователь открывает сделку в CRM.
2. Битрикс24 показывает вкладку приложения.
3. При открытии вкладки Bitrix24 вызывает handler приложения.
4. Frontend получает placement context.
5. Приложение извлекает `dealId` и загружает данные сделки и связанные расчеты.

## Placement

### Placement code

- `CRM_DEAL_DETAIL_TAB`

### Handler

- `/bitrix/deal-tab`

Этот endpoint должен:

- валидировать контекст Bitrix24
- отдать React entrypoint или HTML shell
- передать frontend необходимые bootstrap-данные

## Установка приложения

### Endpoint установки

- `/bitrix/install`

Во время установки backend должен:

1. принять install payload от Bitrix24
2. сохранить сведения о портале
3. сохранить токены
4. выполнить placement bind, если это не делает install flow автоматически
5. подготовить портал к использованию

## OAuth / token storage

Должно храниться:

- `access token`
- `refresh token`
- срок действия токена
- `member_id`
- `domain`
- scope приложения

Требования:

- хранить токены в PostgreSQL
- ограничить доступ к токенам backend-слоем
- `NEEDS_CONFIRMATION`: шифровать токены на уровне приложения/БД

## Получение `dealId` из `PLACEMENT_OPTIONS`

Frontend или backend должен извлекать `dealId` из placement context Bitrix24.

Ожидаемый источник:

- `PLACEMENT_OPTIONS`

Предполагаемый сценарий:

1. Bitrix24 открывает placement с параметрами.
2. Приложение получает `PLACEMENT_OPTIONS`.
3. Из payload извлекается идентификатор сделки.
4. `dealId` используется для загрузки сделки и сохранения расчета.

### TODO

- `TODO`: задокументировать фактический формат `PLACEMENT_OPTIONS` после тестовой установки приложения

## Чтение сделки через `crm.item.get`

Для загрузки карточки сделки и ее текущих пользовательских полей backend должен вызывать Bitrix24 REST API.

Базовый сценарий:

1. Получить `dealId`.
2. Использовать токен портала.
3. Вызвать `crm.item.get`.
4. Вернуть frontend нормализованную структуру сделки.

### TODO

- `NEEDS_CONFIRMATION`: использовать ли `crm.deal.get` или `crm.item.get` в зависимости от версии CRM API и настроек портала

## Запись результата через `crm.item.update`

После успешного расчета backend должен записать результат обратно в сделку.

Целевые поля:

- `UF_CRM_LOGISTICS_COST`
- `UF_CRM_CLIENT_PRICE`
- `UF_CRM_MARGIN`
- `UF_CRM_ROUTE`
- `UF_CRM_CALCULATION_ID`
- `UF_CRM_CALCULATION_PDF`

Важно:

- это примерные пользовательские поля
- реальные коды полей должны быть подтверждены в конкретном портале

### TODO

- `NEEDS_CONFIRMATION`: использовать ли числовые, строковые или файловые типы полей

## Пользовательские поля сделки

До запуска интеграции в портале должны существовать или быть созданы:

- `UF_CRM_LOGISTICS_COST`
- `UF_CRM_CLIENT_PRICE`
- `UF_CRM_MARGIN`
- `UF_CRM_ROUTE`
- `UF_CRM_CALCULATION_ID`
- `UF_CRM_CALCULATION_PDF`

Рекомендации по типам:

- `UF_CRM_LOGISTICS_COST`: number
- `UF_CRM_CLIENT_PRICE`: number
- `UF_CRM_MARGIN`: number
- `UF_CRM_ROUTE`: string/list
- `UF_CRM_CALCULATION_ID`: string
- `UF_CRM_CALCULATION_PDF`: string/url/file, `NEEDS_CONFIRMATION`

## Что нужно создать в Битрикс24 до запуска

- зарегистрировать приложение
- настроить URL установки и handler URL
- выдать нужные scope приложению
- создать пользовательские поля сделки
- проверить права на чтение/обновление сделок
- `NEEDS_CONFIRMATION`: создать отдельную вкладку/название placement

## Требования к HTTPS

Для облачного Битрикс24 приложение должно быть доступно по HTTPS.

Требования:

- валидный публичный сертификат
- публично доступный URL
- корректная обработка CORS и redirect'ов
- `NEEDS_CONFIRMATION`: нужна ли отдельная allowlist на стороне infra

## Локальная разработка через `ngrok` или аналог

Для локальной разработки можно использовать:

- `ngrok`
- `cloudflared`
- другой HTTPS tunnel

Сценарий:

1. Поднять локально frontend и backend.
2. Открыть публичный HTTPS tunnel.
3. Указать tunnel URL в настройках Bitrix24 приложения.
4. Выполнить install/reinstall приложения.
5. Тестировать placement внутри сделки.

### TODO

- `TODO`: зафиксировать рекомендуемый dev-flow после выбора конкретного monorepo setup

## Возможные ошибки и troubleshooting

### Приложение не открывается во вкладке сделки

Проверить:

- корректность `placement bind`
- корректность handler URL
- доступность HTTPS URL
- ошибки CORS/iframe headers

### Не приходит `dealId`

Проверить:

- фактический payload `PLACEMENT_OPTIONS`
- правильность обработки placement context на frontend/backend

### Не читается сделка

Проверить:

- валидность access token
- scope приложения
- правильность метода Bitrix24 REST

### Не записываются поля сделки

Проверить:

- существуют ли пользовательские поля
- совпадают ли коды полей
- соответствует ли тип данных полю
- есть ли права на обновление CRM сущности

### Токен истек

Нужно:

- обновить токен через refresh flow
- повторить запрос к Bitrix24

### PDF не прикрепляется или не сохраняется

Проверить:

- где хранится PDF
- доступна ли ссылка Битрикс24
- `NEEDS_CONFIRMATION`: требуется ли отдельная загрузка файла в хранилище Bitrix24

## Регистрация вкладки сделки через placement.bind

### Требования

- backend должен быть доступен по публичному HTTPS URL
- frontend должен быть доступен по публичному HTTPS URL
- `APP_PUBLIC_URL` должен вести на backend
- `WEB_PUBLIC_URL` должен вести на frontend
- в облачном Битрикс24 нельзя использовать localhost как handler

Handler для вкладки сделки:

- `${APP_PUBLIC_URL}/bitrix/deal-tab`

Placement:

- `CRM_DEAL_DETAIL_TAB`

### DEV через входящий вебхук (DEV ONLY)

1. Создать входящий вебхук в Битрикс24.
2. Выдать права `crm` и `placement`.
3. Указать вебхук в `BITRIX_WEBHOOK_URL`.
4. Выполнить запрос:
   - `POST /api/bitrix/placement/bind`

В DEV-режиме (без OAuth) backend использует `BITRIX_WEBHOOK_URL` для вызова:

- `placement.bind`
- `placement.unbind`
- `placement.get`

### Проверка

1. Открыть сделку в Битрикс24.
2. Найти вкладку `Калькулятор перевозки`.
3. Проверить, что открывается `/bitrix/deal-tab`.
4. Проверить, что `dealId` приходит через `PLACEMENT_OPTIONS` (см. `/api/bitrix/debug/context`).

### Удаление вкладки

- Выполнить `POST /api/bitrix/placement/unbind`

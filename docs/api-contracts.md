# API-контракты будущего NestJS backend

Документ описывает целевой REST API для Bitrix24-версии приложения. Контракты сформированы на базе текущих возможностей legacy-системы и требований к новой интеграции. Точные поля, отсутствующие в исходном README и явном коде, отмечены как `TODO` или `NEEDS_CONFIRMATION`.

## Общие правила

- Базовый префикс API: `/api`, `TODO` подтвердить
- Формат данных: `application/json`
- Аутентификация:
  - основной сценарий: Bitrix24 context + server-side токены портала
  - `NEEDS_CONFIRMATION`: нужна ли локальная авторизация для backoffice
- Все ответы с ошибками должны возвращать:
  - `code`
  - `message`
  - `details`, если применимо

## `GET /health`

### Назначение

Проверка доступности backend.

### Request

Без параметров.

### Response

```json
{
  "status": "ok",
  "service": "tariff-calculator-api",
  "timestamp": "2026-05-20T10:00:00.000Z"
}
```

### Ошибки

- `500 INTERNAL_SERVER_ERROR`

### TODO

- `TODO`: добавить проверку подключения к БД и Bitrix integration dependencies

## `POST /auth/login` или Bitrix-only auth

### Назначение

Локальная авторизация для внутренних пользователей, если она нужна.

### Request

```json
{
  "username": "admin",
  "password": "secret"
}
```

### Response

```json
{
  "accessToken": "jwt-or-session-token",
  "tokenType": "Bearer",
  "user": {
    "id": "uuid",
    "role": "ADMIN"
  }
}
```

### Ошибки

- `400 BAD_REQUEST`
- `401 UNAUTHORIZED`
- `403 FORBIDDEN`

### TODO

- `NEEDS_CONFIRMATION`: если приложение будет Bitrix-only, endpoint можно не реализовывать

## `GET /workspace/bootstrap`

### Назначение

Отдать frontend стартовые данные рабочего пространства.

### Request

Query params:

- `dealId`: optional
- `portalId`: optional, если не извлекается из токена

### Response

```json
{
  "currentUser": {
    "id": "uuid",
    "role": "MANAGER"
  },
  "portal": {
    "id": "uuid",
    "domain": "example.bitrix24.ru"
  },
  "dictionaries": {
    "containerTypes": [],
    "containerStatuses": [],
    "transportTypes": [],
    "locations": []
  },
  "features": {
    "xlsxImport": true,
    "pdfExport": true,
    "dadataLookup": true
  }
}
```

### Ошибки

- `401 UNAUTHORIZED`
- `403 FORBIDDEN`
- `500 INTERNAL_SERVER_ERROR`

### TODO

- `TODO`: финализировать состав preload-данных

## `GET /dictionaries/*`

### Назначение

Получение справочников для UI и калькулятора.

### Request

Поддерживаемые ресурсы:

- `GET /dictionaries/locations`
- `GET /dictionaries/container-types`
- `GET /dictionaries/container-statuses`
- `GET /dictionaries/transport-types`
- `GET /dictionaries/transport-templates`

Query params:

- `search`: optional
- `page`: optional
- `limit`: optional

### Response

```json
{
  "items": [],
  "total": 0
}
```

### Ошибки

- `400 BAD_REQUEST`
- `401 UNAUTHORIZED`
- `404 NOT_FOUND`

### TODO

- `NEEDS_CONFIRMATION`: нужен ли CRUD для всех справочников через этот же namespace

## `CRUD /tariffs/*`

### Назначение

Управление тарифами по типам.

### Поддерживаемые ресурсы

- `/tariffs/auto`
- `/tariffs/mainline`
- `/tariffs/sea-freight`
- `/tariffs/container-rent`
- `/tariffs/port-handling`
- `/tariffs/reefer-connection`
- `/tariffs/storage`
- `/tariffs/eaeu-status`

### Request

`GET /tariffs/:type`

Query params:

- `page`
- `limit`
- `direction`, если применимо
- `search`, если применимо

`POST /tariffs/:type`

Пример:

```json
{
  "direction": "KLD_OUT",
  "containerTypeId": 1,
  "containerStatusId": 2,
  "category": "LILO",
  "costNoVat": 10000
}
```

`PATCH /tariffs/:type/:id`

Частичное обновление записи.

`DELETE /tariffs/:type/:id`

Удаление или soft delete, `NEEDS_CONFIRMATION`.

### Response

```json
{
  "id": 123,
  "type": "sea-freight",
  "data": {}
}
```

Для списков:

```json
{
  "items": [],
  "total": 0
}
```

### Ошибки

- `400 BAD_REQUEST`
- `401 UNAUTHORIZED`
- `403 FORBIDDEN`
- `404 NOT_FOUND`
- `409 CONFLICT`

### TODO

- `TODO`: утвердить точные DTO для каждого типа тарифа

## `POST /api/tariffs/:type/upload`

### Назначение

Импорт тарифов из `XLSX`.

### Request

- `multipart/form-data`
- поле `file`
- optional поля:
  - `replaceExisting`
  - `dryRun`

### Response

```json
{
  "imported": 0,
  "updated": 0,
  "skipped": 0,
  "errors": []
}
```

### Ошибки

- `400 BAD_REQUEST`
- `415 UNSUPPORTED_MEDIA_TYPE`
- `422 UNPROCESSABLE_ENTITY`

### TODO

- `NEEDS_CONFIRMATION`: upload должен быть sync или async job

## `GET /api/tariffs/:type/export`

### Назначение

Экспорт тарифов в `XLSX`.

### Request

Query params по типу тарифа, если нужны фильтры.

### Response

Файл `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

### Ошибки

- `400 BAD_REQUEST`
- `404 NOT_FOUND`

### TODO

- `TODO`: стандартизовать имя файла и шаблон колонок

## `POST /calculator/calculate`

### Назначение

Выполнить расчет без обязательного сохранения либо с опцией автосохранения.

### Request

```json
{
  "dealId": "12345",
  "direction": "KLD_OUT",
  "transportTemplateId": 10,
  "counterpartyId": 50,
  "containerTypeId": 1,
  "containerStatusId": 2,
  "seaFreightCategory": "LILO",
  "firstMile": {
    "locationId": 100,
    "distanceKm": 120,
    "weightKg": 18000
  },
  "mainline": {
    "loadingRegion": "Калининградская область",
    "unloadingRegion": "Москва"
  },
  "lastMile": {
    "locationId": 200,
    "distanceKm": 45
  },
  "flags": {
    "isHeavy": false,
    "isDangerous": false,
    "isGenset": false,
    "withStorage": false,
    "withContainerRent": false
  },
  "margin": {
    "mode": "manual",
    "value": 0
  }
}
```

### Response

```json
{
  "logisticsCost": 0,
  "marginAmount": 0,
  "clientPrice": 0,
  "currency": "RUB",
  "lines": [],
  "warnings": [],
  "snapshot": {}
}
```

### Ошибки

- `400 BAD_REQUEST`
- `404 TARIFF_NOT_FOUND`
- `422 CALCULATION_RULE_ERROR`

### TODO

- `TODO`: финальная форма payload после интервью с бизнесом

## `POST /calculations`

### Назначение

Сохранить расчет.

### Request

```json
{
  "dealId": "12345",
  "portalId": "uuid",
  "direction": "KLD_OUT",
  "counterpartyId": 50,
  "transportTemplateId": 10,
  "logisticsCost": 0,
  "marginAmount": 0,
  "clientPrice": 0,
  "snapshot": {},
  "lines": []
}
```

### Response

```json
{
  "id": "uuid",
  "dealId": "12345",
  "createdAt": "2026-05-20T10:00:00.000Z"
}
```

### Ошибки

- `400 BAD_REQUEST`
- `401 UNAUTHORIZED`
- `409 CONFLICT`

### TODO

- `NEEDS_CONFIRMATION`: сохранение всегда отдельно от `/calculator/calculate` или возможно одним вызовом

## `GET /calculations/:id`

### Назначение

Получить сохраненный расчет по идентификатору.

### Request

Path params:

- `id`

### Response

```json
{
  "id": "uuid",
  "dealId": "12345",
  "direction": "KLD_OUT",
  "logisticsCost": 0,
  "marginAmount": 0,
  "clientPrice": 0,
  "lines": [],
  "snapshot": {}
}
```

### Ошибки

- `404 NOT_FOUND`
- `403 FORBIDDEN`

### TODO

- `TODO`: нужно ли включать audit trail

## `GET /calculations/by-deal/:dealId`

### Назначение

Получить список расчетов по сделке Битрикс24.

### Request

Path params:

- `dealId`

### Response

```json
{
  "items": [],
  "total": 0
}
```

### Ошибки

- `400 BAD_REQUEST`
- `403 FORBIDDEN`

### TODO

- `NEEDS_CONFIRMATION`: фильтрация должна учитывать `portalId`

## `GET /calculations/:id/export-pdf`

### Назначение

Сформировать и вернуть PDF расчета.

### Request

Path params:

- `id`

### Response

PDF файл.

### Ошибки

- `404 NOT_FOUND`
- `422 PDF_RENDER_ERROR`

### TODO

- `TODO`: сохранить ли PDF как файл с постоянной ссылкой

## `GET /counterparties/lookup-by-inn`

### Назначение

Найти контрагента по ИНН через внешний сервис.

### Request

Query params:

- `inn`

### Response

```json
{
  "name": "ООО Пример",
  "inn": "1234567890",
  "source": "dadata"
}
```

### Ошибки

- `400 BAD_REQUEST`
- `404 NOT_FOUND`
- `502 BAD_GATEWAY`

### TODO

- `NEEDS_CONFIRMATION`: нужен ли fallback на CRM Bitrix24

## `POST /bitrix/install`

### Назначение

Обработать установку приложения в портал Битрикс24.

### Request

Payload установки Bitrix24.

```json
{
  "AUTH_ID": "token",
  "REFRESH_ID": "refresh",
  "member_id": "member",
  "DOMAIN": "example.bitrix24.ru",
  "PLACEMENT": "CRM_DEAL_DETAIL_TAB"
}
```

### Response

```json
{
  "success": true
}
```

### Ошибки

- `400 BAD_REQUEST`
- `422 INSTALL_PAYLOAD_INVALID`

### TODO

- `TODO`: задокументировать полный install payload Bitrix24

## `GET /bitrix/deal-tab`

### Назначение

Handler, который открывается внутри вкладки сделки.

### Request

Query params или signed context от Bitrix24.

### Response

- HTML shell React-приложения или redirect на frontend entrypoint

### Ошибки

- `401 UNAUTHORIZED`
- `403 FORBIDDEN`

### TODO

- `NEEDS_CONFIRMATION`: frontend будет отдаваться через backend или CDN/static hosting

## `POST /bitrix/placement/bind`

### Назначение

Привязать placement `CRM_DEAL_DETAIL_TAB` к приложению.

### Request

```json
{
  "portalId": "uuid"
}
```

### Response

```json
{
  "success": true
}
```

### Ошибки

- `400 BAD_REQUEST`
- `409 ALREADY_BOUND`

### TODO

- `TODO`: определить, выполняется ли bind автоматически при install

## `POST /bitrix/placement/unbind`

### Назначение

Отвязать placement.

### Request

```json
{
  "portalId": "uuid"
}
```

### Response

```json
{
  "success": true
}
```

### Ошибки

- `400 BAD_REQUEST`
- `404 NOT_FOUND`

### TODO

- `TODO`: проверить необходимость endpoint для MVP

## `GET /bitrix/deal/:dealId`

### Назначение

Получить данные сделки из Bitrix24 для контекста калькулятора.

### Request

Path params:

- `dealId`

### Response

```json
{
  "id": "12345",
  "title": "Сделка",
  "fields": {}
}
```

### Ошибки

- `404 NOT_FOUND`
- `502 BITRIX_API_ERROR`

### TODO

- `TODO`: определить список обязательных полей сделки для чтения

## `POST /bitrix/deal/:dealId/save-calculation-result`

### Назначение

Записать результат расчета в пользовательские поля сделки Битрикс24.

### Request

```json
{
  "calculationId": "uuid",
  "logisticsCost": 0,
  "clientPrice": 0,
  "marginAmount": 0,
  "route": "KLD_OUT",
  "pdfUrl": "https://example.com/file.pdf"
}
```

### Response

```json
{
  "success": true,
  "updatedFields": [
    "UF_CRM_LOGISTICS_COST",
    "UF_CRM_CLIENT_PRICE",
    "UF_CRM_MARGIN",
    "UF_CRM_ROUTE",
    "UF_CRM_CALCULATION_ID",
    "UF_CRM_CALCULATION_PDF"
  ]
}
```

### Ошибки

- `400 BAD_REQUEST`
- `404 DEAL_NOT_FOUND`
- `502 BITRIX_API_ERROR`

### TODO

- `NEEDS_CONFIRMATION`: формат хранения ссылки на PDF

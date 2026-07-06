# Локальная установка Bitrix24 приложения

Этот документ описывает установку локального серверного приложения Bitrix24 для TariffCalcBitrix24 без входящего вебхука.

## Требуемые env backend

```env
APP_PUBLIC_URL=https://api.calc.dvtransport.ru
WEB_PUBLIC_URL=https://calc.dvtransport.ru
BITRIX_PORTAL_DOMAIN=novikgroup.bitrix24.ru
BITRIX_CLIENT_ID=local.XXXXXXXXXXXX
BITRIX_CLIENT_SECRET=XXXXXXXXXXXXXXXX
BITRIX_LOCATIONS_LIST_IBLOCK_TYPE_ID=lists
BITRIX_LOCATIONS_LIST_ID=123
BITRIX_LOCATIONS_CITY_FIELD=NAME
BITRIX_LOCATIONS_REGION_FIELD=PROPERTY_REGION
```

`BITRIX_WEBHOOK_URL` может оставаться пустым. Для `POST /bitrix/placement/bind` он больше не используется.

## Что делает install flow

`POST /bitrix/install` принимает install payload от Bitrix24 и сохраняет в PostgreSQL:

- `domain`
- `member_id`
- `access_token`
- `refresh_token`
- `expires / expires_at`

Поддерживаемые форматы входного payload:

- `DOMAIN`
- `domain`
- `SERVER_ENDPOINT`
- `client_endpoint`
- `member_id`
- `MEMBER_ID`
- `AUTH_ID`
- `REFRESH_ID`
- `AUTH_EXPIRES`
- `APPLICATION_SCOPE`
- `auth.access_token`
- `auth.refresh_token`
- `auth.expires`
- `auth.domain`
- `auth.member_id`

Если `DOMAIN/domain` отсутствует, backend пытается определить реальный портал в таком порядке:

- `SERVER_ENDPOINT`, если там домен портала
- `client_endpoint`
- `auth.domain`
- HTTP headers `referer` / `origin`
- `BITRIX_PORTAL_DOMAIN`

Пример:

```text
SERVER_ENDPOINT=https://novikgroup.bitrix24.ru/rest/
domain=novikgroup.bitrix24.ru
```

Поддерживаются варианты `SERVER_ENDPOINT`:

- с `https://`
- без схемы
- со слешем на конце

`oauth.bitrix24.tech` не сохраняется как `portalDomain`. Если install payload приходит через oauth-host, backend берет реальный домен из других источников или использует `BITRIX_PORTAL_DOMAIN`.

Токены сохраняются сервером и затем используются для:

- `POST /bitrix/placement/bind`
- `POST /bitrix/placement/unbind`
- последующего refresh access token через `https://oauth.bitrix.info/oauth/token/`

## Проверка статуса

`GET /bitrix/placement/status` возвращает:

- `clientIdConfigured`
- `clientSecretConfigured`
- `portalDomain`
- `savedPortalExists`
- `accessTokenExists`
- `refreshTokenExists`
- `tokenExpiresAt`
- `applicationScope`
- `placementScopeIncluded`
- `listsScopeIncluded`
- `webhookConfigured`
- `webhookUsedForPlacementBind`

Если приложение еще не установлено и токенов нет, bind endpoint вернет:

```json
{
  "message": "Bitrix app is not installed yet. Open local app install URL in Bitrix24.",
  "error": "Bad Request",
  "statusCode": 400
}
```

Для синхронизации справочника локаций backend также проверяет scope `lists`. Если он не выдан, `POST /dictionaries/locations/sync/bitrix` вернет:

```json
{
  "message": "Добавьте право lists в локальном приложении Bitrix24 и переустановите приложение.",
  "error": "Bad Request",
  "statusCode": 400
}
```

Если install payload неполный, backend возвращает безопасную диагностику без значений токенов:

- `receivedKeys`
- `receivedAuthKeys`
- `missingRequiredFields`

## Привязка вкладки сделки

`POST /bitrix/placement/bind` использует сохраненный OAuth `access_token` локального приложения и вызывает:

- `PLACEMENT=CRM_DEAL_DETAIL_TAB`
- `HANDLER=https://api.calc.dvtransport.ru/bitrix/deal-tab`
- `TITLE=Тарифный калькулятор`

Если `access_token` истек, backend автоматически пытается обновить его по `refresh_token`.

Перед `placement.bind` backend проверяет, что у установленного приложения есть scope `placement`.

Если scope отсутствует или Bitrix возвращает ошибку прав `higher privileges than provided by the access token`, backend возвращает понятную ошибку:

```json
{
  "message": "В локальном приложении Bitrix24 нужно добавить scope placement / Встраивание приложений и переустановить приложение",
  "error": "Bad Request",
  "statusCode": 400
}
```

## После деплоя

Проверка:

```bash
curl https://api.calc.dvtransport.ru/bitrix/placement/status
curl -X POST https://api.calc.dvtransport.ru/bitrix/placement/bind
curl -X POST https://api.calc.dvtransport.ru/dictionaries/locations/sync/bitrix
```

HTML-страница диагностики:

```text
https://api.calc.dvtransport.ru/bitrix/install
```

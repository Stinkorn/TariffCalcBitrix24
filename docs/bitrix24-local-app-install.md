# Локальная установка Bitrix24 приложения

Этот документ описывает установку локального серверного приложения Bitrix24 для TariffCalcBitrix24 без входящего вебхука.

## Требуемые env backend

```env
APP_PUBLIC_URL=https://api.calc.dvtransport.ru
WEB_PUBLIC_URL=https://calc.dvtransport.ru
BITRIX_PORTAL_DOMAIN=novikgroup.bitrix24.ru
BITRIX_CLIENT_ID=local.XXXXXXXXXXXX
BITRIX_CLIENT_SECRET=XXXXXXXXXXXXXXXX
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
- `member_id`
- `MEMBER_ID`
- `AUTH_ID`
- `REFRESH_ID`
- `AUTH_EXPIRES`
- `auth.access_token`
- `auth.refresh_token`
- `auth.expires`
- `auth.domain`
- `auth.member_id`

Если `DOMAIN/domain` отсутствует, backend извлекает домен портала из `SERVER_ENDPOINT`.

Пример:

```text
SERVER_ENDPOINT=https://novikgroup.bitrix24.ru/rest/
domain=novikgroup.bitrix24.ru
```

Поддерживаются варианты `SERVER_ENDPOINT`:

- с `https://`
- без схемы
- со слешем на конце

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

## После деплоя

Проверка:

```bash
curl https://api.calc.dvtransport.ru/bitrix/placement/status
curl -X POST https://api.calc.dvtransport.ru/bitrix/placement/bind
```

HTML-страница диагностики:

```text
https://api.calc.dvtransport.ru/bitrix/install
```

# Справочник локаций

## Bitrix24 Universal Lists

Для справочника локаций используйте Universal List в Bitrix24:

- название списка: `Локации калькулятора`
- `NAME`: населенный пункт
- `PROPERTY_REGION`: субъект РФ

В правах локального приложения должен быть scope `lists`. После изменения прав приложение нужно переустановить.

`GET /bitrix/placement/status` показывает:

- `applicationScope`
- `placementScopeIncluded`
- `listsScopeIncluded`

Если `listsScopeIncluded=false`, endpoint синхронизации вернет ошибку:

```json
{
  "message": "Добавьте право lists в локальном приложении Bitrix24 и переустановите приложение.",
  "error": "Bad Request",
  "statusCode": 400
}
```

## Env

Добавьте в backend env:

```env
BITRIX_LOCATIONS_LIST_IBLOCK_TYPE_ID=lists
BITRIX_LOCATIONS_LIST_ID=
BITRIX_LOCATIONS_CITY_FIELD=NAME
BITRIX_LOCATIONS_REGION_FIELD=PROPERTY_REGION
```

`BITRIX_LOCATIONS_LIST_ID` заполняется после создания списка в Bitrix24.

## Как узнать ID списка

1. Создайте список `Локации калькулятора`.
2. Добавьте пользовательское поле `PROPERTY_REGION`.
3. Откройте список в Bitrix24 и найдите его `IBLOCK_ID` в URL или через административный интерфейс списка.
4. Запишите значение в `BITRIX_LOCATIONS_LIST_ID`.

## API

Доступные endpoints:

- `GET /dictionaries/locations`
- `GET /dictionaries/locations?search=Кал`
- `GET /dictionaries/bootstrap`
- `POST /dictionaries/locations/seed`
- `POST /dictionaries/locations/sync/bitrix`

Синхронизация из Bitrix24:

```bash
curl -X POST http://localhost:9099/dictionaries/locations/sync/bitrix
curl -X POST https://api.calc.dvtransport.ru/dictionaries/locations/sync/bitrix
```

Проверка словаря:

```bash
curl http://localhost:9099/dictionaries/locations
curl "http://localhost:9099/dictionaries/locations?search=Кал"
curl https://api.calc.dvtransport.ru/dictionaries/locations
curl "https://api.calc.dvtransport.ru/dictionaries/locations?search=Кал"
```

Seed базовых городов:

```bash
curl -X POST http://localhost:9099/dictionaries/locations/seed
curl -X POST https://api.calc.dvtransport.ru/dictionaries/locations/seed
```

## Поведение sync

Backend:

- берет сохраненный OAuth `access_token` портала
- при необходимости обновляет токен через `refresh_token`
- вызывает `lists.element.get`
- читает `NAME` как `city`
- читает `PROPERTY_REGION` как `region`
- использует `SORT` как `sortOrder`
- использует `ACTIVE` как `isActive`
- не логирует токены

Синхронизация:

- создает отсутствующие записи
- обновляет найденные по `bitrixListId + bitrixElementId`
- если Bitrix-привязки нет, пытается сопоставить по `city + region`
- не удаляет записи, которых больше нет в Bitrix24
- сохраняет `source=bitrix` для синхронизированных строк

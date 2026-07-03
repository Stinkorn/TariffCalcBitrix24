# Примеры расчетов

Ниже приведены шаблоны примеров для последующего заполнения реальными значениями после уточнения бизнес-формул и тарифов.

## Пример 1. `KLD_OUT` обычный контейнер

### Входные данные

- `direction`: `KLD_OUT`
- `containerType`: `TODO`
- `containerStatus`: `TODO`
- `seaFreightCategory`: `LILO`
- `firstMile.distanceKm`: `TODO`
- `lastMile.distanceKm`: `TODO`
- дополнительные флаги: `TODO`

### Найденные тарифы

- авто: `TODO`
- магистраль: `TODO`
- морской фрахт: `TODO`

### Строки расчета

- `FIRST_MILE`: `TODO`
- `MAINLINE`: `TODO`
- `LAST_MILE`: `TODO`

### Себестоимость

- `TODO`

### Маржа

- `TODO`

### Цена клиенту

- `TODO`

### Ожидаемый JSON response

```json
{
  "direction": "KLD_OUT",
  "logisticsCost": "TODO",
  "marginAmount": "TODO",
  "clientPrice": "TODO",
  "lines": [
    {
      "lineType": "FIRST_MILE",
      "amount": "TODO"
    },
    {
      "lineType": "MAINLINE",
      "amount": "TODO"
    },
    {
      "lineType": "LAST_MILE",
      "amount": "TODO"
    }
  ]
}
```

### TODO: заполнить реальные цифры

## Пример 2. `KLD_IN` обычный контейнер

### Входные данные

- `direction`: `KLD_IN`
- `containerType`: `TODO`
- `containerStatus`: `TODO`
- `seaFreightCategory`: `LILO`
- `firstMile.distanceKm`: `TODO`
- `lastMile.distanceKm`: `TODO`
- дополнительные флаги: `TODO`

### Найденные тарифы

- авто: `TODO`
- магистраль: `TODO`
- морской фрахт: `TODO`

### Строки расчета

- `FIRST_MILE`: `TODO`
- `MAINLINE`: `TODO`
- `LAST_MILE`: `TODO`

### Себестоимость

- `TODO`

### Маржа

- `TODO`

### Цена клиенту

- `TODO`

### Ожидаемый JSON response

```json
{
  "direction": "KLD_IN",
  "logisticsCost": "TODO",
  "marginAmount": "TODO",
  "clientPrice": "TODO",
  "lines": []
}
```

### TODO: заполнить реальные цифры

## Пример 3. `KLD_OUT` реф-контейнер

### Входные данные

- `direction`: `KLD_OUT`
- `containerType`: `TODO` с признаком реф-контейнера
- `containerStatus`: `TODO`
- `seaFreightCategory`: `LILO`
- `isGenset`: `TODO`
- `reeferConnectionOperation`: `TODO`

### Найденные тарифы

- авто: `TODO`
- морской фрахт: `TODO`
- подключение реф-контейнера: `TODO`

### Строки расчета

- `FIRST_MILE`: `TODO`
- `MAINLINE`: `TODO`
- `REEFER_CONNECTION`: `TODO`
- `LAST_MILE`: `TODO`

### Себестоимость

- `TODO`

### Маржа

- `TODO`

### Цена клиенту

- `TODO`

### Ожидаемый JSON response

```json
{
  "direction": "KLD_OUT",
  "flags": {
    "isGenset": "TODO"
  },
  "logisticsCost": "TODO",
  "marginAmount": "TODO",
  "clientPrice": "TODO",
  "lines": []
}
```

### TODO: заполнить реальные цифры

## Пример 4. Маршрут с хранением

### Входные данные

- `direction`: `TODO`
- `containerType`: `TODO`
- `containerStatus`: `TODO`
- `withStorage`: `true`
- `storageDays`: `TODO`

### Найденные тарифы

- базовые этапы: `TODO`
- хранение: `TODO`

### Строки расчета

- `FIRST_MILE`: `TODO`
- `MAINLINE`: `TODO`
- `STORAGE`: `TODO`
- `LAST_MILE`: `TODO`

### Себестоимость

- `TODO`

### Маржа

- `TODO`

### Цена клиенту

- `TODO`

### Ожидаемый JSON response

```json
{
  "withStorage": true,
  "storageDays": "TODO",
  "logisticsCost": "TODO",
  "marginAmount": "TODO",
  "clientPrice": "TODO",
  "lines": [
    {
      "lineType": "STORAGE",
      "amount": "TODO"
    }
  ]
}
```

### TODO: заполнить реальные цифры

## Пример 5. Маршрут с морским фрахтом `FIOS`

### Входные данные

- `direction`: `TODO`
- `containerType`: `TODO`
- `containerStatus`: `TODO`
- `seaFreightCategory`: `FIOS`

### Найденные тарифы

- авто: `TODO`
- морской фрахт `FIOS`: `TODO`
- ПРР в порту: `TODO`

### Строки расчета

- `FIRST_MILE`: `TODO`
- `SEA_FREIGHT`: `TODO`
- `PORT_HANDLING`: `TODO`
- `LAST_MILE`: `TODO`

### Себестоимость

- `TODO`

### Маржа

- `TODO`

### Цена клиенту

- `TODO`

### Ожидаемый JSON response

```json
{
  "seaFreightCategory": "FIOS",
  "logisticsCost": "TODO",
  "marginAmount": "TODO",
  "clientPrice": "TODO",
  "lines": [
    {
      "lineType": "SEA_FREIGHT",
      "amount": "TODO"
    },
    {
      "lineType": "PORT_HANDLING",
      "amount": "TODO"
    }
  ]
}
```

### TODO: заполнить реальные цифры

# Модель данных будущего приложения

Документ описывает целевую модель данных для `React + NestJS + PostgreSQL + Prisma` версии приложения. Часть полей подтверждена legacy-моделями, часть дана как проектная структура с обязательной пометкой `TODO` или `NEEDS_CONFIRMATION`.

## User

### Назначение

Пользователь системы. В новой версии может представлять пользователя Битрикс24, локального администратора или технического пользователя интеграции.

### Поля

- `id`: UUID или bigint, `TODO` выбрать формат
- `bitrixUserId`: string, `NEEDS_CONFIRMATION` нужен ли
- `email`: string, nullable
- `fullName`: string, nullable
- `username`: string, nullable
- `passwordHash`: string, nullable, только если нужна локальная авторизация
- `isActive`: boolean
- `roleId`: FK -> `Role`
- `portalId`: FK -> `BitrixPortal`, nullable
- `createdAt`
- `updatedAt`

### Связи

- many-to-one -> `Role`
- many-to-one -> `BitrixPortal`
- one-to-many -> `Calculation`

### Индексы

- unique по `username`, если локальная авторизация включена
- index по `bitrixUserId`
- index по `portalId`

### TODO

- `NEEDS_CONFIRMATION`: нужен ли отдельный `User`, если доступ полностью делегируется Bitrix24

## Role

### Назначение

Роль пользователя.

### Поля

- `id`
- `code`: `ADMIN`, `LEAD`, `MANAGER`, `TODO` подтвердить список
- `name`
- `description`

### Связи

- one-to-many -> `User`

### Индексы

- unique по `code`

### TODO

- `NEEDS_CONFIRMATION`: будет ли RBAC внутри приложения или только права Битрикс24

## BitrixPortal

### Назначение

Подключенный портал Битрикс24.

### Поля

- `id`
- `portalCode`: string
- `memberId`: string
- `domain`: string
- `appStatus`: string
- `installedAt`
- `uninstalledAt`: nullable
- `createdAt`
- `updatedAt`

### Связи

- one-to-many -> `BitrixToken`
- one-to-many -> `User`
- one-to-many -> `Calculation`

### Индексы

- unique по `memberId`
- unique по `domain`

### TODO

- `TODO`: список технических полей install payload из Bitrix24

## BitrixToken

### Назначение

Хранение OAuth/access token данных портала.

### Поля

- `id`
- `portalId`: FK -> `BitrixPortal`
- `accessToken`
- `refreshToken`
- `expiresAt`
- `scope`
- `applicationToken`: nullable
- `createdAt`
- `updatedAt`

### Связи

- many-to-one -> `BitrixPortal`

### Индексы

- index по `portalId`
- index по `expiresAt`

### TODO

- `NEEDS_CONFIRMATION`: требования по шифрованию токенов на уровне БД

## Location

### Назначение

Справочник географических точек.

### Поля

- `id`
- `city`
- `region`
- `country`: `TODO`
- `kmToPort`: integer, nullable
- `bitrixExternalId`: nullable
- `createdAt`
- `updatedAt`

### Связи

- one-to-many -> `TransportTemplate` как `fromLocation`
- one-to-many -> `TransportTemplate` как `toLocation`
- one-to-many -> `CalculationLine` как `loadingLocation`
- one-to-many -> `CalculationLine` как `unloadingLocation`

### Индексы

- composite unique по `city + region`
- index по `region`

### TODO

- `NEEDS_CONFIRMATION`: нужен ли отдельный код ФИАС/КЛАДР

## TransportTemplate

### Назначение

Шаблон маршрута для быстрого выбора типовой схемы перевозки.

### Поля

- `id`
- `name`
- `fromLocationId`: FK -> `Location`
- `toLocationId`: FK -> `Location`
- `direction`: `KLD_OUT` / `KLD_IN`
- `description`: nullable
- `isActive`
- `createdAt`
- `updatedAt`

### Связи

- many-to-one -> `Location` как `fromLocation`
- many-to-one -> `Location` как `toLocation`
- one-to-many -> `Calculation`

### Индексы

- unique по `name + fromLocationId + toLocationId`
- index по `direction`

### TODO

- `NEEDS_CONFIRMATION`: хранить ли внутри шаблона преднастроенные этапы маршрута

## ContainerType

### Назначение

Справочник типов контейнеров.

### Поля

- `id`
- `name`
- `code`: `TODO`
- `isReefer`: boolean, `TODO`
- `createdAt`
- `updatedAt`

### Связи

- one-to-many -> тарифные сущности
- one-to-many -> `CalculationLine`

### Индексы

- unique по `name`

### TODO

- `NEEDS_CONFIRMATION`: нужно ли отдельное поле вместимости/размера

## ContainerStatus

### Назначение

Справочник статусов контейнеров.

### Поля

- `id`
- `name`
- `code`: `TODO`
- `createdAt`
- `updatedAt`

### Связи

- one-to-many -> `SeaFreightTariff`
- one-to-many -> `StorageTariff`
- one-to-many -> `CalculationLine`

### Индексы

- unique по `name`

### TODO

- `TODO`: формализовать допустимые статусы

## TransportType

### Назначение

Справочник видов транспорта/этапов.

### Поля

- `id`
- `name`
- `code`
- `createdAt`
- `updatedAt`

### Связи

- one-to-many -> `CalculationLine`

### Индексы

- unique по `code`

### TODO

- `NEEDS_CONFIRMATION`: список кодов транспорта для новой версии

## Tariff

### Назначение

Базовая абстракция тарифа. Может быть реализована как общая таблица с discriminator либо как conceptual entity поверх специализированных таблиц.

### Поля

- `id`
- `type`
- `direction`: nullable
- `validFrom`: nullable
- `validTo`: nullable, `TODO`
- `currency`: nullable
- `isActive`
- `sourceFileId`: nullable
- `createdAt`
- `updatedAt`

### Связи

- one-to-one / one-to-many -> специализированные тарифные сущности

### Индексы

- index по `type`
- index по `direction`

### TODO

- `NEEDS_CONFIRMATION`: нужен ли физический базовый `Tariff` в Prisma или только логическое понятие

## AutoTariff

### Назначение

Автотариф для плеч Калининград / Москва / Санкт-Петербург.

### Поля

- `id`
- `scope`: `KALININGRAD` / `MOSCOW` / `SPB`
- `validFrom`
- `minKm`
- `maxKm`
- `isHeavy`
- `costNoVat`
- `currency`: `TODO`
- `createdAt`
- `updatedAt`

### Связи

- optional many-to-one -> `Tariff`
- one-to-many -> `CalculationLine`

### Индексы

- composite index по `scope + validFrom`
- composite index по `scope + minKm + maxKm + isHeavy`

### TODO

- `NEEDS_CONFIRMATION`: хранить ли `validTo`

## MainlineTariff

### Назначение

Магистральный тариф на загрузку или выгрузку.

### Поля

- `id`
- `operationType`: `LOAD` / `UNLOAD`
- `region`
- `city`: nullable
- `surrenderPlace`
- `costNoVat`
- `currency`: `TODO`
- `createdAt`
- `updatedAt`

### Связи

- optional many-to-one -> `Tariff`
- one-to-many -> `CalculationLine`

### Индексы

- composite index по `operationType + region + city`

### TODO

- `NEEDS_CONFIRMATION`: город может быть null как fallback на регион

## SeaFreightTariff

### Назначение

Тариф морского фрахта.

### Поля

- `id`
- `category`: `LILO` / `FIOS`
- `direction`
- `containerTypeId`
- `containerStatusId`
- `costNoVat`
- `currency`
- `createdAt`
- `updatedAt`

### Связи

- many-to-one -> `ContainerType`
- many-to-one -> `ContainerStatus`
- one-to-many -> `CalculationLine`

### Индексы

- unique по `category + direction + containerTypeId + containerStatusId`

### TODO

- `NEEDS_CONFIRMATION`: нужна ли дополнительная привязка к линии/оператору

## ContainerRentTariff

### Назначение

Тариф аренды контейнера.

### Поля

- `id`
- `containerTypeId`
- `cost`
- `currency`
- `billingUnit`: `TODO`
- `createdAt`
- `updatedAt`

### Связи

- many-to-one -> `ContainerType`
- one-to-many -> `CalculationLine`

### Индексы

- unique по `containerTypeId`

### TODO

- `NEEDS_CONFIRMATION`: фиксированная ставка или ставка за день

## PortHandlingTariff

### Назначение

ПРР в порту.

### Поля

- `id`
- `region`
- `containerTypeId`
- `costNoVat`
- `currency`
- `createdAt`
- `updatedAt`

### Связи

- many-to-one -> `ContainerType`
- one-to-many -> `CalculationLine`

### Индексы

- unique по `region + containerTypeId`

### TODO

- `TODO`: определить необходимость отдельного `portCode`

## ReeferConnectionTariff

### Назначение

Тариф на подключение реф-контейнера.

### Поля

- `id`
- `city`
- `operation`
- `costNoVat`
- `currency`
- `createdAt`
- `updatedAt`

### Связи

- one-to-many -> `CalculationLine`

### Индексы

- unique по `city + operation`

### TODO

- `NEEDS_CONFIRMATION`: нормализовать список `operation`

## StorageTariff

### Назначение

Тариф хранения контейнера.

### Поля

- `id`
- `direction`
- `containerTypeId`
- `containerStatusId`
- `costNoVat`
- `billingUnit`: `DAY` / `FIXED`, `TODO`
- `createdAt`
- `updatedAt`

### Связи

- many-to-one -> `ContainerType`
- many-to-one -> `ContainerStatus`
- one-to-many -> `CalculationLine`

### Индексы

- unique по `direction + containerTypeId + containerStatusId`

### TODO

- `NEEDS_CONFIRMATION`: единица тарифа хранения

## EaeuStatusTariff

### Назначение

Тариф по условию/статусу ЕАЭС.

### Поля

- `id`
- `conditionCode`: `SPECIAL` / `STANDARD`
- `label`
- `cost`
- `currency`
- `createdAt`
- `updatedAt`

### Связи

- one-to-many -> `Calculation`
- one-to-many -> `CalculationLine`

### Индексы

- unique по `conditionCode`

### TODO

- `NEEDS_CONFIRMATION`: полный перечень кодов условий

## Calculation

### Назначение

Шапка сохраненного расчета.

### Поля

- `id`
- `portalId`: FK -> `BitrixPortal`
- `userId`: FK -> `User`, nullable
- `dealId`: string
- `counterpartyId`: FK -> `Counterparty`, nullable
- `transportTemplateId`: FK -> `TransportTemplate`, nullable
- `direction`
- `paymentDeferralDays`: integer, default 0
- `eaeuStatusCode`: nullable
- `logisticsCost`
- `marginAmount`
- `marginPercent`: nullable
- `clientPrice`
- `currency`: `TODO`
- `routeSummary`: text/json
- `snapshotJson`: jsonb
- `pdfFileUrl`: nullable
- `createdAt`
- `updatedAt`

### Связи

- many-to-one -> `BitrixPortal`
- many-to-one -> `User`
- many-to-one -> `Counterparty`
- many-to-one -> `TransportTemplate`
- one-to-many -> `CalculationLine`

### Индексы

- index по `dealId`
- index по `portalId + dealId`
- index по `createdAt`

### TODO

- `NEEDS_CONFIRMATION`: формат `dealId` и единая политика валют

## CalculationLine

### Назначение

Детализация расчета по этапам и тарифным блокам.

### Поля

- `id`
- `calculationId`: FK -> `Calculation`
- `lineType`: `FIRST_MILE`, `MAINLINE`, `LAST_MILE`, `SEA_FREIGHT`, `STORAGE`, `PORT_HANDLING`, `REEFER_CONNECTION`, `CONTAINER_RENT`, `EAEU_STATUS`, `TODO`
- `stageRole`: nullable
- `transportTypeId`: FK -> `TransportType`, nullable
- `loadingLocationId`: FK -> `Location`, nullable
- `unloadingLocationId`: FK -> `Location`, nullable
- `containerTypeId`: FK -> `ContainerType`, nullable
- `containerStatusId`: FK -> `ContainerStatus`, nullable
- `distanceKm`: nullable
- `weightKg`: nullable
- `isHeavy`
- `isDangerous`
- `isGenset`
- `seaFreightCategory`: nullable
- `appliedTariffType`
- `appliedTariffId`
- `formulaText`: nullable
- `quantity`: nullable
- `unitPrice`: nullable
- `amount`
- `sortOrder`
- `metaJson`: jsonb, nullable
- `createdAt`
- `updatedAt`

### Связи

- many-to-one -> `Calculation`
- many-to-one -> `TransportType`
- many-to-one -> `Location` как loading/unloading
- many-to-one -> `ContainerType`
- many-to-one -> `ContainerStatus`

### Индексы

- index по `calculationId + sortOrder`
- index по `appliedTariffType + appliedTariffId`

### TODO

- `NEEDS_CONFIRMATION`: нужна ли отдельная таблица для extra services из legacy-версии

## Counterparty

### Назначение

Контрагент, связанный с расчетом.

### Поля

- `id`
- `portalId`: FK -> `BitrixPortal`
- `name`
- `inn`
- `isVip`
- `bitrixCompanyId`: nullable
- `source`: `MANUAL` / `DADATA` / `BITRIX`, `TODO`
- `createdAt`
- `updatedAt`

### Связи

- many-to-one -> `BitrixPortal`
- one-to-many -> `Calculation`

### Индексы

- unique по `portalId + inn`
- index по `name`

### TODO

- `NEEDS_CONFIRMATION`: хранить ли контрагента отдельно, если он уже есть в CRM

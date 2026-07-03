# Промпты для Codex

## Название

Создать monorepo

### Цель

Сгенерировать каркас проекта для `React + NestJS + PostgreSQL + Prisma`.

### Инструкция для Codex

Создай monorepo для проекта TariffCalculator Bitrix24. Нужны `apps/web` на React + TypeScript и `apps/api` на NestJS + TypeScript, плюс общий пакет `packages/shared`. Добавь базовые npm scripts для dev/build/test. Не реализуй бизнес-логику, только инфраструктурный каркас и README по запуску.

### Ожидаемый результат

- рабочий monorepo
- frontend и backend запускаются локально
- есть общие пакеты и базовые конфиги

### Проверка

- `npm install`
- `npm run dev`
- `npm run build`

## Название

Настроить NestJS config

### Цель

Добавить конфигурационный слой backend.

### Инструкция для Codex

Настрой `ConfigModule` в NestJS приложении TariffCalculator. Раздели конфигурацию на `app`, `database`, `bitrix`, `auth`, `files`. Добавь валидацию env-переменных и пример `.env.example`.

### Ожидаемый результат

- типизированная конфигурация
- централизованный доступ к env

### Проверка

- backend стартует с валидным `.env`
- backend падает с понятной ошибкой при отсутствии обязательных переменных

## Название

Настроить Prisma

### Цель

Создать Prisma schema и базовые миграции.

### Инструкция для Codex

Настрой Prisma для PostgreSQL в TariffCalculator Bitrix24. Создай стартовую schema для сущностей `User`, `Role`, `BitrixPortal`, `BitrixToken`, `Location`, `TransportTemplate`, `ContainerType`, `ContainerStatus`, `TransportType`, `Calculation`, `CalculationLine`, `Counterparty`. Поля с неясной бизнес-логикой пометь комментариями `TODO`.

### Ожидаемый результат

- `prisma/schema.prisma`
- миграция initial
- Prisma client подключен к NestJS

### Проверка

- `npm run prisma:generate`
- `npm run prisma:migrate`

## Название

Создать BitrixModule

### Цель

Подготовить слой интеграции с облачным Битрикс24.

### Инструкция для Codex

Создай `BitrixModule` для NestJS. Реализуй сервисы и контроллеры для `/bitrix/install`, `/bitrix/deal-tab`, `/bitrix/placement/bind`, `/bitrix/placement/unbind`, `/bitrix/deal/:dealId`, `/bitrix/deal/:dealId/save-calculation-result`. Используй заглушки там, где нет подтвержденного формата payload, и пометь их `TODO`.

### Ожидаемый результат

- модуль Bitrix интегрирован в backend
- есть DTO, service и controller

### Проверка

- endpoints доступны
- install flow сохраняет данные портала в БД

## Название

Создать React DealCalculatorPage

### Цель

Собрать основную страницу калькулятора внутри сделки.

### Инструкция для Codex

Создай React-страницу `DealCalculatorPage` для TariffCalculator Bitrix24. На странице должны быть блоки входных параметров маршрута, тарифных признаков, результатов расчета и истории расчетов по сделке. Используй TypeScript и API hooks. Не заполняй реальные формулы, если они не описаны, оставляй `TODO`.

### Ожидаемый результат

- страница открывается в веб-приложении
- есть базовый UX калькулятора

### Проверка

- страница рендерится без ошибок
- данные bootstrap подгружаются

## Название

Реализовать Bitrix placement

### Цель

Сделать открытие React-приложения во вкладке сделки.

### Инструкция для Codex

Реализуй интеграцию placement `CRM_DEAL_DETAIL_TAB` для TariffCalculator Bitrix24. Нужно корректно получать context от Bitrix24, извлекать `dealId` из `PLACEMENT_OPTIONS`, передавать его в frontend и загружать данные сделки. Не подменяй неизвестный payload выдуманными полями, используй `TODO` и адаптерный слой.

### Ожидаемый результат

- приложение открывается из сделки
- `dealId` доступен frontend и backend

### Проверка

- вкладка сделки открывает приложение
- по логам видно корректное извлечение `dealId`

## Название

Реализовать CalculationsModule

### Цель

Добавить хранение и выдачу расчетов.

### Инструкция для Codex

Создай `CalculationsModule` в NestJS с endpoint'ами `POST /calculations`, `GET /calculations/:id`, `GET /calculations/by-deal/:dealId`, `GET /calculations/:id/export-pdf`. Реализуй Prisma repository, DTO и базовую валидацию. Историю расчетов нужно фильтровать по `portalId`.

### Ожидаемый результат

- расчеты сохраняются и читаются
- есть поиск по сделке

### Проверка

- API тест на создание и чтение расчета
- список по сделке возвращает только записи текущего портала

## Название

Реализовать CalculatorModule

### Цель

Добавить движок расчета.

### Инструкция для Codex

Создай `CalculatorModule` в NestJS и endpoint `POST /calculator/calculate`. Реализуй pipeline: валидировать входные данные, определить направление маршрута, подобрать тарифные блоки, сформировать строки расчета, посчитать себестоимость, маржу и цену клиенту. Если точная формула неизвестна, оставляй `TODO` в коде и не придумывай бизнес-правила.

### Ожидаемый результат

- backend возвращает структуру расчета
- строки расчета содержат ссылки на примененные тарифы

### Проверка

- unit тесты на подбор тарифов
- integration тест на успешный расчет с моковыми тарифами

## Название

Реализовать TariffsModule

### Цель

Добавить CRUD и типизацию тарифов.

### Инструкция для Codex

Создай `TariffsModule` в NestJS для работы с тарифами `AutoTariff`, `MainlineTariff`, `SeaFreightTariff`, `ContainerRentTariff`, `PortHandlingTariff`, `ReeferConnectionTariff`, `StorageTariff`, `EaeuStatusTariff`. Реализуй CRUD endpoints и общий слой маппинга DTO -> Prisma.

### Ожидаемый результат

- все типы тарифов доступны по REST
- есть фильтрация и валидация

### Проверка

- smoke тесты на list/create/update/delete

## Название

Реализовать XLSX import/export

### Цель

Перенести файловые операции с тарифами.

### Инструкция для Codex

Реализуй upload/export `XLSX` для тарифов. Нужны endpoints `POST /api/tariffs/:type/upload` и `GET /api/tariffs/:type/export`. Добавь валидацию структуры файла, отчеты об ошибках импорта и тесты на один тип тарифа как базовый шаблон для остальных.

### Ожидаемый результат

- импорт и экспорт работают хотя бы для одного полного типа тарифа
- архитектура расширяема на остальные типы

### Проверка

- тест на upload валидного файла
- тест на export и обратную проверку колонок

## Название

Реализовать PDF export

### Цель

Добавить выгрузку расчета в PDF.

### Инструкция для Codex

Реализуй `GET /calculations/:id/export-pdf` для TariffCalculator Bitrix24. PDF должен включать шапку сделки, маршрут, строки расчета, себестоимость, маржу и цену клиенту. Если фирменный шаблон неизвестен, сделай аккуратный технический шаблон и пометь спорные зоны `TODO`.

### Ожидаемый результат

- PDF формируется сервером
- PDF можно открыть по endpoint

### Проверка

- integration тест на `200 OK`
- файл не пустой и содержит основные поля расчета

## Название

Реализовать DaData lookup

### Цель

Добавить поиск контрагента по ИНН.

### Инструкция для Codex

Реализуй endpoint `GET /counterparties/lookup-by-inn` и сервис интеграции с DaData. Добавь таймауты, обработку ошибок внешнего API и маппинг ответа в минимальный внутренний DTO. Секреты и токены вынеси в конфиг.

### Ожидаемый результат

- по ИНН возвращается нормализованная карточка контрагента

### Проверка

- unit тест на маппинг ответа
- integration тест с mocked HTTP

## Название

Реализовать запись результата в сделку

### Цель

Сохранять итог расчета в пользовательские поля CRM сделки.

### Инструкция для Codex

Реализуй сервис и endpoint `POST /bitrix/deal/:dealId/save-calculation-result`. Нужно записывать `UF_CRM_LOGISTICS_COST`, `UF_CRM_CLIENT_PRICE`, `UF_CRM_MARGIN`, `UF_CRM_ROUTE`, `UF_CRM_CALCULATION_ID`, `UF_CRM_CALCULATION_PDF`. Не придумывай другие реальные поля Bitrix24. Если типы полей неизвестны, оставляй `TODO`.

### Ожидаемый результат

- после расчета сделка обновляется через Bitrix24 REST API

### Проверка

- mocked integration test на вызов Bitrix API
- в логах виден payload обновления сделки

## Название

Добавить тесты

### Цель

Закрыть критический функционал автотестами.

### Инструкция для Codex

Добавь тесты для TariffCalculator Bitrix24: unit для калькулятора, integration для NestJS API, и e2e smoke для сценария открытия приложения из сделки, расчета и сохранения результата. Там, где Bitrix24 недоступен, используй моки и фикстуры.

### Ожидаемый результат

- есть минимальное тестовое покрытие критического пути

### Проверка

- `npm run test`
- `npm run test:e2e`

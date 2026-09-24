# TariffCalc — Calculator UI specification

Source: Figma file `DcpXgUJnjlAYQzsB6U1N4f`.

Reference frames:
- `17:2` — DRY, before calculation
- `4:2` — DRY, result
- `39:2` — REF, before calculation
- `39:99` — REF, result

This document describes the UI contract for frontend implementation. Values shown in the mockups are demonstration/reference values unless explicitly backed by application data. Business tariff formulas must not be inferred from the visuals.

## 1. UI architecture

Implement one Calculator UI, not four independent pages.

Core UI state:
- `category: 'DRY' | 'REF'`
- `quote: null | CalculationQuote`

States:
- DRY + `quote === null` → DRY before calculation
- DRY + `quote !== null` → DRY result
- REF + `quote === null` → REF before calculation
- REF + `quote !== null` → REF result

The before/result states share the same calculation form. The result state adds Commercial rate, Route and stages, Additional services, How calculated, and Calculation result.

## 2. Reference frame sizes

- DRY before calculation: `1440 × 930 px`
- DRY result: `1440 × 1927 px`
- REF before calculation: `1440 × 930 px`
- REF result: `1440 × 1927 px`

Primary page horizontal padding: `36 px`.
Primary content width: `1368 px`.

## 3. Color palette

Primary corporate navy:
- `#0C2A61`

Secondary corporate blue:
- `#0A579A`

Main text / dark ink:
- approximately `#19263C` / `#18253A`

Muted text:
- `#6C7C97`
- Commercial block muted text uses approximately `#6F7E97`

Borders / separators:
- `#DAE2EC`

Light page/background surfaces:
- page reference background includes very light blue-gray such as `#F6F9FD`
- main content cards are white `#FFFFFF`

Soft blue highlight:
- date context approximately `#ECF5FE`
- discount result `#EFF7FF`

Deal pill / soft neutral:
- approximately `#F2F5F8`

Required-field marker:
- orange `#EE7C2D`

Active/inactive service styling:
- active: soft blue background + blue/navy text, optional check mark
- inactive: neutral light fill/border and muted text

No gradients.

## 4. Typography

Font family: `Montserrat`.

Observed weights:
- Regular
- Medium
- SemiBold
- Bold

Typical sizes:
- page title `Расчёт тарифа`: `28 px Bold`
- card/section titles: `16 px SemiBold`
- primary numeric values, e.g. base tariff: `20 px Bold`
- discount result: `18 px Bold`
- brand `НОВИК`: `16 px Bold`
- field labels: `12 px SemiBold`
- input text / placeholders: `13–14 px`
- compact result values: `11–12 px SemiBold`
- compact metric labels: `9–10 px Regular/Medium`
- secondary/helper text: `10–11 px`

Most text uses line-height approximately `1.4`.

## 5. Header and page context

Top bar height: `72 px`.
Horizontal padding: `36 px`.

Contains:
- brand mark + `НОВИК / TARIFF CALC`
- nav: `Калькулятор`, `История`, `Тарифы`
- deal badge, e.g. `Сделка #4261`
- current user / role label, e.g. `ADMIN`

Page header:
- left: `Расчёт тарифа`
- right: `Новый расчёт`

Client context row:
- `Клиент:`
- client name from Bitrix24
- `• данные из Bitrix24`
- right-aligned calculation date pill

## 6. Calculation form

Main form card:
- width `1368 px`
- height reference `550 px`
- padding `30 px`
- vertical gap `20 px`
- border `1 px #DAE2EC`
- radius `16 px`
- white background

### Required fields

Required-field indicator is an orange `*`.

Required:
- Пункт отправления *
- Пункт назначения *
- Контейнер *
- Вес груза, кг *
- Собственник контейнера *
- Отсрочка *

Optional:
- Груз / ЕТСНГ

### Row 1 — route

Two equal fields:
- `Пункт отправления *`
- `Пункт назначения *`

Reference field width: about `646 px` each.
Gap: `16 px`.
Input height: `52 px`.
Input radius: `10 px`.
Placeholder: `Введите город`.

Do not use the word `терминал` in these placeholders.

### Row 2 — container / cargo / weight

Reference widths:
- Container: about `260 px`
- Cargo / ETSNG: about `680 px`
- Weight: about `330 px`
- gap: `16 px`

Labels:
- `Контейнер *`
- `Груз / ЕТСНГ`
- `Вес груза, кг *`

### Row 3 — owner + extras

Left: container owner.

`Собственник контейнера *`

Radio choices:
- `НОВИК` / `COC`
- `Иной собственник` / `SOC`

Right: `Доп. услуги` + deferred payment.

DRY services:
- Идентификация
- Опасный груз

REF services:
- Идентификация
- Дженсет
- Опасный груз

Critical rule: **Дженсет is displayed only for REF. It must not appear in DRY before or after calculation.**

Deferred payment:
- label `Отсрочка *`
- numeric input, reference value `0`
- suffix `дней`
- its horizontal position must remain consistent between before/result states.

Main form action:
- full-width navy button `Рассчитать`
- reference height about `50 px`
- radius about `8–10 px`

## 7. DRY / REF switch

Switch container reference:
- width `1308 px`
- height `62 px`
- gap `12 px`

Each half:
- width `648 px`
- height `62 px`
- radius `8 px`
- horizontal padding `20 px`
- icon about `28 × 28 px`
- icon/text gap `14 px`

Active mode:
- fill `#0C2A61`
- white text/icon

Inactive mode:
- white fill
- `1 px #0C2A61` border
- navy text/icon

Labels:
- `СУХОЙ КОНТЕЙНЕР`
- `РЕФРИЖЕРАТОРНЫЙ КОНТЕЙНЕР`

DRY uses container icon.
REF uses snowflake icon.

## 8. Commercial rate

Displayed only in the result state, directly below the calculation form.

Outer card:
- width `1368 px`
- height reference `244 px`
- padding horizontal `22 px`
- padding vertical `20 px`
- border `1 px #DAE2EC`
- radius `14 px`
- internal vertical gap `14 px`

Header:
- left: `Коммерческая ставка` — `16 px SemiBold`
- right helper: `Скидка рассчитывается автоматически от базового тарифа`

Body:
- width `1324 px`
- two equal columns
- each column reference width `654 px`
- body height `148 px`
- gap between halves `16 px`
- both halves are the same height

### Left half — manager selling rate

Contains:
- label `Ставка продажи менеджера, ₽`
- input width reference `626 px`, height `44 px`
- navy border, radius `8 px`
- DRY example: `210 000 ₽`
- REF initial example: `Введите ставку`

Below input:
- `Скидка, %`
- soft blue highlight `#EFF7FF`
- height `44 px`
- DRY example: `7,0 %`
- REF before sale-rate input: `—`

Frontend behavior:
`discountPercent = (baseDoorToDoor - managerSaleRate) / baseDoorToDoor * 100`
Display to one decimal place.

Do not infer any other tariff/margin formulas from the design.

### Right half — base rate + compact metrics

Top:
- label `Базовый тариф дверь/дверь`
- DRY mock value `225 697 ₽`
- REF mock value `235 349,17 ₽`
- numeric value `20 px Bold`, navy

Separator line below base tariff: `#DAE2EC`.

Below: one compact inline row. Metrics are **not cards** and must have:
- no individual background
- no individual border
- no boxed/card appearance

Order:
1. Экспедиторская маржа
2. Эксп. маржа, %
3. Маржа сервисов
4. Итого маржа
5. Итого маржа, %

DRY mock values:
- `4 574 ₽`
- `2,2 %`
- `25 905 ₽`
- `30 479 ₽`
- `14,5 %`

REF mock values:
- `—`
- `—`
- `22 839,30 ₽`
- `—`
- `—`

These are mock/reference values in the design, not frontend tariff rules.

## 9. Result layout

The result area starts below Commercial rate.

Reference width: `1368 px`.
Two equal columns:
- left `672 px`
- right `672 px`
- gap `24 px`

Desktop arrangement:

Left:
1. Маршрут и этапы
2. Дополнительные услуги
3. Как рассчитано

Right:
1. Итог расчёта
2. Save-to-PDF action is inside the bottom of Calculation result

### Route and stages

Reference width: `672 px`.
Reference height: about `410 px`.

Header:
- `Маршрут и этапы`
- `+ Добавить этап`

No explanatory subtitle under the section title.

Stage cards:
- numbered circle in navy
- title
- route endpoints
- compact metadata
- tariff-found status/value on the right in the design
- do not add an extra white panel under the text/content

Example stages:
1. `Авто • первая миля`
2. `Море • LI-LO`
3. `Авто • последняя миля`

DRY metadata example includes `DRY` and `40'HC`.
REF metadata example includes `REF` and `40'RCPW`.

### Additional services summary

Reference width: `672 px`.
Reference height: about `104 px`.

DRY:
- Идентификация
- Опасный груз

REF:
- Идентификация
- Дженсет
- Опасный груз

Design reference uses one active service and remaining inactive services to demonstrate both states.

### How calculated

Reference width: `672 px`.
Reference height: about `180 px`.

Title: `Как рассчитано`.
Status pill: `для проверки`.

Example/reference content:
- `Первая миля`
- `70,2 км → округление вверх → 71 км`
- `Вес 27 200 кг → перевес 2 начатые тонны`
- `База 17 000 ₽ + перевес 1 500 ₽`

Treat these as demonstration explanation lines, not a source of tariff logic.

## 10. Calculation result — DRY

Card:
- width `672 px`
- white background
- `1 px #DAE2EC` border
- radius `14 px`
- horizontal padding `22 px`
- vertical padding `20 px`
- row gap about `10 px`
- inner row width `626 px`

Rows, in exact design order:

1. Базовый тариф LI-LO — `114 000 ₽`
2. ПРР в порту отправки — `16 729 ₽`
3. FIOS — `58 000 ₽`
4. ПРР в порту прибытия — `15 500 ₽`
5. Пользование контейнером — `3 000 ₽`
6. Хранение контейнера — `—`
7. Дополнительные услуги — `500 ₽`
8. Маржа базового тарифа LI-LO — `20 271 ₽`
9. Маржа базового тарифа LI-LO, % — `17,8 %`
10. separator
11. Прочие расходы — `111 697 ₽`
12. Первая миля — `18 500 ₽`
13. Последняя миля — `93 197 ₽`
14. Идентификация — `—`
15. Отсрочка платежа, дней — `0`
16. Стоимость денег — `0 ₽`
17. separator
18. button `Сохранить расчёт в PDF`

Do not add commercial rows to this card. The following belong only to Commercial rate:
- Базовый тариф дверь/дверь
- ставка продажи менеджера
- скидка
- Экспедиторская маржа / %
- Маржа сервисов Новик
- Итого маржа / %

## 11. Calculation result — REF

Same base visual language as DRY.

Rows, in exact design order:

1. Базовый тариф LI-LO — `130 000 ₽`
2. ПРР в порту отправки — `17 673 ₽`
3. Подключение в порту отправки — `8 910 ₽`
4. Кол-во дней бесплатного подключения — `3`
5. FIOS — `37 000 ₽`
6. ПРР в порту прибытия — `19 936 ₽`
7. Подключение в порту прибытия — `6 936 ₽`
8. Кол-во дней бесплатного подключения — `3`
9. Пользование контейнером — `12 000 ₽`
10. Хранение контейнера — `2 500 ₽`
11. Дополнительные услуги — `500 ₽`
12. Маржа базового тарифа LI-LO — `24 545 ₽`
13. Маржа базового тарифа LI-LO, % — `18,9 %`
14. separator
15. Прочие расходы — `105 349,17 ₽`
16. Первая миля — `10 065 ₽`
17. Последняя миля — `93 197 ₽`
18. Идентификация — `—`
19. Отсрочка платежа, дней — `15`
20. Стоимость денег — `2 087,17 ₽`
21. separator
22. button `Сохранить расчёт в PDF`

Again, commercial selling-price and final-margin rows do not belong here.

## 12. Responsive behavior for implementation

The Figma source is a `1440 px` desktop reference, designed primarily for desktop / Bitrix iframe use.

Recommended implementation behavior derived from the layout:

### Desktop / wide iframe

At approximately `1200 px+` usable width:
- preserve two-column result layout
- Commercial rate remains two equal halves
- DRY/REF selector remains side-by-side
- form route fields remain side-by-side
- row 2 remains 3 columns when space permits

### Narrow iframe / tablet-like widths

Below the wide desktop threshold:
- stack result columns vertically: left content first, then Calculation result
- Commercial rate halves stack vertically
- DRY/REF selector may stack if minimum widths cannot be maintained
- route origin/destination may stack
- container/cargo/weight may wrap into 1–2 columns
- owner/extras/deferred payment should wrap without changing semantic order

### General responsive constraints

- no horizontal page scrolling
- no clipped right borders
- no clipped labels or buttons
- inputs use `min-width: 0` inside grid/flex containers
- long location/cargo values truncate or wrap safely according to component semantics
- keep PDF button fully visible
- preserve the same input/service order when stacked

Do not derive business logic from responsive behavior.

## 13. Implementation notes for Codex

- Treat the PNGs as visual source of truth and this document as structural/behavioral source of truth.
- Reuse the existing project stack and styling conventions.
- Do not add Tailwind solely because Figma design-context code is expressed with Tailwind utility classes.
- Keep tariff rules out of React UI components.
- Mock/reference numeric values should be isolated in typed fixtures until the backend calculation API replaces them.
- `Дженсет` must exist only for REF.
- History and Tariffs navigation may remain present visually; their functionality is out of scope for the calculator frontend stage.

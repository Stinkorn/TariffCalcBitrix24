import type { CalculationQuote, CalculatorCategory } from '../types';

const commonStages = (category: CalculatorCategory) => [
  { number: 1, mode: 'Авто • первая миля', title: 'Калининград → Балтийск', from: 'Калининград', to: 'Балтийск', details: `71 км • 27 200 кг • ${category}` },
  { number: 2, mode: 'Море • LI-LO', title: 'Балтийск → Бронка', from: 'Балтийск', to: 'Бронка', details: `${category === 'DRY' ? "40'HC" : "40'RCPW"} • COC • LOADED` },
  { number: 3, mode: 'Авто • последняя миля', title: 'Бронка → Москва', from: 'Бронка', to: 'Москва', details: 'магистральное авто • 27 200 кг' }
];

const dry: CalculationQuote = {
  category: 'DRY', baseDoorToDoor: 225697, routeStages: commonStages('DRY'),
  additionalServices: [{ name: 'Идентификация', active: true }, { name: 'Опасный груз', active: false }],
  explanation: { distance: ['Первая миля', '70,2 км', '→ округление вверх', '→ 71 км'], weight: ['Вес 27 200 кг', '→ перевес 2 начатые тонны'], base: ['База 17 000 ₽', '+ перевес 1 500 ₽'] },
  commercial: { forwardingMargin: '4 574 ₽', forwardingMarginPercent: '2,2 %', servicesMargin: '25 905 ₽', totalMargin: '30 479 ₽', totalMarginPercent: '14,5 %' },
  breakdown: [
    { label: 'Базовый тариф LI-LO', value: '114 000 ₽' }, { label: 'ПРР в порту отправки', value: '16 729 ₽' },
    { label: 'FIOS', value: '58 000 ₽' }, { label: 'ПРР в порту прибытия', value: '15 500 ₽' },
    { label: 'Пользование контейнером', value: '3 000 ₽' }, { label: 'Хранение контейнера', value: '—' },
    { label: 'Дополнительные услуги', value: '500 ₽' }, { label: 'Маржа базового тарифа LI-LO', value: '20 271 ₽', emphasis: true },
    { label: 'Маржа базового тарифа LI-LO, %', value: '17,8 %', emphasis: true }, { label: 'Прочие расходы', value: '111 697 ₽', emphasis: true },
    { label: 'Первая миля', value: '18 500 ₽' }, { label: 'Последняя миля', value: '93 197 ₽' }, { label: 'Идентификация', value: '—' },
    { label: 'Отсрочка платежа, дней', value: '0' }, { label: 'Стоимость денег', value: '0 ₽' }
  ]
};

const ref: CalculationQuote = {
  category: 'REF', baseDoorToDoor: 248545, routeStages: commonStages('REF'),
  additionalServices: [{ name: 'Идентификация', active: true }, { name: 'Дженсет', active: false }, { name: 'Опасный груз', active: false }],
  explanation: dry.explanation,
  commercial: { forwardingMargin: '—', forwardingMarginPercent: '—', servicesMargin: '22 839,30 ₽', totalMargin: '—', totalMarginPercent: '—' },
  breakdown: [
    { label: 'Базовый тариф LI-LO', value: '130 000 ₽' }, { label: 'ПРР в порту отправки', value: '17 673 ₽' },
    { label: 'Подключение в порту отправки', value: '8 910 ₽' }, { label: 'Кол-во дней бесплатного подключения', value: '3' },
    { label: 'FIOS', value: '37 000 ₽' }, { label: 'ПРР в порту прибытия', value: '19 936 ₽' },
    { label: 'Подключение в порту прибытия', value: '6 936 ₽' }, { label: 'Кол-во дней бесплатного подключения', value: '3' },
    { label: 'Пользование контейнером', value: '12 000 ₽' }, { label: 'Хранение контейнера', value: '2 500 ₽' },
    { label: 'Дополнительные услуги', value: '500 ₽' }, { label: 'Маржа базового тарифа LI-LO', value: '24 545 ₽', emphasis: true },
    { label: 'Маржа базового тарифа LI-LO, %', value: '18,9 %', emphasis: true }, { label: 'Прочие расходы', value: '105 349,17 ₽', emphasis: true },
    { label: 'Первая миля', value: '10 065 ₽' }, { label: 'Последняя миля', value: '93 197 ₽' }, { label: 'Идентификация', value: '—' },
    { label: 'Отсрочка платежа, дней', value: '15' }, { label: 'Стоимость денег', value: '2 087,17 ₽' }
  ]
};

export const calculatorFixtures: Record<CalculatorCategory, CalculationQuote> = { DRY: dry, REF: ref };

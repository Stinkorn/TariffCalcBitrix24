const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const tariffTypes = [
  ['AUTO_DISTANCE_WEIGHT', 'Авто: расстояние и вес'],
  ['AUTO_ROUTE_CONTAINER', 'Авто: маршрут и контейнер'],
  ['SEA_MATRIX', 'Морская матрица'],
  ['RAIL_FIXED', 'ЖД: фиксированная ставка'],
  ['CONTAINER_RENT', 'Аренда контейнера'],
  ['STORAGE', 'Хранение'],
  ['PRR', 'Погрузочно-разгрузочные работы']
];

async function main() {
  for (const [code, name] of tariffTypes) {
    await prisma.tariffType.upsert({ where: { code }, update: { name, active: true }, create: { code, name } });
  }

  const type = await prisma.tariffType.findUnique({ where: { code: 'AUTO_DISTANCE_WEIGHT' } });
  const tariff = await prisma.tariff.upsert({
    where: { code: 'AUTO_KGD' },
    update: { name: 'Авто Калининград', tariffTypeId: type.id, active: true, currency: 'RUB' },
    create: { name: 'Авто Калининград', code: 'AUTO_KGD', tariffTypeId: type.id, currency: 'RUB' }
  });
  await prisma.tariffStage.upsert({ where: { tariffId_stageType: { tariffId: tariff.id, stageType: 'AUTO' } }, update: {}, create: { tariffId: tariff.id, stageType: 'AUTO' } });

  const rows = [
    { minDistance: 0, maxDistance: 40, minWeight: 0, maxWeight: 21000, price: 10065, priority: 1, stageType: 'AUTO', unit: 'KM', description: 'До 21 тонны' },
    { minDistance: 0, maxDistance: 40, minWeight: 21000.001, maxWeight: null, price: 11825, priority: 2, stageType: 'AUTO', unit: 'KM', description: 'Более 21 тонны' },
    { minDistance: 41, maxDistance: 50, minWeight: 0, maxWeight: 21000, price: 11495, priority: 3, stageType: 'AUTO', unit: 'KM', description: 'До 21 тонны' }
  ];
  await prisma.tariffRow.deleteMany({ where: { tariffId: tariff.id } });
  await prisma.tariffRow.createMany({ data: rows.map((row) => ({ ...row, tariffId: tariff.id, currency: 'RUB' })) });
}

main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });

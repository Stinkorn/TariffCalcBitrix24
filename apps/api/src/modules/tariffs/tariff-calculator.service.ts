import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FindTariffDto } from '../calculator/dto/find-tariff.dto';

@Injectable()
export class TariffCalculatorService {
  constructor(private readonly prisma: PrismaService) {}

  async findTariff(input: FindTariffDto) {
    const tariffTypeCode = input.tariffTypeCode ?? this.getDefaultType(input.stageType);
    if (!tariffTypeCode) return this.notFound();

    const tariffs = await this.prisma.tariff.findMany({
      where: {
        active: true,
        tariffType: { code: tariffTypeCode, active: true },
        OR: [{ stages: { none: {} } }, { stages: { some: { stageType: input.stageType } } }]
      },
      orderBy: { name: 'asc' },
      include: {
        tariffType: true,
        rows: {
          where: {
            AND: [
              { OR: [{ minDistance: null }, { minDistance: { lte: input.distance } }] },
              { OR: [{ maxDistance: null }, { maxDistance: { gte: input.distance } }] },
              { OR: [{ minWeight: null }, { minWeight: { lte: input.weight } }] },
              { OR: [{ maxWeight: null }, { maxWeight: { gte: input.weight } }] },
              { OR: [{ fromLocationId: null }, { fromLocationId: input.fromLocation }] },
              { OR: [{ toLocationId: null }, { toLocationId: input.toLocation }] },
              { OR: [{ containerTypeId: null }, { containerTypeId: input.containerType }] },
              { OR: [{ routeDirection: null }, { routeDirection: input.routeDirection }] },
              { OR: [{ stageType: null }, { stageType: input.stageType }] }
            ]
          },
          orderBy: { priority: 'asc' },
          take: 1
        }
      }
    });
    const tariff = tariffs.find((item) => item.rows.length > 0);
    if (!tariff) return this.notFound();
    const row = tariff.rows[0];
    return {
      tariffFound: true,
      tariffId: tariff.id,
      tariffRowId: row.id,
      price: row.price,
      unit: row.unit,
      currency: row.currency,
      tariffName: tariff.name,
      basis: row.description ?? this.buildBasis(row)
    };
  }

  private notFound() { return { tariffFound: false, tariffId: null, tariffRowId: null, price: null, unit: null, currency: null, tariffName: null }; }
  private buildBasis(row: { minDistance: unknown; maxDistance: unknown; minWeight: unknown; maxWeight: unknown }) {
    const distance = `${row.minDistance ?? '0'}–${row.maxDistance ?? '∞'} км`;
    const weight = row.maxWeight ? `до ${row.maxWeight} кг` : row.minWeight ? `от ${row.minWeight} кг` : '';
    return [distance, weight].filter(Boolean).join(' / ');
  }
  private getDefaultType(stageType: string) {
    if (stageType === 'AUTO') return 'AUTO_DISTANCE_WEIGHT';
    if (stageType === 'SEA') return 'SEA_MATRIX';
    if (stageType === 'RAIL') return 'RAIL_FIXED';
    return null;
  }
}

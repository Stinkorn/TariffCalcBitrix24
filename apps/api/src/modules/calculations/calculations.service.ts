import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCalculationDto } from './dto/create-calculation.dto';

@Injectable()
export class CalculationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(payload: CreateCalculationDto) {
    const created = await this.prisma.calculation.create({
      data: {
        portalDomain: payload.portalDomain ?? null,
        dealId: payload.dealId ?? null,
        counterpartyId: payload.counterpartyId ?? null,
        counterpartyType: payload.counterpartyType ?? null,
        counterpartyName: payload.counterpartyName ?? null,
        routeType: payload.routeType ?? null,
        origin: payload.origin,
        destination: payload.destination,
        weightKg: payload.weightKg,
        volumeM3: payload.volumeM3,
        transportType: payload.transportType,
        containerType: payload.containerType ?? null,
        containerStatus: payload.containerStatus ?? null,
        currency: payload.currency,
        totalCost: payload.totalCost,
        margin: payload.margin,
        clientPrice: payload.clientPrice,
        marginType: payload.marginType ?? null,
        marginValue: payload.marginValue ?? null,
        services: payload.services ?? undefined,
        warnings: payload.warnings ?? undefined,
        status: 'DRAFT',
        lines: {
          create: payload.lines.map((line, index) => ({
            stage: line.stage,
            name: line.name,
            cost: line.cost,
            currency: line.currency,
            sortOrder: line.sortOrder ?? index
          }))
        }
      },
      include: { lines: { orderBy: { sortOrder: 'asc' } } }
    });

    return created;
  }

  async getById(id: string) {
    const item = await this.prisma.calculation.findUnique({
      where: { id },
      include: { lines: { orderBy: { sortOrder: 'asc' } } }
    });

    if (!item) {
      throw new NotFoundException(`Calculation ${id} not found`);
    }

    return item;
  }

  async getByDeal(dealId: string) {
    return this.prisma.calculation.findMany({
      where: { dealId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { lines: { orderBy: { sortOrder: 'asc' } } }
    });
  }

  async getRecent() {
    return this.prisma.calculation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { lines: { orderBy: { sortOrder: 'asc' } } }
    });
  }
}

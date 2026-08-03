import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTariffDto } from './dto/create-tariff.dto';
import { UpdateTariffDto } from './dto/update-tariff.dto';
import { UpsertTariffRowDto } from './dto/upsert-tariff-row.dto';

@Injectable()
export class TariffsService {
  constructor(private readonly prisma: PrismaService) {}

  getAll() {
    return this.prisma.tariff.findMany({
      orderBy: { name: 'asc' },
      include: { tariffType: true, _count: { select: { rows: true, additions: true } } }
    });
  }

  async getById(id: string) {
    const tariff = await this.prisma.tariff.findUnique({
      where: { id },
      include: {
        tariffType: true,
        stages: { orderBy: { stageType: 'asc' } },
        rows: { orderBy: { priority: 'asc' } },
        additions: { orderBy: { name: 'asc' } }
      }
    });
    if (!tariff) throw new NotFoundException(`Tariff ${id} not found`);
    return tariff;
  }

  async create(input: CreateTariffDto) {
    const type = await this.getType(input.typeCode);
    try {
      return await this.prisma.tariff.create({
        data: {
          name: input.name,
          code: input.code,
          tariffTypeId: type.id,
          active: input.active ?? true,
          currency: input.currency ?? 'RUB',
          description: input.description
        },
        include: { tariffType: true }
      });
    } catch (error) {
      if (this.isUniqueError(error)) throw new ConflictException(`Tariff code ${input.code} already exists`);
      throw error;
    }
  }

  async update(id: string, input: UpdateTariffDto) {
    await this.getById(id);
    const { typeCode, ...values } = input;
    const type = typeCode ? await this.getType(typeCode) : undefined;
    try {
      return await this.prisma.tariff.update({
        where: { id },
        data: { ...values, ...(type ? { tariffTypeId: type.id } : {}) },
        include: { tariffType: true }
      });
    } catch (error) {
      if (this.isUniqueError(error)) throw new ConflictException(`Tariff code ${input.code} already exists`);
      throw error;
    }
  }

  async addRow(tariffId: string, input: UpsertTariffRowDto) {
    const tariff = await this.getById(tariffId);
    return this.prisma.tariffRow.create({
      data: { ...input, tariffId, currency: input.currency ?? tariff.currency }
    });
  }

  async updateRow(rowId: string, input: UpsertTariffRowDto) {
    await this.getRow(rowId);
    return this.prisma.tariffRow.update({ where: { id: rowId }, data: input });
  }

  async removeRow(rowId: string) {
    await this.getRow(rowId);
    await this.prisma.tariffRow.delete({ where: { id: rowId } });
    return { success: true };
  }

  private async getType(code: string) {
    const type = await this.prisma.tariffType.findFirst({ where: { code, active: true } });
    if (!type) throw new NotFoundException(`Active tariff type ${code} not found`);
    return type;
  }

  private async getRow(id: string) {
    const row = await this.prisma.tariffRow.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Tariff row ${id} not found`);
    return row;
  }

  private isUniqueError(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}

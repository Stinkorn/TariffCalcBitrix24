import { Injectable } from '@nestjs/common';
import { UpsertTariffRowDto } from './dto/upsert-tariff-row.dto';
import { TariffsService } from './tariffs.service';

/**
 * Extension point for the next MVP phase: an Excel parser will map spreadsheet
 * rows to UpsertTariffRowDto and pass them through this service.
 */
@Injectable()
export class TariffImportService {
  constructor(private readonly tariffsService: TariffsService) {}

  async importRows(tariffId: string, rows: UpsertTariffRowDto[]) {
    const created = [];
    for (const row of rows) created.push(await this.tariffsService.addRow(tariffId, row));
    return created;
  }
}

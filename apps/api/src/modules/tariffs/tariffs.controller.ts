import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { CreateTariffDto } from './dto/create-tariff.dto';
import { UpdateTariffDto } from './dto/update-tariff.dto';
import { UpsertTariffRowDto } from './dto/upsert-tariff-row.dto';
import { TariffsService } from './tariffs.service';

@Controller('tariffs')
export class TariffsController {
  constructor(private readonly tariffsService: TariffsService) {}
  @Get() getAll() { return this.tariffsService.getAll(); }
  @Get(':id') getById(@Param('id') id: string) { return this.tariffsService.getById(id); }
  @Post() create(@Body() body: CreateTariffDto) { return this.tariffsService.create(body); }
  @Put(':id') update(@Param('id') id: string, @Body() body: UpdateTariffDto) { return this.tariffsService.update(id, body); }
  @Post(':id/rows') addRow(@Param('id') id: string, @Body() body: UpsertTariffRowDto) { return this.tariffsService.addRow(id, body); }
  @Put('rows/:rowId') updateRow(@Param('rowId') rowId: string, @Body() body: UpsertTariffRowDto) { return this.tariffsService.updateRow(rowId, body); }
  @Delete('rows/:rowId') @HttpCode(200) removeRow(@Param('rowId') rowId: string) { return this.tariffsService.removeRow(rowId); }
}

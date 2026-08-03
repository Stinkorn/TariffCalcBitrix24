import { Module } from '@nestjs/common';
import { TariffsController } from './tariffs.controller';
import { TariffsService } from './tariffs.service';
import { TariffCalculatorService } from './tariff-calculator.service';
import { TariffImportService } from './tariff-import.service';

@Module({
  controllers: [TariffsController],
  providers: [TariffsService, TariffCalculatorService, TariffImportService],
  exports: [TariffsService, TariffCalculatorService]
})
export class TariffsModule {}

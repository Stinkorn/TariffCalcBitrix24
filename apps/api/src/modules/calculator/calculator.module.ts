import { Module } from '@nestjs/common';
import { CalculatorController } from './calculator.controller';
import { CalculatorService } from './calculator.service';
import { TariffsModule } from '../tariffs/tariffs.module';
import { TariffCalculatorService } from '../tariffs/tariff-calculator.service';

@Module({
  imports: [TariffsModule],
  controllers: [CalculatorController],
  providers: [CalculatorService]
})
export class CalculatorModule {}

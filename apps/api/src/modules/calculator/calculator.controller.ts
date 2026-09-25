import { Body, Controller, Post } from '@nestjs/common';
import { CalculatorService } from './calculator.service';
import { CalculateDto } from './dto/calculate.dto';
import { FindTariffDto } from './dto/find-tariff.dto';
import { TariffCalculatorService } from '../tariffs/tariff-calculator.service';
import { CreateQuoteDto } from './dto/create-quote.dto';

@Controller('calculator')
export class CalculatorController {
  constructor(
    private readonly calculatorService: CalculatorService,
    private readonly tariffCalculatorService: TariffCalculatorService
  ) {}

  @Post('calculate')
  calculate(@Body() payload: CalculateDto) {
    return this.calculatorService.calculate(payload);
  }

  @Post('find-tariff')
  findTariff(@Body() payload: FindTariffDto) {
    return this.tariffCalculatorService.findTariff(payload);
  }

  @Post('quote')
  quote(@Body() payload: CreateQuoteDto) {
    return this.calculatorService.quote(payload);
  }
}

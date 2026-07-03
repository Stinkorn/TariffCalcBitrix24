import { Body, Controller, Post } from '@nestjs/common';
import { CalculatorService } from './calculator.service';
import { CalculateDto } from './dto/calculate.dto';

@Controller('calculator')
export class CalculatorController {
  constructor(private readonly calculatorService: CalculatorService) {}

  @Post('calculate')
  calculate(@Body() payload: CalculateDto) {
    return this.calculatorService.calculate(payload);
  }
}

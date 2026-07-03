import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CalculationsService } from './calculations.service';
import { CreateCalculationDto } from './dto/create-calculation.dto';

@Controller('calculations')
export class CalculationsController {
  constructor(private readonly calculationsService: CalculationsService) {}

  @Post()
  create(@Body() body: CreateCalculationDto) {
    return this.calculationsService.create(body);
  }

  @Get('by-deal/:dealId')
  getByDeal(@Param('dealId') dealId: string) {
    return this.calculationsService.getByDeal(dealId);
  }

  @Get('recent')
  getRecent() {
    return this.calculationsService.getRecent();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.calculationsService.getById(id);
  }
}

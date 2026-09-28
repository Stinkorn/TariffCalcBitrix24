import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { UserRoleCode } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CalculationsService, type HistoryQuery } from './calculations.service';
import { CreateCalculationDto } from './dto/create-calculation.dto';
import { AuthenticatedRequest } from '../auth/auth.types';

@Controller('calculations')
export class CalculationsController {
  constructor(private readonly calculationsService: CalculationsService) {}

  @Post()
  create(@Body() body: CreateCalculationDto, @Req() request: AuthenticatedRequest) {
    return this.calculationsService.create(body, request.user.portalId);
  }

  @Get('by-deal/:dealId')
  getByDeal(@Param('dealId') dealId: string) {
    return this.calculationsService.getByDeal(dealId);
  }

  @Get('recent')
  getRecent() {
    return this.calculationsService.getRecent();
  }

  @Get('history')
  @Roles(UserRoleCode.ADMIN)
  getHistory(@Query() query: HistoryQuery, @Req() request: AuthenticatedRequest) {
    return this.calculationsService.getHistory(query, request.user.portalId);
  }

  @Get('history/:id/versions')
  @Roles(UserRoleCode.ADMIN)
  getRequestHistory(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.calculationsService.getRequestHistory(id, request.user.portalId);
  }

  @Post(':id/set-current')
  @Roles(UserRoleCode.ADMIN)
  setCurrent(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.calculationsService.setCurrent(id, request.user.portalId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.calculationsService.getById(id);
  }
}

import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
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

  @Get('history/filter-options')
  @Roles(UserRoleCode.ADMIN)
  getHistoryFilterOptions(@Req() request: AuthenticatedRequest) {
    return this.calculationsService.getHistoryFilterOptions(request.user.portalId);
  }

  @Post('history/pdf-data')
  @Roles(UserRoleCode.ADMIN)
  getHistoryPdfData(@Body() body: { ids?: unknown }, @Req() request: AuthenticatedRequest) {
    if (!Array.isArray(body?.ids) || body.ids.some((id) => typeof id !== 'string')) {
      throw new BadRequestException('ids must be an array of calculation IDs');
    }
    return this.calculationsService.getHistoryPdfData(body.ids, request.user.portalId);
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

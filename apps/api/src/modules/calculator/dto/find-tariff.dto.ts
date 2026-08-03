import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class FindTariffDto {
  @IsString()
  stageType!: 'AUTO' | 'SEA' | 'RAIL' | 'TERMINAL' | 'CUSTOM';

  @IsString()
  @IsOptional()
  tariffTypeCode?: string;

  @IsOptional() @IsString() fromLocation?: string;
  @IsOptional() @IsString() toLocation?: string;
  @IsOptional() @IsString() containerType?: string;
  @IsOptional() @IsString() routeDirection?: 'KLD_OUT' | 'KLD_IN';
  @Type(() => Number) @IsNumber() @Min(0) distance!: number;
  @Type(() => Number) @IsNumber() @Min(0) weight!: number;
}

import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpsertTariffRowDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minDistance?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxDistance?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minWeight?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxWeight?: number;
  @IsOptional() @IsString() containerTypeId?: string;
  @IsOptional() @IsString() fromLocationId?: string;
  @IsOptional() @IsString() toLocationId?: string;
  @IsOptional() @IsString() routeDirection?: 'KLD_OUT' | 'KLD_IN';
  @IsOptional() @IsString() stageType?: 'AUTO' | 'SEA' | 'RAIL' | 'TERMINAL' | 'CUSTOM';
  @IsOptional() @IsString() unit?: 'FIXED' | 'KM' | 'TON' | 'CONTAINER' | 'DAY';
  @Type(() => Number) @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priority?: number;
}

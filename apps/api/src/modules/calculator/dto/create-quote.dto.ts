import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class QuoteServicesDto {
  @IsBoolean() identification!: boolean;
  @IsBoolean() genset!: boolean;
  @IsBoolean() dangerous!: boolean;
}

export class CreateQuoteDto {
  @IsIn(['DRY', 'REF']) category!: 'DRY' | 'REF';
  @IsString() originLocationId!: string;
  @IsString() destinationLocationId!: string;
  @Type(() => Number) @IsInt() @Min(1) containerId!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) cargoId?: number | null;
  @Type(() => Number) @IsNumber() @Min(0.000001) weightKg!: number;
  @IsIn(['COC', 'SOC']) owner!: 'COC' | 'SOC';
  @ValidateNested() @Type(() => QuoteServicesDto) services!: QuoteServicesDto;
  @Type(() => Number) @IsInt() @Min(0) paymentDelayDays!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) saleRate?: number | null;
}

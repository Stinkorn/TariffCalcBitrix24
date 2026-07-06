import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

class CreateCalculationLineDto {
  @IsString()
  stage!: string;

  @IsString()
  name!: string;

  @IsNumber()
  cost!: number;

  @IsString()
  currency!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class CreateCalculationDto {
  @IsOptional()
  @IsString()
  portalDomain?: string;

  @IsOptional()
  @IsString()
  dealId?: string;

  @IsOptional()
  @IsString()
  counterpartyId?: string;

  @IsOptional()
  @IsString()
  counterpartyType?: string;

  @IsOptional()
  @IsString()
  counterpartyName?: string;

  @IsOptional()
  @IsString()
  routeType?: string;

  @IsString()
  @IsNotEmpty()
  origin!: string;

  @IsString()
  destination!: string;

  @IsNumber()
  @Min(0)
  weightKg!: number;

  @IsNumber()
  @Min(0)
  volumeM3!: number;

  @IsString()
  @IsNotEmpty()
  transportType!: string;

  @IsOptional()
  @IsString()
  containerType?: string;

  @IsOptional()
  @IsString()
  containerStatus?: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsOptional()
  @IsString()
  marginType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  marginValue?: number;

  @IsNumber()
  totalCost!: number;

  @IsNumber()
  margin!: number;

  @IsNumber()
  clientPrice!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCalculationLineDto)
  lines!: CreateCalculationLineDto[];

  @IsOptional()
  @IsObject()
  services?: Record<string, boolean>;

  @IsOptional()
  @IsArray()
  warnings?: string[];
}

import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsString,
  Min,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TransportType {
  AUTO = 'AUTO',
  MULTIMODAL = 'MULTIMODAL',
  SEA = 'SEA',
  RAIL = 'RAIL'
}

export enum RouteType {
  KLD_OUT = 'KLD_OUT',
  KLD_IN = 'KLD_IN'
}

export enum ContainerStatus {
  EMPTY = 'EMPTY',
  LOADED = 'LOADED'
}

export enum Currency {
  RUB = 'RUB',
  USD = 'USD',
  EUR = 'EUR'
}

export enum MarginType {
  PERCENT = 'percent',
  FIXED = 'fixed'
}

class ServicesDto {
  @IsBoolean()
  portHandling!: boolean;

  @IsBoolean()
  storage!: boolean;

  @IsBoolean()
  reeferConnection!: boolean;

  @IsBoolean()
  containerRent!: boolean;
}

export class CalculateDto {
  @IsEnum(RouteType)
  routeType!: RouteType;

  @IsString()
  @IsNotEmpty()
  origin!: string;

  @IsString()
  @IsNotEmpty()
  destination!: string;

  @IsNumber()
  @Min(0.000001)
  weightKg!: number;

  @IsNumber()
  @Min(0)
  volumeM3!: number;

  @IsEnum(TransportType)
  transportType!: TransportType;

  @IsString()
  @IsNotEmpty()
  containerType!: string;

  @IsEnum(ContainerStatus)
  containerStatus!: ContainerStatus;

  @IsEnum(Currency)
  currency!: Currency;

  @IsEnum(MarginType)
  marginType!: MarginType;

  @IsNumber()
  @Min(0)
  marginValue!: number;

  @IsObject()
  @ValidateNested()
  @Type(() => ServicesDto)
  services!: ServicesDto;
}

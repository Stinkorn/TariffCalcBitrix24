import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/**
 * Minimal auth context returned by BX24.getAuth().
 * user_id and role are intentionally not accepted: the backend resolves them.
 */
export class BitrixBootstrapDto {
  @IsString()
  @IsNotEmpty()
  access_token!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9][a-z0-9.-]*(?::\d+)?$/i)
  domain!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  member_id?: string;
}

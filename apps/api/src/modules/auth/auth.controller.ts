import { Body, Controller, Post } from '@nestjs/common';
import { BitrixAuthService } from './bitrix-auth.service';
import { BitrixBootstrapDto } from './dto/bitrix-bootstrap.dto';
import { Public } from './public.decorator';

@Controller('auth/bitrix')
export class AuthController {
  constructor(private readonly bitrixAuthService: BitrixAuthService) {}

  @Post('bootstrap')
  @Public()
  bootstrap(@Body() dto: BitrixBootstrapDto) {
    return this.bitrixAuthService.bootstrap(dto);
  }
}

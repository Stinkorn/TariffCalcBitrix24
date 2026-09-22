import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppJwtPayload } from './app-token.types';

type TokenLifetime = {
  value: string | number;
  seconds: number;
};

@Injectable()
export class AppTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async issue(payload: Omit<AppJwtPayload, 'iat' | 'exp'>) {
    const secret = this.getSecret();
    const lifetime = this.getLifetime();

    try {
      const accessToken = await this.jwtService.signAsync(payload, {
        secret,
        expiresIn: lifetime.value,
        algorithm: 'HS256'
      });

      return {
        accessToken,
        expiresIn: lifetime.seconds
      };
    } catch {
      throw new InternalServerErrorException('Application token could not be issued');
    }
  }

  async verify(token: string) {
    const secret = this.getSecret();

    try {
      return await this.jwtService.verifyAsync<AppJwtPayload>(token, {
        secret,
        algorithms: ['HS256']
      });
    } catch {
      throw new UnauthorizedException('Invalid application token');
    }
  }

  private getSecret() {
    const secret = this.configService.get<string>('APP_JWT_SECRET')?.trim();
    if (!secret) {
      throw new InternalServerErrorException('Application auth is not configured');
    }
    return secret;
  }

  private getLifetime(): TokenLifetime {
    const raw = this.configService.get<string>('APP_JWT_EXPIRES_IN', '20m').trim();
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
      return { value: numeric, seconds: numeric };
    }

    const match = /^(\d+)\s*(s|m|h|d)$/i.exec(raw);
    if (!match) {
      throw new InternalServerErrorException('Application auth is not configured');
    }

    const amount = Number(match[1]);
    const multiplier = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60
    }[match[2].toLowerCase() as 's' | 'm' | 'h' | 'd'];

    return {
      value: raw,
      seconds: amount * multiplier
    };
  }
}

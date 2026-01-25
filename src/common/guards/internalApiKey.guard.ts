import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const rpcData = context.switchToRpc().getData();
    const headers = rpcData?.headers;

    const expectedApiKey = this.configService.get<string>('VOTING_INTERNAL_API_KEY');
    if (!headers || headers['x-api-key'] !== expectedApiKey) {
      throw new UnauthorizedException('Acceso denegado: API Key inválida');
    }

    return true;
  }
}
import { CanActivate, ExecutionContext, Injectable, InternalServerErrorException, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class InternalSecurityGuard implements CanActivate {
  private readonly logger = new Logger('InternalSecurityGuard');

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rpcData = context.switchToRpc().getData();
    const headers = rpcData?.headers;

    this.logger.log('--- [GUARD] Iniciando validación de seguridad ---');

    if (!headers) {
      this.logger.error('Fallo: No se encontraron headers en la petición rpc');
      throw new UnauthorizedException('No se encontraron headers de seguridad');
    }

    // 1. Validar API Key Interna
    const expectedApiKey = this.configService.get<string>('VOTING_INTERNAL_API_KEY');
    if (headers['x-api-key'] !== expectedApiKey) {
      this.logger.error(`Fallo: x-api-key no coincide. Recibida: ${headers['x-api-key']?.substring(0, 5)}...`);
      throw new UnauthorizedException('API Key interna inválida');
    }
    this.logger.log('Paso 1: x-api-key validada correctamente');

    // 2. Validar JWT
    try {
      const gatewayPublicKey = this.configService.get<string>('APIGATEWAY_PUBLIC_KEY_BASE64');

      if (!gatewayPublicKey) {
        this.logger.fatal('Error Crítico: GATEWAY_PUBLIC_KEY_BASE64 no está en el .env');
        throw new InternalServerErrorException('Configuración PUBLIC_KEY no encontrada');
      }

      const publicKey = Buffer.from(gatewayPublicKey, 'base64').toString('utf-8');

      await this.jwtService.verifyAsync(headers['x-internal-token'], {
        publicKey: publicKey,
        algorithms: ['RS256'],
        issuer: 'sevotec-gateway',
        audience: 'voting-service',
      });
      
      this.logger.log('Paso 2: JWT de identidad (RS256) verificado');
    } catch (error) {
      this.logger.error(`Fallo en JWT: ${error.message}`);
      throw new UnauthorizedException('Token de identidad inválido o expirado');
    }

    return true;
  }
}
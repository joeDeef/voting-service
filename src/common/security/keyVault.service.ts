import { Injectable, OnModuleInit, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jose from 'jose';

@Injectable()
export class KeyVaultService implements OnModuleInit {
  private readonly logger = new Logger(KeyVaultService.name);
  private readonly keyCache = new Map<string, any>();

  constructor(private readonly configService: ConfigService) { }

  async onModuleInit() {
    try {
      // 1. Cargamos SU llave privada (para descifrar JWE)
      // 2. Cargamos la pública del GATEWAY (para verificar JWS)
      await this.cacheKey('VOTING_PRIVATE_KEY_BASE64', 'private');
      await this.cacheKey('GATEWAY_PUBLIC_KEY_BASE64', 'public');
      this.logger.log('Llaves criptográficas optimizadas en memoria');
    } catch (error) {
      this.logger.error('Fallo cargando llaves en microservicio:', error.message);
    }
  }

  private async cacheKey(envVar: string, type: 'private' | 'public') {
    const base64 = this.configService.get<string>(envVar);
    if (!base64) throw new Error(`Falta variable: ${envVar}`);

    const keyStr = Buffer.from(base64, 'base64').toString();
    // IMPORTANTE: Los algoritmos deben coincidir EXACTAMENTE con los del Gateway
    const key = type === 'private'
      ? await jose.importPKCS8(keyStr, 'RSA-OAEP-256')
      : await jose.importSPKI(keyStr, 'PS256');

    this.keyCache.set(envVar, key);
  }

  async unpack(envelope: string) {
    try {
      const myPrivKey = this.keyCache.get('VOTING_PRIVATE_KEY_BASE64');
      const gatewayPubKey = this.keyCache.get('GATEWAY_PUBLIC_KEY_BASE64');

      if (!myPrivKey || !gatewayPubKey) {
        throw new Error('Llaves criptográficas no inicializadas en el caché');
      }

      // 1. Descifrar el JWE (Confidencialidad)
      const { plaintext } = await jose.compactDecrypt(envelope, myPrivKey);
      const jws = new TextDecoder().decode(plaintext);

      // 2. Verificar la firma JWS (Integridad y Autenticidad)
      // Usamos compactVerify que nos devuelve el payload protegido
      const { payload } = await jose.compactVerify(jws, gatewayPubKey);

      // 3. Convertir el Buffer de vuelta a Objeto JSON
      const decodedPayload = new TextDecoder().decode(payload);

      // IMPORTANTE: Retornamos el objeto parseado, no el string
      return JSON.parse(decodedPayload);
    } catch (error) {
      this.logger.error(`Error de seguridad en unpack: ${error.message}`);
      throw new BadRequestException('Sobre de seguridad inválido o corrupto');
    }
  }
}
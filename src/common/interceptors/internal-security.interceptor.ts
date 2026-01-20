import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  InternalServerErrorException,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Observable } from 'rxjs';

@Injectable()
export class InternalSecurityInterceptor implements NestInterceptor {
  private readonly logger = new Logger('InternalSecurityInterceptor');

  constructor(private readonly configService: ConfigService) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const rpcCall = context.switchToRpc();
    const dataContainer = rpcCall.getData();

    this.logger.log('--- [INTERCEPTOR] Iniciando desempaquetado de datos ---');

    if (!dataContainer || !dataContainer.headers) {
      this.logger.error('Petición malformada: Estructura de mensaje inválida');
      throw new BadRequestException('Petición malformada: Faltan datos o headers');
    }

    const headers = dataContainer.headers;
    let payload = dataContainer.data;

    const gatewayPublicKeyBase64 = this.configService.get<string>('APIGATEWAY_PUBLIC_KEY_BASE64');
    const authPrivateKeyBase64 = this.configService.get<string>('VOTING_DECRYPT_PRIVATE_KEY_BASE64');

    if (!gatewayPublicKeyBase64 || !authPrivateKeyBase64) {
      this.logger.fatal('Faltan llaves RSA en el entorno para procesar la data');
      throw new InternalServerErrorException('Configuración de llaves incompleta');
    }

    try {
      let payloadString: string;

      const safePayload = payload || {};

      // --- DESCIFRADO ---
      if (headers['x-encrypted'] === 'true') {
        this.logger.log('Detectado contenido cifrado. Iniciando descifrado RSA...');
        const privateKey = Buffer.from(authPrivateKeyBase64, 'base64').toString('utf-8');

        // Validar que exista data para descifrar
        if (!safePayload.data) throw new Error('No hay datos cifrados en el payload');

        const encryptedBuffer = Buffer.from(safePayload.data, 'base64');

        const decrypted = crypto.publicDecrypt(
          {
            key: privateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
          },
          encryptedBuffer
        );

        payloadString = decrypted.toString('utf-8');
        dataContainer.data = JSON.parse(payloadString);
      } else {
        // IMPORTANTE: JSON.stringify(undefined) devuelve undefined, 
        // pero JSON.stringify({}) devuelve "{}"
        payloadString = JSON.stringify(safePayload);
      }

      // --- VERIFICACIÓN DE FIRMA ---
      const signatureRaw = headers['x-signature'];
      if (!signatureRaw) {
        throw new Error('El header x-signature está ausente');
      }

      this.logger.log('Verificando firma digital de integridad (PSS)...');
      const publicKey = Buffer.from(gatewayPublicKeyBase64, 'base64').toString('utf-8');
      const signature = Buffer.from(signatureRaw, 'base64');

      const isVerified = crypto.verify(
        "sha256",
        Buffer.from(payloadString), // Aquí ya no será undefined
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
        },
        signature
      );

      if (!isVerified) {
        this.logger.error('Fallo: La firma digital NO coincide con el contenido');
        throw new Error('La firma digital no coincide');
      }

      this.logger.log('Integridad verificada. Pasando al controlador.');
      return next.handle();

    } catch (error) {
      this.logger.error(`Error de seguridad en Interceptor: ${error.message}`);
      throw new BadRequestException(`Error de seguridad: ${error.message}`);
    }
  }
}
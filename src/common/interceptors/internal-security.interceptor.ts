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
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest();
    const method = request.method;

    this.logger.log(`--- [INTERCEPTOR] Iniciando desempaquetado de datos para ${method} ---`);

    let headers: any;
    let payload: any;

    if (method === 'GET') {
      // Para GET: headers de seguridad están en HTTP headers
      headers = request.headers;
      payload = {}; // GET no tiene payload
      this.logger.log('Procesando petición GET - headers de seguridad en HTTP headers');
    } else {
      // Para POST: headers y payload están en el body
      const dataContainer = request.body;
      if (!dataContainer || !dataContainer.headers) {
        this.logger.error('Petición POST malformada: Estructura de mensaje inválida');
        throw new BadRequestException('Petición POST malformada: Faltan datos o headers');
      }
      headers = dataContainer.headers;
      payload = dataContainer.data;
      this.logger.log('Procesando petición POST - headers de seguridad en body');
    }

    this.logger.log(`Headers recibidos: ${JSON.stringify(Object.keys(headers))}`);
    this.logger.log(`Payload tipo: ${typeof payload}, es null: ${payload === null}, es undefined: ${payload === undefined}`);
    
    if (payload) {
      this.logger.log(`Payload keys: ${JSON.stringify(Object.keys(payload))}`);
      this.logger.log(`Payload completo: ${JSON.stringify(payload)}`);
    }

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
      this.logger.log(`x-encrypted header: '${headers['x-encrypted']}'`);
      if (headers['x-encrypted'] === 'true') {
        this.logger.log('Detectado contenido cifrado. Iniciando descifrado RSA...');
        this.logger.log(`safePayload para cifrado: ${JSON.stringify(safePayload)}`);
        
        const privateKey = Buffer.from(authPrivateKeyBase64, 'base64').toString('utf-8');

        // Validar que exista data para descifrar
        if (!safePayload || !safePayload.data) {
          this.logger.error(`Error: safePayload=${JSON.stringify(safePayload)}, safePayload.data=${safePayload?.data}`);
          throw new Error('No hay datos cifrados en el payload');
        }

        const encryptedBuffer = Buffer.from(safePayload.data, 'base64');

        const decrypted = crypto.privateDecrypt(
          {
            key: privateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
          },
          encryptedBuffer
        );

        payloadString = decrypted.toString('utf-8');
        const decryptedData = JSON.parse(payloadString);
        // Colocar los datos descifrados en request.body para que el controlador los reciba
        if (method === 'POST') {
          request.body = decryptedData;
        }
      } else {

        payloadString = JSON.stringify(safePayload);

        if (method === 'POST' && safePayload && Object.keys(safePayload).length > 0) {
          request.body = safePayload;
        }
      }

      // --- VERIFICACIÓN DE FIRMA ---
      const signatureRaw = headers['x-signature'];
      if (!signatureRaw) {
        throw new Error('El header x-signature está ausente');
      }

      this.logger.log('Verificando firma digital de integridad');
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
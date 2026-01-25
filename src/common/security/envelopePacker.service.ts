import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jose from 'jose';

/**
 * @class InternalSecurityService
 * @description Servicio responsable de generar sobres de seguridad para la comunicación
 * segura entre el API Gateway y los microservicios. Implementa un doble mecanismo:
 * - JWS (JSON Web Signature) para autenticidad e integridad
 * - JWE (JSON Web Encryption) para confidencialidad
 */
@Injectable()
export class EnvelopePackerService {
  private readonly logger = new Logger(EnvelopePackerService.name);

  constructor(private readonly configService: ConfigService) { }

  /**
   * @method getSecurityHeaders
   * @description Genera el sobre de seguridad completo con firma, cifrado y headers de autenticación.
   * @param {string} targetService - Nombre del microservicio de destino.
   * @param {string} privateKeyEnv - Variable de entorno con la clave privada para firmar.
   * @param {string} publicKeyEnv - Variable de entorno con la clave pública del microservicio para cifrar.
   * @param {string} apiKeyEnv - Variable de entorno con la API Key interna.
   * @param {any} payload - Datos a proteger y enviar.
   * @returns {Promise<{headers: object, payload: object}>} Headers de seguridad y payload protegido.
   */
  async getSecurityHeaders(
    targetService: string,
    originService: string,
    privateKeyEnv: string,
    publicKeyEnv: string,
    apiKeyEnv: string,
    payload: any,
  ) {

    try {
      // Cargar y preparar las claves criptográficas
      const { privateKey, publicKey } = await this.loadKeys(privateKeyEnv, publicKeyEnv);
      const internalApiKey = this.configService.get<string>(apiKeyEnv);

      // Firmar el contenido para garantizar autenticidad e integridad
      const signedPayload = await this.signPayload(payload, privateKey, targetService, originService);

      // Cifrar el contenido firmado para garantizar confidencialidad
      const encryptedEnvelope = await this.encryptPayload(signedPayload, publicKey);


      return {
        headers: {
          'x-api-key': internalApiKey,
          'x-security-envelope': encryptedEnvelope, // Token único con todo el contenido protegido
          'x-content-encrypted': 'true',
          'Content-Type': 'application/json',
        },
        payload: { protected: true }, // Payload real está dentro del sobre cifrado
      };
    } catch (error) {
      this.logger.error(`Error al generar sobre de seguridad para ${targetService}: ${error.message}`);
      throw new InternalServerErrorException('Error al procesar la seguridad interna');
    }
  }

  /**
   * @method loadKeys
   * @description Carga y convierte las claves criptográficas desde variables de entorno.
   * @param {string} privVar - Variable de entorno de la clave privada en formato base64.
   * @param {string} pubVar - Variable de entorno de la clave pública en formato base64.
   * @returns {Promise<{privateKey: jose.KeyLike, publicKey: jose.KeyLike}>} Claves cargadas.
   * @private
   */
  private async loadKeys(privVar: string, pubVar: string) {
    const privBase64 = this.configService.get<string>(privVar);
    const pubBase64 = this.configService.get<string>(pubVar);

    if (!privBase64 || !pubBase64) {
      throw new Error(`Claves criptográficas no encontradas: ${privVar} / ${pubVar}`);
    }

    return {
      privateKey: await jose.importPKCS8(Buffer.from(privBase64, 'base64').toString(), 'PS256'),
      publicKey: await jose.importSPKI(Buffer.from(pubBase64, 'base64').toString(), 'RSA-OAEP-256'),
    };
  }

  /**
   * @method signPayload
   * @description Firma digitalmente el payload usando JWS con algoritmo PS256.
   * @param {any} data - Datos a firmar.
   * @param {jose.KeyLike} key - Clave privada para la firma.
   * @param {string} aud - Audiencia (microservicio de destino).
   * @returns {Promise<string>} Token JWS firmado.
   * @private
   */
  private async signPayload(data: any, key: any, aud: string, iss: string) {
    const bodyString = JSON.stringify(data);

    return await new jose.CompactSign(new TextEncoder().encode(bodyString))
      .setProtectedHeader({
        alg: 'PS256',
        iss, // Verifica que esta variable tenga valor (ej: 'voting-service')
        aud
      })
      .sign(key);
  }

  /**
   * @method encryptPayload
   * @description Cifra el payload firmado usando JWE con algoritmo RSA-OAEP-256 y A256GCM.
   * @param {string} signedData - Token JWS a cifrar.
   * @param {jose.KeyLike} key - Clave pública para el cifrado.
   * @returns {Promise<string>} Token JWE cifrado.
   * @private
   */
  private async encryptPayload(signedData: string, key: any) {
    // JOSE genera automáticamente una clave AES interna para cifrar payloads grandes
    return await new jose.CompactEncrypt(new TextEncoder().encode(signedData))
      .setProtectedHeader({
        alg: 'RSA-OAEP-256',
        enc: 'A256GCM'
      })
      .encrypt(key);
  }
}
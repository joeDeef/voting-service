import { ClientProxy } from '@nestjs/microservices';
import { EnvelopePackerService } from 'src/common/security/envelopePacker.service';
import { lastValueFrom } from 'rxjs';
import { InternalServerErrorException, Logger } from '@nestjs/common';

/**
 * @abstract BaseMessageProxy
 * @description Clase base para todos los proxies TCP del API Gateway.
 * Maneja la comunicación segura con microservicios mediante message patterns y sobres de seguridad cifrados.
 */
export abstract class BaseMessageProxy {
  protected abstract readonly logger: Logger;
  protected abstract readonly targetService: string;   // Nombre del microservicio
  protected abstract readonly privateKeyVar: string; // Variable para clave privada de firma (Gateway)
  protected abstract readonly publicKeyVar: string;  // Variable para clave pública del microservicio
  protected abstract readonly apiKeyVar: string;     // Variable para clave de API interna

  constructor(
    protected readonly client: ClientProxy,
    protected readonly securityService: EnvelopePackerService,
    protected readonly originService: string,
  ) { }

  /**
   * @method sendRequest
   * @description Envía una petición segura al microservicio vía TCP con sobre de seguridad cifrado.
   * @template T - Tipo de respuesta esperada del microservicio.
   * @param {string} pattern - Patrón de mensaje para el microservicio.
   * @param {any} data - Datos a enviar al microservicio.
   * @returns {Promise<T>} Respuesta del microservicio.
   */
  protected async sendRequest<T>(pattern: string, data: any): Promise<T> {
    // Generar sobre de seguridad completo con todos los parámetros requeridos
    const { headers, payload: securePayload } = await this.securityService.getSecurityHeaders(
      this.targetService,
      this.originService,
      this.privateKeyVar,
      this.publicKeyVar,
      this.apiKeyVar,
      data
    );

    this.logger.log(`[TCP] Enviando petición segura a ${this.targetService} - Pattern: ${pattern}`);

    try {
      // El payload cifrado se envía como placeholder, el contenido real está en el header de seguridad
      return await lastValueFrom(
        this.client.send(pattern, { data: securePayload, headers })
      );
    } catch (error) {
      this.logger.error(`[TCP] Error completo en ${this.targetService} [${pattern}]:`);
      this.logger.error(`Message: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      this.logger.error(`Error object: ${JSON.stringify(error, null, 2)}`); // Ver estructura completa
      throw new InternalServerErrorException(error.message || `Fallo en comunicación TCP con ${this.targetService}`);
    }
  }
}
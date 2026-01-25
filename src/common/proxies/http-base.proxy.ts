import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { EnvelopePackerService } from 'src/common/security/envelopePacker.service';
import { lastValueFrom } from 'rxjs';
import { InternalServerErrorException, Logger } from '@nestjs/common';

/**
 * @abstract BaseProxy
 * @description Clase base para todos los proxies HTTP del API Gateway.
 * Maneja la comunicación segura con microservicios mediante HTTP con headers de seguridad y cifrado.
 */
export abstract class BaseProxy {
  protected abstract readonly logger: Logger;
  protected abstract readonly targetService: string;
  protected abstract readonly originService: string;
  protected abstract readonly privateKeyVar: string; // Variable para clave privada de firma
  protected abstract readonly publicKeyVar: string;  // Variable para clave pública del microservicio
  protected abstract readonly apiKeyVar: string;     // Variable para clave de API interna
  protected abstract readonly urlVar: string;        // Variable para URL del microservicio

  constructor(
    protected readonly securityService: EnvelopePackerService,
    protected readonly httpService: HttpService,
    protected readonly configService: ConfigService,
  ) { }

  /**
   * @getter baseUrl
   * @description Obtiene la URL base del microservicio desde la configuración.
   * @returns {string} URL base del microservicio.
   */
  protected get baseUrl() {
    return this.configService.get<string>(this.urlVar);
  }

  /**
   * @method sendPost
   * @description Realiza una petición POST segura al microservicio con cifrado completo del payload.
   * @param {string} endpoint - Endpoint del microservicio.
   * @param {any} data - Datos a enviar en el cuerpo de la petición.
   * @param {any} incomingHeaders - Headers adicionales de la petición original.
   * @returns {Promise<any>} Respuesta del microservicio.
   */
  protected async sendPost(endpoint: string, data: any, incomingHeaders: any = {}) {
    // Generar sobre de seguridad con firma y cifrado
    const { headers: securityHeaders, payload: securePayload } = await this.securityService.getSecurityHeaders(
      this.targetService,
      this.originService,
      this.privateKeyVar,
      this.publicKeyVar,
      this.apiKeyVar,
      data
    );

    const headers = { ...incomingHeaders, ...securityHeaders };
    const fullUrl = `${this.baseUrl}${endpoint}`;
    
    this.logger.log(`[HTTP POST] Enviando petición segura a ${this.targetService} - ${endpoint}`);

    try {
      // El interceptor del microservicio espera el sobre cifrado en los headers
      const response = await lastValueFrom(
        this.httpService.post(fullUrl, securePayload, { headers })
      );
      return response.data;
    } catch (error) {
      this.logger.error(`[HTTP POST] Error en ${this.targetService} [${endpoint}]: ${error.message}`);
      throw error.response?.data || new InternalServerErrorException(`Fallo en comunicación HTTP con ${this.targetService}`);
    }
  }

  /**
   * @method sendGet
   * @description Realiza una petición GET segura al microservicio con propagación de tokens de usuario.
   * @param {string} endpoint - Endpoint del microservicio.
   * @param {any} incomingHeaders - Headers de la petición original, incluyendo tokens de autenticación.
   * @returns {Promise<any>} Respuesta del microservicio.
   */
  protected async sendGet(endpoint: string, incomingHeaders: any = {}) {
    // Generar headers de seguridad con payload vacío para peticiones GET
    const { headers: securityHeaders } = await this.securityService.getSecurityHeaders(
      this.targetService,
      this.originService,
      this.privateKeyVar,
      this.publicKeyVar,
      this.apiKeyVar,
      {} 
    );

    let finalHeaders = { ...incomingHeaders, ...securityHeaders };

    // Extraer y propagar token de usuario autenticado
    const userToken = incomingHeaders['x-internal-token'] || 
                     (incomingHeaders['authorization']?.startsWith('Bearer ') && incomingHeaders['authorization'].split(' ')[1]);

    if (userToken) {
      finalHeaders['x-internal-token'] = userToken;
    }

    const fullUrl = `${this.baseUrl}${endpoint}`;
    this.logger.log(`[HTTP GET] Enviando petición segura a ${this.targetService} - ${endpoint}`);

    try {
      const response = await lastValueFrom(this.httpService.get(fullUrl, { headers: finalHeaders }));
      return response.data;
    } catch (error) {
      this.logger.error(`[HTTP GET] Error en ${this.targetService} [${endpoint}]: ${error.message}`);
      throw error.response?.data || new InternalServerErrorException(`Fallo en comunicación HTTP con ${this.targetService}`);
    }
  }
}
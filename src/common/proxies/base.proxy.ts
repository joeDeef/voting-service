// src/common/proxies/base.proxy.ts
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InternalSecurityService } from 'src/common/security/internal-security.service';
import { lastValueFrom } from 'rxjs';
import { InternalServerErrorException, Logger } from '@nestjs/common';

export abstract class BaseProxy {
  protected abstract readonly logger: Logger;
  protected abstract readonly serviceName: string;
  protected abstract readonly privateKeyVar: string;
  protected abstract readonly urlVar: string;

  constructor(
    protected readonly securityService: InternalSecurityService,
    protected readonly httpService: HttpService,
    protected readonly configService: ConfigService,
  ) { }

  // "Variable Global" de URL para el servicio específico
  protected get baseUrl() {
    return this.configService.get<string>(this.urlVar);
  }

  // Método genérico para hacer peticiones POST firmadas
  protected async sendPost(endpoint: string, data: any) {
    // En la línea 27 (y similares como la 48):
    const { headers, payload: securePayload } = await this.securityService.getSecurityHeaders(
      this.serviceName,
      this.privateKeyVar,
      data
    );

    const fullUrl = `${this.baseUrl}${endpoint}`;
    this.logger.log(`Conectando con: ${fullUrl}`);

    try {
      const response = await lastValueFrom(
        this.httpService.post(fullUrl, data, { headers })
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Error en ${this.serviceName}: ${error.message}`);
      throw error.response?.data || new InternalServerErrorException(`Fallo en ${this.serviceName}`);
    }
  }

  // Método genérico para hacer peticiones GET firmadas
  protected async sendGet(endpoint: string) {
    const { headers } = await this.securityService.getSecurityHeaders(
      this.serviceName,
      this.privateKeyVar,
      {}
    );
    const fullUrl = `${this.baseUrl}${endpoint}`;

    try {
      const response = await lastValueFrom(this.httpService.get(fullUrl, { headers }));
      return response.data;
      // ... dentro de sendGet ...
    } catch (error) {
      // Este log te dirá si es ECONNREFUSED (puerto cerrado) o ENOTFOUND (URL mal escrita)
      const errorMessage = error.code === 'ECONNREFUSED'
        ? `CONEXIÓN RECHAZADA: No hay nadie escuchando en ${this.baseUrl}`
        : error.message;

      this.logger.error(`Error GET en ${this.serviceName}: ${errorMessage}`);

      // Imprimimos la URL completa para estar 100% seguros
      this.logger.error(`URL intentada: ${this.baseUrl}${endpoint}`);

      throw error.response?.data || new InternalServerErrorException(`Fallo en ${this.serviceName}`);
    }
  }
}
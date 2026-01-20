import { ClientProxy } from "@nestjs/microservices";
import { InternalSecurityService } from "../security/internal-security.service";
import { lastValueFrom } from "rxjs";
import { InternalServerErrorException, Logger } from "@nestjs/common";

export abstract class BaseMessageProxy {
  protected abstract readonly logger: Logger;
  protected abstract readonly serviceName: string;
  protected abstract readonly privateKeyVar: string;
  protected abstract readonly apiKeyVar: string;

  constructor(
    protected readonly client: ClientProxy,
    protected readonly securityService: InternalSecurityService,
  ) { }

  // MÉTODO ORIGINAL (Para Auth - Con firma)
  protected async sendRequest<T>(pattern: string, data: any): Promise<T> {
    const { headers, payload: securePayload } = await this.securityService.getSecurityHeaders(
      this.serviceName, this.privateKeyVar, this.apiKeyVar, data 
    );
    return await lastValueFrom(this.client.send(pattern, { data: securePayload, headers }));
  }

  // NUEVO MÉTODO (Para Census - Solo envía el mensaje)
  protected async sendPlainRequest<T>(pattern: string, data: any): Promise<T> {
    try {
      // Enviamos 'data' directamente al microservicio
      return await lastValueFrom(this.client.send(pattern, data));
    } catch (error) {
      this.logger.error(`Error en comunicación simple (${pattern}): ${error.message}`);
      throw new InternalServerErrorException(`Fallo en microservicio: ${this.serviceName}`);
    }
  }
}
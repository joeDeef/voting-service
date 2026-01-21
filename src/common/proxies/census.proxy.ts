import { Inject, Injectable, Logger } from "@nestjs/common";
import { BaseMessageProxy } from "./base-message.proxy";
import { InternalSecurityService } from "../security/internal-security.service";
import { ClientProxy } from "@nestjs/microservices";

@Injectable()
export class CensusProxy extends BaseMessageProxy {
  protected readonly logger = new Logger(CensusProxy.name);
  protected readonly serviceName = 'census-service';
  protected readonly privateKeyVar = '';
  protected readonly apiKeyVar = '';

  constructor(
    @Inject('CENSUS_SERVICE') private readonly censusClient: ClientProxy,
    securityService: InternalSecurityService,
  ) {
    super(censusClient, securityService);
  }

  async saveVote(cedula: string) {
    return this.sendPlainRequest('census.save-vote', { cedula });
  }

  async confirmVoto(cedula: string) {
    return this.sendPlainRequest('census.confirm-vote', { cedula });
  }
}
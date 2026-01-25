import { Inject, Injectable, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { BaseMessageProxy } from "./tcp-base.proxy";
import { EnvelopePackerService } from "../security/envelopePacker.service";

@Injectable()
export class CensusProxy extends BaseMessageProxy {
  protected readonly logger = new Logger(CensusProxy.name);
  protected readonly targetService = 'census-service';
  protected readonly privateKeyVar = 'VOTING_SING_PRIVATE_KEY_BASE64'; // Clave para firmar mensajes
  protected readonly apiKeyVar = 'CENSUS_INTERNAL_API_KEY';        // Clave para validación rápida
  protected readonly publicKeyVar = 'CENSUS_ENCRYPT_PUBLIC_KEY';   // Clave pública del microservicio

  constructor(
    @Inject('CENSUS_SERVICE') private readonly censusClient: ClientProxy,
    securityService: EnvelopePackerService,
  ) {
    super(censusClient, securityService, 'voting-service');
  }

  async iniciarVoto(id: string) {
    return this.sendRequest('census.start-voting',{id});
  }

  async saveVote(id: string) {
    return this.sendRequest('census.save-vote', { id });
  }

  async confirmVoto(id: string) {
    return this.sendRequest('census.confirm-vote', { id });
  }
}
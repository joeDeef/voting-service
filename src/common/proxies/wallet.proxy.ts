// src/common/proxies/blockchain.proxy.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InternalSecurityService } from 'src/common/security/internal-security.service';
import { BaseProxy } from './base.proxy';

@Injectable()
export class BlockchainProxy extends BaseProxy {
  protected readonly logger = new Logger(BlockchainProxy.name);
  protected readonly serviceName = 'blockchain-service';
  
  // El Voting Service usa SU llave para firmar peticiones al Blockchain Service
  protected readonly privateKeyVar = 'VOTING_PRIVATE_KEY_BASE64';
  protected readonly urlVar = 'WALLET_SERVICE_URL';
  private readonly walletInteranalApiKey = 'WALLET_INTERNAL_API_KEY';

  constructor(
    protected readonly securityService: InternalSecurityService,
    protected readonly httpService: HttpService,
    protected readonly configService: ConfigService,
  ) {
    super(securityService, httpService, configService);
  }

  /**
   * Envía el voto definitivo para ser registrado en la cadena de bloques.
   */
  async registerVoteOnBlockchain(votePayload: { electionId: string; candidateId: string; timestamp: string; voterToken: number }) {
    // Usamos el método heredado sendPost para enviar el voto firmado y cifrado
    return this.sendPost('/transactions/commit-vote', votePayload);
  }
}
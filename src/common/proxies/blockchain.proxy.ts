import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { EnvelopePackerService } from '../security/envelopePacker.service';
import { BaseProxy } from './http-base.proxy';

@Injectable()
export class BlockchainProxy extends BaseProxy {
  protected readonly logger = new Logger(BlockchainProxy.name);
  protected readonly targetService = 'blockchain-service';
  protected readonly originService = 'voting-service';
  protected readonly privateKeyVar = 'VOTING_BLOCKCHAIN_PRIVATE_KEY_BASE64';
  protected readonly urlVar = 'BLOCKCHAIN_SERVICE_URL';
  protected readonly apiKeyVar = 'BLOCKCHAIN_INTERNAL_API_KEY';
  protected readonly publicKeyVar = 'BLOCKCHAIN_PUBLIC_KEY_BASE64';

  constructor(
    protected readonly securityService: EnvelopePackerService,
    protected readonly httpService: HttpService,
    protected readonly configService: ConfigService,
  ) {
    super(securityService, httpService, configService);
  }

  /**
   * Envía el voto definitivo para ser registrado en la cadena de bloques.
   */
  async registerVoteOnBlockchain(votePayload: { idEleccion: string; idCandidato: string; fechaHora: number; tokenVotante: string }) {
    try {
      // Primero obtenemos el total de votos para logging
     // const totalVotes = await this.sendGet('/voting/total');
      //this.logger.log(`Total votes in blockchain service: ${JSON.stringify(totalVotes)}`);
      
      // Enviamos el voto para ser registrado en blockchain
      const result = await this.sendPost('/voting/vote', votePayload);
      this.logger.log('Vote send top up on blockchain');
      return result;
    } catch (error) {
      this.logger.error('Failed to register vote on blockchain:', error.message);
      throw error;
    }
  }

  /**
   * Obtiene el total de votos registrados en el blockchain
   */
  async getTotalVotes() {
    try {
      return await this.sendGet('/voting/total');
    } catch (error) {
      this.logger.error('Failed to get total votes from blockchain:', error.message);
      throw error;
    }
  }

  /**
   * Verifica si un token ya ha sido usado para votar
   */
  async verifyToken(tokenData: { token: string }) {
    try {
      return await this.sendPost('/voting/verify-token', tokenData);
    } catch (error) {
      this.logger.error('Failed to verify token on blockchain:', error.message);
      throw error;
    }
  }
}
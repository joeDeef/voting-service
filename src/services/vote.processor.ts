import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BlockchainProxy } from 'src/common/proxies/blockchain.proxy';
import { CensusProxy } from 'src/common/proxies/census.proxy';

@Processor('voting-queue')
export class VoteProcessor extends WorkerHost {
  private readonly logger = new Logger(VoteProcessor.name);
  constructor(
    private readonly blockchainProxy: BlockchainProxy,
    private readonly censusProxy: CensusProxy,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { userId } = job.data;
    const startTimestamp = Date.now();

    // 1. Log de inicio con ID de Job y datos de entrada
    this.logger.log(`[JOB START] ID: ${job.id} | Prioridad: ${job.opts.priority} | Usuario: ${userId}`);

    try {
      // 2. Registro del voto en la blockchain
      const blockchainResult = await this.blockchainProxy.registerVoteOnBlockchain(job.data.payload);

      if (blockchainResult.success) {
        const censusResult = await this.censusProxy.confirmVoto(userId);
        await job.log(`Censo actualizado correctamente para ${userId}`);
        const duration = Date.now() - startTimestamp;
        this.logger.log(`[JOB COMPLETED] ID: ${job.id} | Usuario: ${userId} | Tiempo total: ${duration}ms`);

        return {
          status: 'confirmed',
          censusData: censusResult,
          blockchainData: blockchainResult,
          duration: `${duration}ms`,
          processedAt: new Date().toISOString()
        };
      }
      throw new Error('La blockchain no pudo procesar el voto.');

    } catch (error) {
      // Log de error detallado
      this.logger.error(`[JOB FAILED] ID: ${job.id} | Usuario: ${userId}`);
      this.logger.error(`Mensaje: ${error.message}`);

      // Re-lanzamos para que BullMQ maneje los reintentos automáticos
      throw error;
    }
  }
}
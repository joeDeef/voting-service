import { BadRequestException, Injectable, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import Redis from 'ioredis';
import { SetTimeDto } from 'src/dto/setTime.dto';
import { TokenPoolService } from './token-pool.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { BlockchainProxy } from 'src/common/proxies/blockchain.proxy';
import { CensusProxy } from 'src/common/proxies/census.proxy';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    @InjectRedis() private readonly redis: Redis,
    @InjectQueue('voting-queue') private readonly voteQueue: Queue,
    private readonly tokenPool: TokenPoolService,
    private readonly censusProxy: CensusProxy,
  ) { }

  /**
   * Procesa la intención de voto del usuario
   * Actualiza la sesión a estado PENDING_CONFIRMATION
   * @param data - Datos del voto (usuario, candidato, elección)
   * @returns Estado de espera de confirmación
   * @throws UnauthorizedException si la sesión no existe o expiró
   */
  async processCast(data: { userId: string; candidateId: string, electionId: string }) {
    const sessionKey = `session:${data.userId}`;

    this.logger.log(`Procesando intención de voto - Usuario: ${data.userId}, Candidato: ${data.candidateId}`);

    try {
      const sessionRaw = await this.redis.get(sessionKey);

      if (!sessionRaw) {
        this.logger.warn(`Sesión no encontrada para usuario: ${data.userId}`);
        throw new UnauthorizedException('Sesión no encontrada o expirada. Debe iniciar el proceso nuevamente.');
      }

      const session = JSON.parse(sessionRaw);
      const ttl = await this.redis.ttl(sessionKey);

      if (ttl <= 0) {
        this.logger.warn(`Tiempo de votación expirado para usuario: ${data.userId}`);
        throw new UnauthorizedException('El tiempo para votar ha terminado.');
      }

      // Actualizar estado a pendiente de confirmación
      session.candidateId = data.candidateId;
      session.electionId = data.electionId;
      session.status = 'PENDING_CONFIRMATION';

      await this.redis.set(sessionKey, JSON.stringify(session), 'EX', ttl);

      this.logger.log(`Voto en espera de confirmación para usuario: ${data.userId} - TTL restante: ${ttl}s`);

      return {
        status: 'WAITING_FOR_USER_CONFIRMATION',
        message: 'Candidato seleccionado. Por favor, confirme su voto.',
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Error procesando intención de voto para usuario ${data.userId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error interno al procesar la intención de voto.');
    }
  }

  /**
   * Finaliza y confirma definitivamente el voto del usuario
   * Encola el voto para registro en blockchain y notifica al censo
   * @param data - Datos de confirmación del voto
   * @returns Confirmación de voto procesado
   * @throws UnauthorizedException si la sesión expiró
   * @throws BadRequestException si los datos no coinciden
   */
  async finalizeVote(data: { userId: string; candidateId: string, electionId: string }) {
    const sessionKey = `session:${data.userId}`;

    this.logger.log(`Finalizando voto para usuario: ${data.userId}`);

    try {
      const sessionRaw = await this.redis.get(sessionKey);

      if (!sessionRaw) {
        this.logger.warn(`Sesión de confirmación expirada para usuario: ${data.userId}`);
        throw new UnauthorizedException('La sesión de confirmación ha expirado.');
      }

      const session = JSON.parse(sessionRaw);

      // Validar integridad de los datos
      if (session.electionId !== data.electionId || session.candidateId !== data.candidateId) {
        await this.redis.del(sessionKey);
        this.logger.warn(`Datos de confirmación incorrectos para usuario: ${data.userId}`);
        throw new BadRequestException('Los datos de confirmación no coinciden.');
      }

      // Notificar al servicio de censo
      await this.censusProxy.saveVote(data.userId);
      this.logger.log(`Estado actualizado a GUARDANDO_VOTO para usuario: ${data.userId}`);

      const fechaEcuador = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Guayaquil" }));

      // Encolar voto para registro en blockchain
      await this.voteQueue.add('register-blockchain-vote', {
        userId: data.userId,
        payload: {
          tokenVotante: session.voterToken,
          idEleccion: data.electionId,
          idCandidato: session.candidateId,
          fechaHora: fechaEcuador.toISOString(), // Esto guardará el tiempo real de Ecuador
        }
      }, {
        jobId: `vote-${data.userId}-${data.electionId}`,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
      });

      // Limpiar sesión inmediatamente
      await this.redis.del(sessionKey);

      this.logger.log(`Voto encolado exitosamente para usuario: ${data.userId}`);

      return {
        success: true,
        message: 'Voto recibido. Procesando registro en blockchain.'
      };

    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error finalizando voto para usuario ${data.userId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Error interno al procesar el voto.');
    }
  }

  /**
   * Inicializa una sesión de votación para un usuario
   * Crea el registro en Redis con token anónimo y tiempo de expiración
   * @param data - Datos de configuración de la sesión
   * @returns Confirmación de sesión creada con timestamp de expiración
   * @throws InternalServerErrorException si falla la inicialización
   */
  async initializeSession(data: SetTimeDto) {
    this.logger.log(`Inicializando sesión para usuario: ${data.userId}`);

    try {
      // Notificar al censo que inicia la votación
      await this.censusProxy.iniciarVoto(data.userId);

      // Obtener token anónimo del pool
      const anonymousToken = await this.tokenPool.popToken();

      if (!anonymousToken) {
        this.logger.error('Pool de tokens anónimos agotado');
        throw new InternalServerErrorException('No hay tokens disponibles para votación');
      }

      // Validar tiempo de expiración
      const nowUnix = Math.floor(Date.now() / 1000);
      if (data.expirationTime <= nowUnix) {
        this.logger.warn(`Tiempo de expiración inválido para usuario ${data.userId}: ${data.expirationTime}`);
        throw new BadRequestException('El tiempo de expiración ya ha pasado');
      }

      // Crear registro de sesión
      const sessionRecord = {
        userId: data.userId,
        voterToken: anonymousToken,
        expirationTime: data.expirationTime,
        candidateId: null,
        status: 'CREATED'
      };

      // Guardar en Redis con expiración automática
      await this.redis.set(
        `session:${data.userId}`,
        JSON.stringify(sessionRecord),
        'EXAT',
        data.expirationTime
      );

      const ttlVisual = data.expirationTime - nowUnix;
      this.logger.log(`Sesión creada para usuario ${data.userId} - Expira en ${ttlVisual}s - Token: ${anonymousToken?.substring(0, 10)}...`);

      return {
        success: true,
        expiresAt: new Date(data.expirationTime * 1000).toISOString(),
        sessionId: data.userId
      };

    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error inicializando sesión para usuario ${data.userId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('No se pudo establecer la sesión de votación');
    }
  }
}

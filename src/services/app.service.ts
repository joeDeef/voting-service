import { BadRequestException, Injectable, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import Redis from 'ioredis';
import { SetTimeDto } from 'src/dto/setTime.dto';
import { TokenPoolService } from './token-pool.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { BlockchainProxy } from 'src/common/proxies/blockchain.proxy';
import { CensusProxy } from 'src/common/proxies/census.proxy';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly blockchainProxy: BlockchainProxy,
    private readonly tokenPool: TokenPoolService,
    private readonly censusProxy: CensusProxy
  ) { }

  getHello(): string {
    return 'Hello World!';
  }

  // Recibe la opción elegida por el usuario
  async processCast(data: { userId: string; candidateId: string, electionId: string }) {
    const sessionKey = `session:${data.userId}`;
    const sessionRaw = await this.redis.get(sessionKey);

    // 1. Validar existencia (Si no está, se saltó el setTime o expiró)
    if (!sessionRaw) {
      throw new UnauthorizedException('Sesión no encontrada o expirada. Debe iniciar el proceso nuevamente.');
    }

    const session = JSON.parse(sessionRaw);

    // 2. Validar tiempo restante (Opcional, Redis ya lo hace con el TTL, pero puedes ser extra precavido)
    const ttl = await this.redis.ttl(sessionKey);
    if (ttl <= 0) {
      throw new UnauthorizedException('El tiempo para votar ha terminado.');
    }

    // 3. Actualizar estado a "Pendiente de Confirmación"
    session.candidateId = data.candidateId;
    session.electionId = data.electionId;
    session.status = 'PENDING_CONFIRMATION';

    // 4. Guardar en Redis manteniendo el tiempo restante exacto
    await this.redis.set(sessionKey, JSON.stringify(session), 'EX', ttl);

    this.logger.log(`Voto en espera de confirmación para usuario: ${data.userId}`);

    // 5. Responder al Gateway para que el Front muestre el modal de confirmación
    return {
      status: 'WAITING_FOR_USER_CONFIRMATION',
      message: 'Candidato seleccionado. Por favor, confirme su voto.',
      candidateId: data.candidateId,
      electionId: data.electionId
    };
  }

  async finalizeVote(data: { userId: string; candidateId: string, electionId: string }) {
    const sessionKey = `session:${data.userId}`;
    const sessionRaw = await this.redis.get(sessionKey);

    // 1. Validar existencia de la sesión en caché
    if (!sessionRaw) {
      throw new UnauthorizedException('La sesión de confirmación ha expirado.');
    }

    const session = JSON.parse(sessionRaw);

    const isElectionValid = session.electionId === data.electionId;
    const isCandidateValid = session.candidateId === data.candidateId;
    
    if (!isElectionValid || !isCandidateValid) {
      this.logger.error(`ALERTA DE SEGURIDAD: Intento de alteración de voto para el usuario ${data.userId}`);

      // Si detectamos manipulación, borramos la sesión por seguridad inmediatamente
      await this.redis.del(sessionKey);

      throw new BadRequestException('Los datos de confirmación no coinciden con la selección original.');
    }

    // 2. Validar que el flujo de estados sea correcto (Máquina de Estados)
    if (session.status !== 'PENDING_CONFIRMATION') {
      throw new BadRequestException('Estado de sesión inválido para confirmar.');
    }

    try {
      // 3. ENVIAR A BLOCKCHAIN SERVICE vía Proxy
      // El proxy se encarga de firmar la petición con la llave del Voting Service
      await this.blockchainProxy.registerVoteOnBlockchain({
        idEleccion: data.electionId,
        idCandidato: session.candidateId,
        fechaHora: Date.now(),
        tokenVotante: session.voterToken,
      });

      // 1. Guardamos el mapeo persistente: voterToken -> userId
      // Esta llave NO tiene que ver con la sesión, es para el callback asíncrono
      const trackingKey = `tracking:vote:${session.voterToken}`;
      await this.redis.set(trackingKey, data.userId, 'EX', 86400);

      await this.censusProxy.saveVote(data.userId);

      // 3. Marcar el userID en la lista negra de la API GATEWAY para que no pueda votar de nuevo (Lo borramos de cache)
      await this.redis.del(sessionKey);

      this.logger.log(`Voto registrado y sesión eliminada para: ${data.userId}`);

      return {
        success: true,
        message: 'Voto procesado y subiendo a la blockchain.'
      };

    } catch (error) {
      throw new InternalServerErrorException('Fallo crítico al registrar el voto en la red blockchain.');
    }
  }

  async confirmUpBlockchain(payload: { voterToken: string }) {
    const trackingKey = `tracking:vote:${payload.voterToken}`;

    // Recuperamos el userId del "puente" de Redis
    const userId = await this.redis.get(trackingKey);

    if (!userId) {
      this.logger.error(`Error crítico: No hay rastro del usuario para el token ${payload.voterToken}`);
      return;
    }

    // Ahora sí, cerramos el ciclo en el Censo
    await this.censusProxy.confirmVoto(userId);

    // Limpiamos el puente
    await this.redis.del(trackingKey);

    this.logger.log(`Estado actualizado a VOTO_CONFIRMADO para el usuario ${userId}`);
  }

  async initializeSession(data: SetTimeDto) {
    try {
      await this.censusProxy.iniciarVoto(data.userId);

      // 1. Extraer el token anónimo
      const anonymousToken = await this.tokenPool.popToken();

      // 2. Validar que la fecha no sea pasada (esto sigue siendo necesario)
      const nowUnix = Math.floor(Date.now() / 1000);
      if (data.expirationTime <= nowUnix) {
        throw new Error('El tiempo de expiración ya ha pasado');
      }

      // 3. Estructura del registro
      const sessionRecord = {
        userId: data.userId,
        voterToken: anonymousToken,
        expirationTime: data.expirationTime,
        candidateId: null,
        status: 'CREATED'
      };

      // 4. GUARDAR EN REDIS
      // Usamos EXPIREAT con el timestamp absoluto directamente
      await this.redis.set(
        `session:${data.userId}`,
        JSON.stringify(sessionRecord),
        'EXAT',
        data.expirationTime
      );

      const ttlVisual = data.expirationTime - nowUnix;
      this.logger.log(`Sesión creada para usuario ${data.userId}. Expira en ${ttlVisual}s (Timestamp: ${data.expirationTime})`);

      return {
        success: true,
        expiresAt: new Date(data.expirationTime * 1000).toISOString()
      };

    } catch (error) {
      this.logger.error(`Fallo al inicializar sesión: ${error.message}`);
      throw new InternalServerErrorException('No se pudo establecer la sesión');
    }
  }
}

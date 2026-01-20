import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import Redis from 'ioredis';
import { SetTimeDto } from 'src/dto/setTime.dto';
import { TokenPoolService } from './token-pool.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { BlockchainProxy } from 'src/common/proxies/wallet.proxy';
import { timestamp } from 'rxjs';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly blockchainProxy: BlockchainProxy,
    private readonly tokenPool: TokenPoolService
  ) { }

  getHello(): string {
    return 'Hello World!';
  }

  // Recibe la opción elegida por el usuario
  async processCast(userId: string, candidateId: string, electionId: string) {
    const sessionKey = `session:${userId}`;
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
    session.candidateId = candidateId;
    session.status = 'PENDING_CONFIRMATION';

    // 4. Guardar en Redis manteniendo el tiempo restante exacto
    await this.redis.set(sessionKey, JSON.stringify(session), 'EX', ttl);

    this.logger.log(`Voto en espera de confirmación para usuario: ${userId}`);

    // 5. Responder al Gateway para que el Front muestre el modal de confirmación
    return {
      status: 'WAITING_FOR_USER_CONFIRMATION',
      message: 'Candidato seleccionado. Por favor, confirme su voto.',
      candidateId: candidateId,
      electionId: electionId
    };
  }

  async finalizeVote(userId: string, electionId: string) {
    const sessionKey = `session:${userId}`;
    const sessionRaw = await this.redis.get(sessionKey);

    // 1. Validar existencia de la sesión en caché
    if (!sessionRaw) {
      throw new UnauthorizedException('La sesión de confirmación ha expirado.');
    }

    const session = JSON.parse(sessionRaw);

    // 2. Validar que el flujo de estados sea correcto (Máquina de Estados)
    if (session.status !== 'PENDING_CONFIRMATION') {
      throw new BadRequestException('Estado de sesión inválido para confirmar.');
    }

    try {
      // 3. ENVIAR A BLOCKCHAIN SERVICE vía Proxy
      // El proxy se encarga de firmar la petición con la llave del Voting Service
      const blockchainResult = await this.blockchainProxy.registerVoteOnBlockchain({
        electionId: electionId,
        candidateId: session.candidateId,
        timestamp: Date.now().toString(),
        voterToken: session.voterToken,
      });

      // TODO: Avisar al Census SERvice que actualice el estado a GUARDANDO_VOTO
      // TODO: Marcar el userID en la lista negra de la API GATEWAY para que no pueda votar de nuevo

      // 4. Limpiar Redis tras el éxito del envío
      // Esto asegura que el mismo usuario no pueda re-confirmar el mismo voto
      await this.redis.del(sessionKey);

      return {
        success: true,
        message: 'Voto procesado y enviado a la blockchain con éxito.'
      };

    } catch (error) {
      // Es vital manejar errores de red o del servicio externo para auditoría
      throw new InternalServerErrorException('Fallo crítico al registrar el voto en la red blockchain.');
    }
  }

  confirmUpBlockchain(): string {
    // Logic to update the blockchain
    return 'Blockchain updated successfully!';
  }

  async initializeSession(data: SetTimeDto) {
    try {
      // 1. Extraer el token anónimo del pool de Redis
      const anonymousToken = await this.tokenPool.popToken();

      // 2. Calcular el Tiempo de Vida (TTL) para Redis
      const nowUnix = Math.floor(Date.now() / 1000);
      const ttlSeconds = data.expirationTime - nowUnix;

      if (ttlSeconds <= 0) {
        throw new Error('El tiempo de expiración ya ha pasado');
      }

      // 3. Estructura del registro para la caché
      const sessionRecord = {
        userId: data.userId,
        voterToken: anonymousToken, // Token extraído del pool
        expirationTime: data.expirationTime,
        candidateId: null,
        status: 'CREATED'
      };

      // 4. Guardar en Redis usando el userId como llave única
      // Esto previene que un mismo usuario inicie múltiples sesiones simultáneas
      await this.redis.set(
        `session:${data.userId}`,
        JSON.stringify(sessionRecord),
        'EX',
        ttlSeconds
      );

      this.logger.log(`Sesión de caché creada para usuario ${data.userId} (TTL: ${ttlSeconds}s)`);

      return {
        success: true,
        expiresAt: new Date(data.expirationTime * 1000).toISOString()
      };

    } catch (error) {
      this.logger.error(`Fallo al inicializar sesión: ${error.message}`);
      throw new InternalServerErrorException('No se pudo establecer la sesión de votación');
    }
  }
}

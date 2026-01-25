import { Body, Controller, Get, Post, UseGuards, UseInterceptors, Logger } from '@nestjs/common';
import { AppService } from './services/app.service';
import { SetTimeDto } from './dto/setTime.dto';
import { InternalApiKeyGuard } from './common/guards/internalApiKey.guard';
import { EnvelopeOpenerInterceptor } from './common/interceptors/envelopeOpener.interceptor';

/**
 * Controlador principal del servicio de votación
 * Maneja la configuración de sesiones, envío y confirmación de votos
 */
@Controller()
@UseGuards(InternalApiKeyGuard)
@UseInterceptors(EnvelopeOpenerInterceptor)
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) { }

  /**
   * Configura los tiempos de votación e inicializa la sesión electoral
   * @param data - Configuración de tiempos de la elección
   * @returns Confirmación de inicialización de sesión
   */
  @Post('setTime')
  async setTime(@Body() data: SetTimeDto) {
    this.logger.log('Sesión de votación inicializada exitosamente', data);

    try {
      const result = await this.appService.initializeSession(data);
      return result;
    } catch (error) {
      this.logger.error(`Error inicializando sesión de votación: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Procesa la intención de voto de un ciudadano
   * Guarda la opción elegida en estado PENDING_CONFIRMATION
   * @param data - Datos del voto (usuario, candidato, elección)
   * @returns Confirmación de procesamiento de intención de voto
   */
  @Post('cast')
  async castVote(@Body() data: { userId: string; candidateId: string, electionId: string }) {
    this.logger.log(`Procesando intención de voto - Usuario: ${data.userId}, Candidato: ${data.candidateId}, Elección: ${data.electionId}`);

    try {
      const result = await this.appService.processCast(data);
      this.logger.log(`Intención de voto procesada para usuario: ${data.userId}`);
      return result;
    } catch (error) {
      this.logger.error(`Error procesando intención de voto para usuario ${data.userId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Confirma definitivamente el voto emitido por un ciudadano
   * @param data - Datos del voto a confirmar (usuario, candidato, elección)
   * @returns Confirmación de voto finalizado
   */
  @Post('confirm')
  async confirmVote(@Body() data: { userId: string; candidateId: string, electionId: string }) {
    this.logger.log(`Confirmando voto - Usuario: ${data.userId}, Candidato: ${data.candidateId}, Elección: ${data.electionId}`);

    try {
      const result = await this.appService.finalizeVote(data);
      this.logger.log(`Voto confirmado exitosamente para usuario: ${data.userId}`);
      return result;
    } catch (error) {
      this.logger.error(`Error confirmando voto para usuario ${data.userId}: ${error.message}`, error.stack);
      throw error;
    }
  }
}

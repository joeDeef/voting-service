import { Body, Controller, Get, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { AppService } from './services/app.service';
import { SetTimeDto } from './dto/setTime.dto';
import { InternalSecurityGuard } from './common/guards/internal-security.guard';
import { InternalSecurityInterceptor } from './common/interceptors/internal-security.interceptor';

@Controller()
@UseGuards(InternalSecurityGuard)
@UseInterceptors(InternalSecurityInterceptor)
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get('test')
  getHello(): string {
    return this.appService.getHello();
  }

  // Peticion desde el API Gateway para establecer el tiempo de votacion
  @Post('setTime')
  async setTime(@Body() data: SetTimeDto) {
    // Iniciamos la sesión de votación en caché
    return await this.appService.initializeSession(data);
  }

  // Peticion desde el API Gateway para emitir un voto
  @Post('cast')
  async castVote(@Body() data: { userId: string; candidateId: string, electionId: string }) {
    //Guardamos la opción elegida y ponemos el estado en "PENDING_CONFIRMATION"
    return await this.appService.processCast(data);
  }

  // Peticion desde el API Gateway para confirmar un voto
  @Post('confirm')
  async confirmVote(@Body() data: { userId: string; candidateId: string, electionId: string }) {
    return await this.appService.finalizeVote(data);
  }

  // Peticion desde el Wallet Service que avisa que ya se subio a la blockchain
  @Post('upBlockhain')
  confirmUpBlockchain(@Body() data: {voterToken: string}) {
    return this.appService.confirmUpBlockchain(data);
  }
}

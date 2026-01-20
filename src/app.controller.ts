import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AppService } from './services/app.service';
import { InternalAuthGuard } from './common/guards/internal-auth-guard';
import { SetTimeDto } from './dto/setTime.dto';

@Controller()
//@UseGuards(InternalAuthGuard)
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
    return await this.appService.processCast(data.userId, data.candidateId, data.electionId);
  }

  // Peticion desde el API Gateway para confirmar un voto
  @Post('confirm')
  async confirmVote(@Body() data: { userId: string, electionId: string }) {
    return await this.appService.finalizeVote(data.userId, data.electionId);
  }

  // Peticion desde el Wallet Service que avisa que ya se subio a la blockchain
  @Post('upBlockhain')
  confirmUpBlockchain(@Body() data: any): string {
    return this.appService.confirmUpBlockchain();
  }
}

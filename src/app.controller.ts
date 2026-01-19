import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AppService } from './services/app.service';
import { InternalAuthGuard } from './common/guards/internal-auth-guard';

@Controller('voting')
@UseGuards(InternalAuthGuard)
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('test')
  getHello(): string {
    return this.appService.getHello();
  }

  // Peticion desde el API Gateway para establecer el tiempo de votacion
  @Post('setTime')
  setTiem(@Body() timeVote: any): string {
    return this.appService.setTimeot();
  }

  // Peticion desde el API Gateway para emitir un voto
  @Post('cast')
  castVote(@Body() voteData: any): string {
    return this.appService.castVote();
  }

  // Peticion desde el API Gateway para confirmar un voto
  @Post('confirm')
  confirmVote(@Body() confirmData: any): string {
    return this.appService.confirmVote();
  }

  // Peticion desde el Wallet Service que avisa que ya se subio a la blockchain
  @Post('upBlockhain')
  confirmUpBlockchain(@Body() data: any): string {
    return this.appService.confirmUpBlockchain();
  }
}

import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { InternalAuthGuard } from './common/guards/internal-auth-guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @UseGuards(InternalAuthGuard)
  @Get('test')
  getHello(): string {
    return this.appService.getHello();
  }
}

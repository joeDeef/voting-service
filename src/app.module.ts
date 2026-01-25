import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { HttpModule } from '@nestjs/axios';
import { LoggerMiddleware } from './common/middlewares/logger.middleware';
import { AppController } from './app.controller';
import { AppService } from './services/app.service';
import { RedisModule } from '@nestjs-modules/ioredis';
import { TokenPoolService } from './services/token-pool.service';
import { BlockchainProxy } from './common/proxies/blockchain.proxy';
import { InternalApiKeyGuard } from './common/guards/internalApiKey.guard';
import { CensusProxy } from './common/proxies/census.proxy';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { VoteProcessor } from './services/vote.processor';
import { EnvelopeOpenerInterceptor } from './common/interceptors/envelopeOpener.interceptor';
import { KeyVaultService } from './common/security/keyVault.service';
import { EnvelopePackerService } from './common/security/envelopePacker.service';
@Module({
  imports:[
    BullModule.forRoot({
      connection: {
        host: 'localhost',
        port: 6379,
      },
    }),
    BullModule.registerQueue({
      name: 'voting-queue',
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    JwtModule.register({}),
    HttpModule,
    RedisModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: 'single',
        url: configService.get<string>('REDIS_URL') || 'redis://localhost:6379',
      }),
      inject: [ConfigService],
    }),
    ClientsModule.register([
      {
        name: 'CENSUS_SERVICE',
        transport: Transport.TCP,
        options: {
          // Usamos variables de entorno para mayor flexibilidad
          host: process.env.CENSUS_SERVICE_HOST || '127.0.0.1', 
          port: Number(process.env.CENSUS_SERVICE_PORT) || 3001,
        },
      },
    ]),
  ],
  providers: [
    AppService,
    TokenPoolService,
    BlockchainProxy,
    CensusProxy,
    VoteProcessor,
    EnvelopeOpenerInterceptor,
    EnvelopePackerService,
    InternalApiKeyGuard,
    KeyVaultService,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
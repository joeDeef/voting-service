import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { HttpModule } from '@nestjs/axios';
import { LoggerMiddleware } from './common/middlewares/logger.middleware';
import { AppController } from './app.controller';
import { AppService } from './services/app.service';
import { RedisModule } from '@nestjs-modules/ioredis';
import { TokenPoolService } from './services/token-pool.service';
import { BlockchainProxy } from './common/proxies/wallet.proxy';
import { InternalSecurityService } from './common/security/internal-security.service';
import { InternalSecurityGuard } from './common/guards/internal-security.guard';
import { CensusProxy } from './common/proxies/census.proxy';
import { ClientsModule, Transport } from '@nestjs/microservices';
@Module({
  imports: [
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
    {
      provide: APP_GUARD,
      useClass: InternalSecurityGuard,
    },
    TokenPoolService,
    BlockchainProxy,
    InternalSecurityService,
    CensusProxy
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { HttpModule } from '@nestjs/axios'; // 1. IMPORTANTE: Para peticiones externas
import { InternalAuthGuard } from './common/guards/internal-auth-guard';
import { LoggerMiddleware } from './common/middlewares/logger.middleware';
import { AppController } from './app.controller';
import { AppService } from './services/app.service';
import { RedisModule } from '@nestjs-modules/ioredis';
import { TokenPoolService } from './services/token-pool.service';
import { BlockchainProxy } from './common/proxies/wallet.proxy'; // 2. Importa el Proxy
import { InternalSecurityService } from './common/security/internal-security.service'; // 3. Importa el servicio de seguridad

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    JwtModule.register({}),
    HttpModule, // 4. Agregado para que los proxies funcionen
    RedisModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: 'single',
        url: configService.get<string>('REDIS_URL') || 'redis://localhost:6379',
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: InternalAuthGuard,
    },
    TokenPoolService,
    BlockchainProxy,        // ✅ 5. Agregado: Ahora AppService puede encontrarlo
    InternalSecurityService // ✅ 6. Agregado: Para que el Proxy pueda firmar/cifrar
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP_AUDIT');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || '';

    // Log al recibir la petición
    this.logger.log(`>>> [PETICIÓN ENTRANTE] ${method} ${originalUrl} - IP: ${ip} - Agente: ${userAgent}`);

    // Log al terminar la petición
    res.on('finish', () => {
      const { statusCode } = res;
      this.logger.log(`<<< [RESPUESTA ENVIADA] ${method} ${originalUrl} - STATUS: ${statusCode}`);
    });

    next();
  }
}
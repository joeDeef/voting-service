import { Injectable, NestInterceptor, ExecutionContext, CallHandler, BadRequestException } from '@nestjs/common';
import { from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { KeyVaultService } from '../security/keyVault.service';

// envelopeOpener.interceptor.ts
@Injectable()
export class EnvelopeOpenerInterceptor implements NestInterceptor {
  constructor(private readonly securityService: KeyVaultService) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const type = context.getType();
    let envelope: string;
    let dataTarget: any;

    if (type === 'http') {
      const request = context.switchToHttp().getRequest();
      envelope = request.headers['x-security-envelope'];
      // Si el body no existe (ej. en un GET), lo inicializamos para poder mutarlo
      if (!request.body) request.body = {};
      dataTarget = request.body;
    } else {
      const rpcData = context.switchToRpc().getData();
      envelope = rpcData?.headers?.['x-security-envelope'];
      dataTarget = rpcData;
    }

    if (!envelope) {
      throw new BadRequestException('Falta x-security-envelope en los headers');
    }

    return from(this.securityService.unpack(envelope)).pipe(
      switchMap((decryptedData) => {
        // SEGURIDAD EXTRA: Si por alguna razón unpack devolvió un string, lo parseamos
        let finalData = decryptedData;
        if (typeof decryptedData === 'string') {
          try {
            finalData = JSON.parse(decryptedData);
          } catch {
            finalData = {}; 
          }
        }

        // 1. Borrar todas las propiedades actuales (como "protected: true")
        Object.keys(dataTarget).forEach(key => delete dataTarget[key]);
        
        // 2. Borrar propiedad 'data' si existe (común en protocolos TCP de Nest)
        if (dataTarget.data) delete dataTarget.data;

        // 3. Inyectar los datos reales como objeto
        Object.assign(dataTarget, finalData);
        
        return next.handle();
      })
    );
  }
}
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 1. Extraemos el token del header personalizado
    const token = request.headers['x-internal-token'];

    if (!token) {
      throw new UnauthorizedException('Acceso denegado: No se encontró firma del Gateway');
    }

    try {
      // 2. Obtenemos la llave pública en Base64 y la decodificamos a PEM
      // 1. Intentamos obtener la llave del entorno
      const base64Key = this.configService.get<string>('APIGATEWAY_PUBLIC_KEY_BASE64');

      // 2. Verificación de seguridad (Type Guard)
      if (!base64Key) {
        // Si la llave no existe, lanzamos un error de configuración
        // Esto protege la Seguridad del canal (RNF02) al evitar estados indefinidos
        throw new UnauthorizedException('Error de sistema: Llave pública interna no configurada');
      }

      // 3. Ahora TypeScript ya no marcará error porque sabe que 'base64Key' es string
      const publicKey = Buffer.from(base64Key, 'base64').toString('utf-8');
      // 3. Verificamos la firma usando el algoritmo asimétrico RS256
      const payload = await this.jwtService.verifyAsync(token, {
        publicKey: publicKey,
        algorithms: ['RS256'],
      });

      // 4. (Opcional) Validamos que el destinatario (aud) sea este microservicio
      // if (payload.aud !== 'auth-service') throw new Error();

      return true; // La firma es válida, permitimos pasar al controlador
    } catch (error) {
      console.error('Error de verificación de firma interna:', error);
      throw new UnauthorizedException('Acceso denegado: Firma interna inválida o expirada');
    }
  }
}
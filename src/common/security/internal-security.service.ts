import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class InternalSecurityService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async getSecurityHeaders(
    targetService: string, 
    signingKeyEnv: string, 
    body: any, 
    encryptionKeyEnv?: string // Parámetro opcional para cifrado
  ) {
    const signingKeyBase64 = this.configService.get<string>(signingKeyEnv);
    if (!signingKeyBase64) throw new InternalServerErrorException(`Llave de firma ${signingKeyEnv} no encontrada.`);

    try {
      const privateKey = Buffer.from(signingKeyBase64, 'base64').toString('utf-8');
      let finalBody = JSON.stringify(body || {}).replace(/\s+/g, '');
      let isEncrypted = false;

      // --- PASO 1: CIFRADO (Opcional) ---
      if (encryptionKeyEnv) {
        const pubKeyBase64 = this.configService.get<string>(encryptionKeyEnv);
        if (pubKeyBase64) {
          const publicKey = Buffer.from(pubKeyBase64, 'base64').toString('utf-8');
          
          // Ciframos el body con la llave pública del destino
          const buffer = Buffer.from(finalBody);
          const encrypted = crypto.publicEncrypt(
            {
              key: publicKey,
              padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
              oaepHash: "sha256",
            },
            buffer
          );
          finalBody = encrypted.toString('base64');
          isEncrypted = true;
        }
      }

      // --- PASO 2: FIRMA (Siempre se ejecuta) ---
      // Firmamos el 'finalBody' (ya sea texto plano o cifrado)
      const hash = crypto.createHash('sha256').update(finalBody).digest('hex');
      const signature = crypto.sign("sha256", Buffer.from(hash), {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      }).toString('base64');

      // --- PASO 3: JWT de Identidad ---
      const token = await this.jwtService.signAsync(
        { iss: 'sevotec-gateway', aud: targetService },
        { privateKey: privateKey, algorithm: 'RS256', expiresIn: '20s' }
      );

      return {
        headers: {
          'x-internal-token': token,
          'x-signature': signature,
          'x-encrypted': isEncrypted ? 'true' : 'false',
          'Content-Type': 'application/json',
        },
        payload: isEncrypted ? { data: finalBody } : body // Si cifró, envía el base64, si no, el body original
      };
    } catch (error) {
      throw new InternalServerErrorException(`Fallo en seguridad: ${error.message}`);
    }
  }
}
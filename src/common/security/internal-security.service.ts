import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as crypto from "crypto";

@Injectable()
export class InternalSecurityService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async getSecurityHeaders(
    targetService: string,
    signingKeyEnv: string,
    apiKeyEnv: string,
    body: any,
    encryptionKeyEnv?: string
  ) {
    const signingKeyBase64 = this.configService.get<string>(signingKeyEnv);
    const internalApiKey = this.configService.get<string>(apiKeyEnv);

    if (!signingKeyBase64) throw new InternalServerErrorException(`Llave de firma ${signingKeyEnv} no encontrada.`);
    if (!internalApiKey) throw new InternalServerErrorException(`API Key ${apiKeyEnv} no encontrada.`);

    try {
      const privateKey = Buffer.from(signingKeyBase64, 'base64').toString('utf-8');
      const originalBodyString = JSON.stringify(body || {});
      let finalPayload = body;
      let isEncrypted = false;

      // 1. FIRMA (Sobre contenido plano)
      const signature = crypto.sign(
        "sha256",
        Buffer.from(originalBodyString),
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
        }
      ).toString('base64');

      // 2. CIFRADO (Opcional)
      if (encryptionKeyEnv) {
        const pubKeyBase64 = this.configService.get<string>(encryptionKeyEnv);
        if (pubKeyBase64) {
          const publicKey = Buffer.from(pubKeyBase64, 'base64').toString('utf-8');
          const encrypted = crypto.publicEncrypt(
            {
              key: publicKey,
              padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
              oaepHash: "sha256",
            },
            Buffer.from(originalBodyString)
          );
          finalPayload = { data: encrypted.toString('base64') };
          isEncrypted = true;
        }
      }

      // 3. JWT de Identidad
      const token = await this.jwtService.signAsync(
        { iss: 'sevotec-gateway', aud: targetService },
        { privateKey: privateKey, algorithm: 'RS256', expiresIn: '20s' }
      );

      return {
        headers: {
          'x-internal-token': token,
          'x-api-key': internalApiKey,
          'x-signature': signature,
          'x-encrypted': String(isEncrypted),
          'Content-Type': 'application/json',
        },
        payload: finalPayload
      };
    } catch (error) {
      throw new InternalServerErrorException(`Fallo en seguridad: ${error.message}`);
    }
  }
}
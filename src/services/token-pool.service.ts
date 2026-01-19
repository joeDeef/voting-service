import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TokenPoolService implements OnModuleInit {
  private supabase: SupabaseClient;
  private readonly logger = new Logger(TokenPoolService.name);

  constructor(@InjectRedis() private readonly redis: Redis, private configService: ConfigService) {
    const url = this.configService.get<string>('SUPABASE_URL');
    const key = this.configService.get<string>('SUPABASE_KEY');

    if (!url || !key) {
      throw new Error('Faltan las variables de entorno de Supabase');
    }

    this.supabase = createClient(url, key);
  }

  // Se ejecuta automáticamente al levantar el servidor
  async onModuleInit() {
    await this.hydrateRedisPool();
  }

  private async hydrateRedisPool() {
    this.logger.log('Verificando el pool de tokens en Redis...');

    // 1. Verificamos si ya hay tokens en el SET de Redis
    const count = await this.redis.scard('voter_pool');

    if (count > 0) {
      this.logger.log(`El pool ya tiene ${count} tokens. Saltando carga.`);
      return;
    }

    this.logger.log('El pool de Redis está vacío. Cargando desde Supabase...');

    // 2. Consultar tokens disponibles en Supabase
    const { data, error } = await this.supabase
      .from('voter_tokens_pool')
      .select('token_value')
      .eq('is_used', false); // Solo cargamos los que no se han "quemado"

    if (error) {
      this.logger.error('Error al obtener tokens de Supabase:', error.message);
      return;
    }

    if (data && data.length > 0) {
      const tokens = data.map((t) => t.token_value);

      // 3. Cargar en Redis usando SADD (Operación atómica)
      // Usamos el operador spread (...) para mandar el array de tokens
      await this.redis.sadd('voter_pool', ...tokens);

      this.logger.log(`Éxito: ${tokens.length} tokens cargados en Redis.`);
    } else {
      this.logger.warn('No hay tokens disponibles en Supabase para cargar.');
    }
  }

  // Método que usarán tus otros controladores (VotingController)
  async popToken(): Promise<string> {
    const token = await this.redis.spop('voter_pool');
    if (!token) {
      throw new Error('No hay tokens disponibles. Pool agotado.');
    }
    return token;
  }
}
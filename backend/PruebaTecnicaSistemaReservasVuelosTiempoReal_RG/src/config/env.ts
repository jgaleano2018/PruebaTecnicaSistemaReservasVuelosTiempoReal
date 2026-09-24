import 'dotenv/config';
import { hostname } from 'os';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  SERVICE_NAME: z.string().default('realtime-gateway'),
  INSTANCE_ID: z.string().default(`${hostname()}-${process.pid}`),
  EVENT_BUS: z.enum(['kafka', 'memory']).default('kafka'),
  KAFKA_BROKERS: z.string().default('localhost:29092'),
  KAFKA_CLIENT_ID: z.string().default('realtime-gateway'),
  /** Prefijo del grupo: cada instancia usa un grupo propio para recibir TODOS los eventos (fan-out). */
  KAFKA_GROUP_PREFIX: z.string().default('realtime-gateway'),
  JWT_SECRET: z.string().min(16).default('super-secret-jwt-key-reservas-vuelos-2026'),
  MAX_SUBSCRIPTIONS_PER_SOCKET: z.coerce.number().int().positive().default(50),
  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.string().default('info'),
});

export const env = envSchema.parse(process.env);

// El logger lee estas variables al cargarse
process.env.SERVICE_NAME ??= env.SERVICE_NAME;
process.env.LOG_LEVEL ??= env.LOG_LEVEL;

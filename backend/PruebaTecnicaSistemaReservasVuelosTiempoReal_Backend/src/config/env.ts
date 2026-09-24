import 'dotenv/config';
import { z } from 'zod';
import { BusinessRules } from '@reservas-vuelos/shared';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  SERVICE_NAME: z.string().default('monolith'),
  MONGO_URI: z.string().default('mongodb://localhost:27017/reservas_vuelos_db'),
  /** kafka | memory (memory solo para pruebas o ejecución aislada) */
  EVENT_BUS: z.enum(['kafka', 'memory']).default('kafka'),
  KAFKA_BROKERS: z.string().default('localhost:29092'),
  KAFKA_CLIENT_ID: z.string().default('monolith'),
  KAFKA_GROUP_ID: z.string().default('monolith-group'),
  JWT_SECRET: z.string().min(16).default('super-secret-jwt-key-reservas-vuelos-2026'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  INTERNAL_API_KEY: z.string().default('internal-key-reservas-vuelos'),
  SEAT_LOCK_MINUTES: z.coerce
    .number()
    .min(BusinessRules.MIN_SEAT_LOCK_MINUTES)
    .max(BusinessRules.MAX_SEAT_LOCK_MINUTES)
    .default(BusinessRules.DEFAULT_SEAT_LOCK_MINUTES),
  MAX_ACTIVE_HOLDS_PER_USER: z.coerce.number().int().positive().default(4),
  HOLD_EXPIRATION_SWEEP_MS: z.coerce.number().int().positive().default(5000),
  SEED_ON_START: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof envSchema>;
export const env: Env = envSchema.parse(process.env);

// El logger lee estas variables al cargarse
process.env.SERVICE_NAME ??= env.SERVICE_NAME;
process.env.LOG_LEVEL ??= env.LOG_LEVEL;

import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3002),
  SERVICE_NAME: z.string().default('payment-service'),
  MONGO_URI: z.string().default('mongodb://localhost:27017/payment-db'),
  EVENT_BUS: z.enum(['kafka', 'memory']).default('kafka'),
  KAFKA_BROKERS: z.string().default('localhost:29092'),
  KAFKA_CLIENT_ID: z.string().default('payment-service'),
  KAFKA_GROUP_ID: z.string().default('payment-service-group'),
  JWT_SECRET: z.string().min(16).default('super-secret-jwt-key-reservas-vuelos-2026'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  MONOLITH_URL: z.string().url().default('http://localhost:3000'),
  GATEWAY_LATENCY_MS: z.coerce.number().int().min(0).default(400),
  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.string().default('info'),
});

export const env = envSchema.parse(process.env);

// El logger lee estas variables al cargarse
process.env.SERVICE_NAME ??= env.SERVICE_NAME;
process.env.LOG_LEVEL ??= env.LOG_LEVEL;

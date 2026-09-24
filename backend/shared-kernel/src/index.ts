/**
 * @reservas-vuelos/service-kernel
 * Núcleo técnico compartido por el monolito modular y los microservicios
 * ("Capa de Infraestructura y Comunicación" del diagrama): errores de dominio, puertos transversales,
 * JWT, validación, manejo de errores, logs, SSE, Event Bus (Kafka / memoria) y ciclo de vida del proceso.
 * La conexión a MongoDB se exporta aparte (`@reservas-vuelos/service-kernel/database`) para que los
 * servicios sin base de datos (Realtime Gateway) no dependan de Mongoose.
 */
export * from './domain/errors';
export * from './application/clock.port';
export * from './application/event-bus.port';
export * from './infrastructure/auth/jwt';
export * from './infrastructure/http/http-utils';
export * from './infrastructure/http/sse';
export * from './infrastructure/http/create-service-app';
export * from './infrastructure/logging/logger';
export * from './infrastructure/messaging/event-factory';
export * from './infrastructure/messaging/kafka-event-bus';
export * from './infrastructure/messaging/in-memory-event-bus';
export * from './infrastructure/messaging/create-event-bus';
export * from './infrastructure/runtime/process';

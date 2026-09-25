/**
 * Configuración de endpoints (variables VITE_* en tiempo de build).
 * Valores por defecto = despliegue local con Docker Desktop (backend/docker-compose.yml).
 */
export interface AppConfig {
  monolithUrl: string;
  fmsUrl: string;
  paymentUrl: string;
  realtimeUrl: string;
  realtimeTransport: 'websocket' | 'sse';
}

function read(name: string, fallback: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  return value && value.trim() ? value.trim().replace(/\/+$/, '') : fallback;
}

export function loadConfig(): AppConfig {
  const transport = read('VITE_REALTIME_TRANSPORT', 'websocket');
  return {
    monolithUrl: read('VITE_MONOLITH_URL', 'http://localhost:3000/api/v1'),
    fmsUrl: read('VITE_FMS_URL', 'http://localhost:3001/api/v1'),
    paymentUrl: read('VITE_PAYMENT_URL', 'http://localhost:3002/api/v1'),
    realtimeUrl: read('VITE_REALTIME_URL', 'http://localhost:4000'),
    realtimeTransport: transport === 'sse' ? 'sse' : 'websocket',
  };
}

import type { ApiErrorResponse, ApiResponse } from '@reservas-vuelos/shared';
import { AppError } from '@/domain/errors';

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** El endpoint exige JWT: si no hay sesión se falla sin llamar al servidor */
  auth?: 'required' | 'optional' | 'none';
}

export interface HttpClientConfig {
  baseUrl: string;
  /** Proveedor del JWT actual (inversión de dependencias: el cliente no conoce el almacenamiento) */
  getToken?: () => string | null;
  /** Se notifica cuando el servidor responde 401 (sesión expirada) */
  onUnauthorized?: () => void;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const url = `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function isEnvelope(body: unknown): body is ApiResponse<unknown> | ApiErrorResponse {
  return typeof body === 'object' && body !== null && 'success' in body;
}

/**
 * Cliente HTTP genérico (fetch) para los servicios REST.
 * - Desenvuelve el sobre `{ success, data }` común a todos los servicios.
 * - Normaliza errores (`AppError`) con código, estado HTTP y detalles de validación.
 * - Añade el JWT y aplica timeout con AbortController.
 * Nota: el Payment Service responde 402 con `success: true` (pago rechazado): es un resultado de negocio, no un error.
 */
export class HttpClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: HttpClientConfig) {
    this.fetchImpl = config.fetchImpl ?? ((...args) => globalThis.fetch(...args));
  }

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  get<T>(path: string, opts: Omit<RequestOptions, 'body'> = {}): Promise<T> {
    return this.request<T>('GET', path, opts);
  }

  post<T>(path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, { ...opts, body });
  }

  patch<T>(path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>('PATCH', path, { ...opts, body });
  }

  delete<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>('DELETE', path, opts);
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const token = this.config.getToken?.() ?? null;
    if (opts.auth === 'required' && !token) {
      throw new AppError('Debe iniciar sesión para continuar.', 'UNAUTHORIZED', 401);
    }

    const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token && opts.auth !== 'none') headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), this.config.timeoutMs ?? 15_000);
    const onAbort = () => controller.abort(opts.signal?.reason);
    opts.signal?.addEventListener('abort', onAbort);

    let response: Response;
    try {
      response = await this.fetchImpl(buildUrl(this.config.baseUrl, path, opts.query), {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      const timedOut = (controller.signal.reason as DOMException | undefined)?.name === 'TimeoutError';
      throw new AppError(
        timedOut ? 'Tiempo de espera agotado' : `No se pudo conectar con ${this.config.baseUrl}`,
        timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
        0,
      );
    } finally {
      clearTimeout(timeout);
      opts.signal?.removeEventListener('abort', onAbort);
    }

    const body = await this.parseBody(response);

    if (isEnvelope(body) && body.success) return body.data as T;

    if (!response.ok || (isEnvelope(body) && !body.success)) {
      if (response.status === 401) this.config.onUnauthorized?.();
      const error = isEnvelope(body) && !body.success ? body.error : undefined;
      throw new AppError(
        error?.message ?? `Error HTTP ${response.status}`,
        error?.code ?? `HTTP_${response.status}`,
        response.status,
        error?.details,
      );
    }
    return body as T;
  }

  private async parseBody(response: Response): Promise<unknown> {
    if (response.status === 204) return undefined;
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}

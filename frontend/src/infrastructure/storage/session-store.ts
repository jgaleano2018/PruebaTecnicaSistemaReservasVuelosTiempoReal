import type { KeyValueStore } from '@/application/ports';

/**
 * Almacenamiento en `sessionStorage` (por pestaña). Permite abrir dos pestañas con usuarios
 * distintos para probar el tiempo real entre clientes. Tolera entornos sin storage (modo privado).
 */
export class SessionStore<T> implements KeyValueStore<T> {
  constructor(
    private readonly key: string,
    private readonly storage: Storage | undefined = typeof window !== 'undefined' ? window.sessionStorage : undefined,
  ) {}

  get(): T | null {
    try {
      const raw = this.storage?.getItem(this.key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  set(value: T): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(value));
    } catch {
      // Sin almacenamiento disponible: el estado vive solo en memoria
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(this.key);
    } catch {
      // ignorado
    }
  }
}

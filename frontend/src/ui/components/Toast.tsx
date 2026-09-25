import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Tone } from '@/domain/labels';
import { XIcon } from './icons';
import { cx } from './primitives';

interface Toast {
  id: number;
  tone: Exclude<Tone, 'accent'>;
  title: string;
  message?: string;
}

interface ToastApi {
  notify(t: Omit<Toast, 'id'>, durationMs?: number): void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Notificaciones efímeras anunciadas a lectores de pantalla (región aria-live). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    (t: Omit<Toast, 'id'>, durationMs = 5000) => {
      const id = ++seq.current;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={cx('toast', `toast--${t.tone}`)} role={t.tone === 'danger' ? 'alert' : 'status'}>
            <div>
              <p className="toast__title">{t.title}</p>
              {t.message && <p className="toast__message">{t.message}</p>}
            </div>
            <button type="button" className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Cerrar notificación">
              <XIcon size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}

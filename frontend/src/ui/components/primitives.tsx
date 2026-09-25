import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import type { Tone } from '@/domain/labels';
import { toUserMessage } from '@/domain/errors';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/* ------------------------------ Button ------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={16} label="" /> : icon}
      <span>{children}</span>
    </button>
  );
});

/* ------------------------------ Fields ------------------------------ */

interface FieldShellProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

function FieldShell({ id, label, error, hint, required, children, className }: FieldShellProps) {
  return (
    <div className={cx('field', error && 'field--invalid', className)}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, id, required, containerClassName, className, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} required={required} className={containerClassName}>
      <input
        ref={ref}
        id={fieldId}
        className={cx('input', className)}
        aria-invalid={!!error || undefined}
        aria-describedby={describedBy}
        required={required}
        {...rest}
      />
    </FieldShell>
  );
});

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  containerClassName?: string;
}

export function SelectField({ label, error, hint, id, options, placeholder, required, containerClassName, className, ...rest }: SelectFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} required={required} className={containerClassName}>
      <select
        id={fieldId}
        className={cx('input', 'select', className)}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        required={required}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

/* ------------------------------ Feedback ------------------------------ */

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('badge', `badge--${tone}`, className)}>{children}</span>;
}

export function Spinner({ size = 20, label = 'Cargando' }: { size?: number; label?: string }) {
  return (
    <span className="spinner" style={{ width: size, height: size }} role={label ? 'status' : undefined} aria-label={label || undefined}>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

export function LoadingBlock({ label = 'Cargando…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="loading-block" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  live = 'polite',
}: {
  tone?: Exclude<Tone, 'accent'>;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  live?: 'polite' | 'assertive' | 'off';
}) {
  return (
    <div className={cx('alert', `alert--${tone}`)} role={tone === 'danger' ? 'alert' : 'status'} aria-live={live}>
      <div className="alert__body">
        {title && <p className="alert__title">{title}</p>}
        {children && <div className="alert__text">{children}</div>}
      </div>
      {action && <div className="alert__action">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'No pudimos cargar la información' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <Alert
      tone="danger"
      title={title}
      action={
        onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        )
      }
    >
      {toUserMessage(error)}
    </Alert>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && (
        <div className="empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="empty-state__title">{title}</p>
      {children && <div className="empty-state__text">{children}</div>}
    </div>
  );
}

export function Card({ children, className, as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'article' | 'div' | 'aside' } & Record<string, unknown>) {
  return (
    <As className={cx('card', className)} {...rest}>
      {children}
    </As>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-header__title">{title}</h1>
        {description && <p className="page-header__desc">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

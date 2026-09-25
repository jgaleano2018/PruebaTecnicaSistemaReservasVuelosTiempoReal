import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './primitives';

export interface TabItem {
  id: string;
  label: string;
}

/** Pestañas accesibles (patrón WAI-ARIA con activación manual por flechas). */
export function Tabs({ items, active, onChange, children, label }: { items: TabItem[]; active: string; onChange: (id: string) => void; children: ReactNode; label: string }) {
  const baseId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else return;
    e.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className="tabs">
      <div className="tabs__list" role="tablist" aria-label={label}>
        {items.map((item, i) => (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${item.id}`}
            aria-selected={active === item.id}
            aria-controls={`${baseId}-panel`}
            tabIndex={active === item.id ? 0 : -1}
            className={cx('tabs__tab', active === item.id && 'tabs__tab--active')}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="tabs__panel" role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${active}`} tabIndex={0}>
        {children}
      </div>
    </div>
  );
}

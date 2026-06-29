import React from 'react';
import { Icon } from './Icon';

interface Props {
  page: number;
  pageSize: number;
  count: number;
  onPage: (p: number) => void;
}

/** Paginador server-side: muestra el rango visible y navega por páginas. */
export const Paginator: React.FC<Props> = ({ page, pageSize, count, onPage }) => {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const from = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 4px' }}>
      <span className="muted" style={{ fontSize: 12.5 }}>
        {from.toLocaleString('es-MX')}–{to.toLocaleString('es-MX')} de {count.toLocaleString('es-MX')}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          className="btn btn-secondary"
          style={{ padding: '6px 10px' }}
          disabled={page <= 1}
          aria-label="Anterior"
          onClick={() => onPage(page - 1)}
        >
          <Icon name="arrow-left" size={14} />
        </button>
        <span className="num" style={{ fontSize: 12.5, color: 'var(--ink-2)', minWidth: 96, textAlign: 'center' }}>
          Página {page} de {totalPages}
        </span>
        <button
          className="btn btn-secondary"
          style={{ padding: '6px 10px' }}
          disabled={page >= totalPages}
          aria-label="Siguiente"
          onClick={() => onPage(page + 1)}
        >
          <Icon name="arrow-right" size={14} />
        </button>
      </div>
    </div>
  );
};

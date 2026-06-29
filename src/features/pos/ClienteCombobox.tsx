import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { Cliente } from '../../types';
import { Icon } from '../../components/Icon';

interface ClienteComboboxProps {
  value: Cliente | null;
  onSelect: (c: Cliente | null) => void;
  disabled?: boolean;
}

export const ClienteCombobox: React.FC<ClienteComboboxProps> = ({ value, onSelect, disabled }) => {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Cliente[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) return;
    const t = term.trim();
    if (t.length < 1) { setResults([]); setOpen(false); setLoading(false); return; }
    setLoading(true);
    setOpen(true);
    const handle = setTimeout(async () => {
      const esNum = /^\d+$/.test(t);
      const orFilter = `nombre.ilike.%${t}%,rancho.ilike.%${t}%${esNum ? `,numero_cliente.eq.${t}` : ''}`;
      const { data } = await supabase
        .from('clientes')
        .select('*')
        .eq('archivado', false)
        .or(orFilter)
        .order('nombre', { ascending: true })
        .limit(20);
      setResults((data as Cliente[]) || []);
      setHighlight(0);
      setOpen(true);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [term, value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const elegir = (c: Cliente) => { onSelect(c); setTerm(''); setResults([]); setOpen(false); };
  const limpiar = () => { onSelect(null); setTerm(''); setResults([]); setOpen(false); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open || results.length === 0) {
      if (e.key === 'Enter') e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(results[highlight] || results[0]); }
  };

  if (value) {
    return (
      <div ref={boxRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--green)', background: 'var(--green-soft)' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--green-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value.nombre}{value.numero_cliente != null ? ` · #${value.numero_cliente}` : ''}
        </span>
        <button type="button" aria-label="Quitar cliente" onClick={limpiar} disabled={disabled}
          style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--green-2)', padding: 2, display: 'flex' }}>
          <Icon name="x" size={16} />
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls="cliente-combobox-list"
        aria-activedescendant={open && results[highlight] ? `cli-opt-${results[highlight].id}` : undefined}
        data-atajo="buscar-cliente"
        placeholder="Buscar cliente por nombre, número o rancho…"
        value={term}
        disabled={disabled}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (results.length) setOpen(true); }}
        style={{ fontSize: 13 }}
      />
      {open && (
        <ul id="cliente-combobox-list" role="listbox"
          style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30,
            background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8,
            boxShadow: 'var(--shadow-md)', maxHeight: 260, overflowY: 'auto', margin: 0, padding: 4, listStyle: 'none' }}>
          {loading && <li style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12 }}>Buscando…</li>}
          {!loading && results.length === 0 && (
            <li style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12 }}>Sin coincidencias</li>
          )}
          {!loading && results.map((c, i) => (
            <li
              key={c.id}
              id={`cli-opt-${c.id}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => { e.preventDefault(); elegir(c); }}
              onMouseEnter={() => setHighlight(i)}
              style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                background: i === highlight ? 'var(--green-soft)' : 'transparent' }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{c.nombre}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                #{c.numero_cliente ?? '—'} · {c.rancho || 'Sin rancho'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

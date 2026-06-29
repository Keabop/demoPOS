import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { Cliente } from '../../types';
import { Topbar } from '../../components/Topbar';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import { type EstatusCliente } from '../../lib/clienteEstatus';
import { NuevoClienteModal } from './NuevoClienteModal';
import { EstadoCuenta } from './EstadoCuenta';
import { RegistrarPagoModal } from './RegistrarPagoModal';
import { PerfilClienteModal } from './PerfilClienteModal';
import { useSupabasePaginated } from '../../hooks/useSupabasePaginated';
import { Paginator } from '../../components/Paginator';
import { useCan } from '../auth/useCan';
import { toast } from '../../lib/toast';
import { useAlActivar } from '../../hooks/useAlActivar';
import { useNavegacionLista } from '../../hooks/useNavegacionLista';
import { useAtajosPantalla } from '../../hooks/useAtajosPantalla';

interface ClientesProps {
  onNav: (screen: string) => void;
  activo?: boolean;
}

// Fila de vw_clientes_estatus: cliente + estatus/cartera ya calculados en SQL.
interface ClienteRow extends Cliente {
  notas_activas: number;
  saldo_vencido: number;
  cartera: number;
  estatus: EstatusCliente;
  saldo_con_interes?: number;
}

interface ClientesKpis { total: number; corriente: number; porVencer: number; vencida: number; montoVencido: number }

type Filtro = 'todos' | 'al-corriente' | 'por-vencer' | 'vencida' | 'archivados';

const PAGE_SIZE = 50;
const sanitizar = (s: string) => s.trim().replace(/[,()]/g, ' ').trim();

const ESTATUS_BADGE: Record<EstatusCliente, { clase: string; label: string }> = {
  'al-corriente': { clase: 'green', label: 'Al corriente' },
  'por-vencer': { clase: 'amber', label: 'Próxima a vencer' },
  vencida: { clase: 'red', label: 'Deuda vencida' },
};

const ESTATUS_COLOR: Record<EstatusCliente, string> = {
  'al-corriente': 'var(--green)',
  'por-vencer': 'var(--amber)',
  vencida: 'var(--red)',
};

const AVATAR_BG: Record<EstatusCliente, string> = {
  'al-corriente': 'oklch(0.4 0.05 145)',
  'por-vencer': 'oklch(0.6 0.13 75)',
  vencida: 'oklch(0.55 0.14 25)',
};

const iniciales = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();

export const Clientes: React.FC<ClientesProps> = ({ activo }) => {
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);
  const [profileClient, setProfileClient] = useState<Cliente | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [kpis, setKpis] = useState<ClientesKpis>({ total: 0, corriente: 0, porVencer: 0, vencida: 0, montoVencido: 0 });

  const [isAbonoOpen, setIsAbonoOpen] = useState(false);
  const [abonoVentaId, setAbonoVentaId] = useState('');
  const [abonoVentaFolio, setAbonoVentaFolio] = useState('');
  const [abonoVentaSaldo, setAbonoVentaSaldo] = useState(0);

  const [refreshKey, setRefreshKey] = useState(0);

  const cargarKpis = useCallback(async () => {
    const { data } = await supabase.rpc('fn_clientes_kpis');
    if (data) setKpis(data as ClientesKpis);
  }, []);

  // Listado paginado en servidor vía RPC. fn_clientes_listado pagina la tabla
  // base y calcula el crédito SOLO de la página visible (escala a gran volumen);
  // la vista vw_clientes_estatus agregaba el crédito de TODOS los clientes antes
  // de poder limitar, lo que tronaba el statement_timeout en frío (HTTP 500).
  // La RPC devuelve { rows, total }: el total alimenta el paginador sin un count aparte.
  const { data: clientes, count, page, loading, error, setPage, refetch } = useSupabasePaginated<ClienteRow>(
    async (from, to) => {
      const { data, error } = await supabase.rpc('fn_clientes_listado', {
        p_busqueda: sanitizar(search),
        p_filtro: filtro,
        p_offset: from,
        p_limit: to - from + 1,
      });
      if (error) return { data: null, count: null, error };
      const r = (data ?? { rows: [], total: 0 }) as { rows: ClienteRow[]; total: number };
      return { data: r.rows, count: r.total, error: null };
    },
    [search, filtro],
    PAGE_SIZE,
  );

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargarKpis(); }, [cargarKpis]);

  const recargar = useCallback(() => { refetch(); cargarKpis(); }, [refetch, cargarKpis]);

  // Keep-alive: al volver a esta pantalla (que queda montada con display:none) refresca
  // datos del servidor conservando el estado de UI (búsqueda, filtro, paginación).
  useAlActivar(activo ?? true, recargar);

  const enfocarBuscador = () => (document.activeElement?.closest('[data-keepalive]') ?? document).querySelector<HTMLElement>('[data-atajo="buscar"]')?.focus();

  const onListKeyDown = useNavegacionLista(clientes.length, {
    onActivar: (i) => { const c = clientes[i]; if (c) setProfileClient(c); },
    onEscape: enfocarBuscador,
  });

  useAtajosPantalla(activo ?? true, { n: () => setIsNewModalOpen(true) });

  const puedeAdmin = useCan()('administrar_cartera');
  const handleReactivar = async (id: string) => {
    const { error } = await supabase.rpc('fn_cliente_reactivar', { p_cliente: id });
    if (error) { toast.error(error.message); return; }
    toast.success('Cliente reactivado.');
    recargar();
  };

  const handleOpenAbono = (ventaId: string, folio: string, saldo: number) => {
    setAbonoVentaId(ventaId);
    setAbonoVentaFolio(folio);
    setAbonoVentaSaldo(saldo);
    setIsAbonoOpen(true);
  };

  const handleAbonoSuccess = async () => {
    setIsAbonoOpen(false);
    setRefreshKey((prev) => prev + 1);
    if (selectedClient) {
      const { data } = await supabase.from('clientes').select('*').eq('id', selectedClient.id).single();
      if (data) setSelectedClient(data);
    }
    if (profileClient) {
      const { data } = await supabase.from('clientes').select('*').eq('id', profileClient.id).single();
      if (data) setProfileClient(data);
    }
    recargar();
  };

  if (selectedClient) {
    return (
      <>
        <EstadoCuenta
          key={`${selectedClient.id}-${refreshKey}`}
          cliente={selectedClient}
          onBack={() => {
            setSelectedClient(null);
            recargar();
          }}
          onOpenAbono={handleOpenAbono}
        />
        <RegistrarPagoModal
          isOpen={isAbonoOpen}
          ventaId={abonoVentaId}
          folio={abonoVentaFolio}
          saldo={abonoVentaSaldo}
          onClose={() => setIsAbonoOpen(false)}
          onSuccess={handleAbonoSuccess}
        />
      </>
    );
  }

  const RESUMEN: { label: string; val: number | string; sub: string; color: string }[] = [
    { label: 'Clientes totales', val: kpis.total, sub: 'Registrados en el sistema', color: 'gray' },
    { label: 'Al corriente', val: kpis.corriente, sub: 'Sin adeudos vencidos', color: 'green' },
    { label: 'Por vencer (7d)', val: kpis.porVencer, sub: 'Requieren seguimiento', color: 'amber' },
    { label: 'Deuda vencida', val: kpis.vencida, sub: `${fmtMXN(kpis.montoVencido)} por cobrar`, color: 'red' },
  ];

  const FILTROS: { id: Filtro; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'al-corriente', label: 'Al corriente' },
    { id: 'por-vencer', label: 'Por vencer' },
    { id: 'vencida', label: 'Vencidas' },
    { id: 'archivados', label: 'Archivados' },
  ];

  return (
    <>
      <Topbar
        title="Clientes"
        subtitle={loading ? 'Cargando...' : `${kpis.total} clientes · ${kpis.vencida} con deuda vencida`}
      >
        <button className="btn btn-secondary" onClick={recargar} disabled={loading}>
          <Icon name="clock" size={16} />
          Actualizar
        </button>
        <button data-tour="cli-nuevo" className="btn btn-primary" onClick={() => setIsNewModalOpen(true)}>
          <Icon name="plus" size={16} />
          Nuevo Cliente
        </button>
      </Topbar>

      <div className="content">
        {error && (
          <div style={{ background: 'var(--red-soft)', color: 'var(--red)', padding: '12px 16px', borderRadius: 12, marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="alert" size={16} /> <span>{error}</span>
          </div>
        )}
        {/* Resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 12, marginBottom: 20 }}>
          {RESUMEN.map((s) => (
            <div key={s.label} className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className={`badge ${s.color}`} style={{ width: 44, height: 44, borderRadius: 10, padding: 0, justifyContent: 'center' }}>
                <span className="num" style={{ fontSize: 18, fontWeight: 700 }}>{s.val}</span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Búsqueda + filtros */}
        <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 40, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line)' }}>
            <Icon name="search" size={16} color="var(--muted)" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-atajo="buscar"
              onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); (e.currentTarget.closest('[data-keepalive]') ?? document).querySelector<HTMLElement>('[data-nav-index="0"]')?.focus(); } }}
              placeholder="Buscar por nombre, teléfono o rancho…"
              style={{ flex: 1, border: 0, background: 'transparent', fontSize: 14, outline: 'none' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ color: 'var(--muted)', background: 'transparent', border: 0, cursor: 'pointer', padding: 4 }}>
                <Icon name="x" size={16} />
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line)' }}>
            {FILTROS.map((t) => (
              <button
                key={t.id}
                onClick={() => setFiltro(t.id)}
                style={{
                  padding: '6px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 0, cursor: 'pointer',
                  background: filtro === t.id ? 'var(--surface)' : 'transparent',
                  color: filtro === t.id ? 'var(--ink)' : 'var(--muted)',
                  boxShadow: filtro === t.id ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tarjetas de cliente */}
        {loading ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            Cargando catálogo de clientes...
          </div>
        ) : clientes.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            {search || filtro !== 'todos' ? 'No hay clientes que coincidan con el filtro.' : 'No hay clientes registrados.'}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 12 }} onKeyDown={onListKeyDown}>
              {clientes.map((c, i) => {
                const estatus = c.estatus;
                const suspendido = !c.activo_para_credito;
                const badge = ESTATUS_BADGE[estatus];
                const limite = Number(c.limite_credito || 0);
                const saldo = Number(c.saldo_con_interes ?? c.saldo_deudor ?? 0);
                const pct = limite > 0 ? Math.min(100, (saldo / limite) * 100) : 0;
                return (
                  <div key={c.id} className="card" style={{ padding: 18 }} tabIndex={0} data-nav-index={i}>
                    <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
                      <div style={{ width: 52, height: 52, borderRadius: 12, background: AVATAR_BG[estatus], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 15, flex: 'none' }}>
                        {iniciales(c.nombre)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {c.nombre}
                              {c.numero_cliente != null && <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>#{c.numero_cliente}</span>}
                            </div>
                            {c.rancho && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{c.rancho}</div>}
                          </div>
                          {suspendido ? (
                            <span className="badge red" style={{ flex: 'none' }}><span className="dot" />Suspendido</span>
                          ) : (
                            <span className={`badge ${badge.clase}`} style={{ flex: 'none' }}><span className="dot" />{badge.label}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                          {c.telefono && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="phone" size={11} />{c.telefono}</span>}
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 8, marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Saldo deudor</div>
                          <div className="num" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
                            {fmtMXN(saldo)}
                            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}> / {fmtMXN(limite)}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Notas activas</div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{c.notas_activas}</div>
                        </div>
                      </div>
                      <div style={{ height: 6, background: 'var(--line-2)', borderRadius: 999 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: ESTATUS_COLOR[estatus], borderRadius: 999 }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      {filtro === 'archivados' && puedeAdmin && (
                        <button className="btn btn-secondary" style={{ height: 34, padding: '0 12px', fontSize: 12, borderColor: 'var(--green)', color: 'var(--green-2)' }} onClick={() => handleReactivar(c.id)}>
                          <Icon name="check" size={12} />
                          Reactivar
                        </button>
                      )}
                      <button className="btn btn-secondary" style={{ height: 34, padding: '0 12px', fontSize: 12 }} onClick={() => setProfileClient(c)}>
                        <Icon name="search" size={12} />
                        Ver perfil
                      </button>
                      <button data-tour="cli-estado" className="btn btn-primary" style={{ height: 34, padding: '0 12px', fontSize: 12 }} onClick={() => setSelectedClient(c)}>
                        <Icon name="file" size={12} />
                        Estado de cuenta
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <Paginator page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
          </>
        )}
      </div>

      <NuevoClienteModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSave={() => {
          setIsNewModalOpen(false);
          recargar();
        }}
      />

      <PerfilClienteModal
        isOpen={!!profileClient}
        cliente={profileClient}
        onClose={() => setProfileClient(null)}
        onVerEstadoCuenta={() => {
          if (profileClient) {
            setSelectedClient(profileClient);
            setProfileClient(null);
          }
        }}
        onOpenAbono={(id, folio, saldo) => handleOpenAbono(id, folio, saldo)}
        onChanged={recargar}
      />

      <RegistrarPagoModal
        isOpen={isAbonoOpen}
        ventaId={abonoVentaId}
        folio={abonoVentaFolio}
        saldo={abonoVentaSaldo}
        onClose={() => setIsAbonoOpen(false)}
        onSuccess={handleAbonoSuccess}
      />
    </>
  );
};

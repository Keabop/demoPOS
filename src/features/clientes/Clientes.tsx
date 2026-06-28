import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { Cliente } from '../../types';
import { Topbar } from '../../components/Topbar';
import { Icon } from '../../components/Icon';
import { fmtMXN } from '../../lib/format';
import { round2 } from '../../lib/money';
import { estatusNota, type EstatusCliente } from '../../lib/clienteEstatus';
import { NuevoClienteModal } from './NuevoClienteModal';
import { EstadoCuenta } from './EstadoCuenta';
import { RegistrarPagoModal } from './RegistrarPagoModal';
import { PerfilClienteModal } from './PerfilClienteModal';

interface ClientesProps {
  onNav: (screen: string) => void;
}

interface CarteraInfo {
  estatus: EstatusCliente;
  notasActivas: number;
  saldoVencido: number;
}

type Filtro = 'todos' | 'al-corriente' | 'por-vencer' | 'vencida';

const ESTATUS_BADGE: Record<EstatusCliente, { clase: string; label: string }> = {
  'al-corriente': { clase: 'ok', label: 'Al corriente' },
  'por-vencer': { clase: 'amber', label: 'Próxima a vencer' },
  vencida: { clase: 'red', label: 'Deuda vencida' },
};

const ESTATUS_COLOR: Record<EstatusCliente, string> = {
  'al-corriente': 'var(--ok)',
  'por-vencer': 'var(--amber)',
  vencida: 'var(--red)',
};

const AVATAR_BG: Record<EstatusCliente, string> = {
  'al-corriente': 'oklch(0.42 0.10 150)',
  'por-vencer': 'oklch(0.6 0.13 75)',
  vencida: 'oklch(0.55 0.14 25)',
};

const iniciales = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();

export const Clientes: React.FC<ClientesProps> = () => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cartera, setCartera] = useState<Record<string, CarteraInfo>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);
  const [profileClient, setProfileClient] = useState<Cliente | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  const [isAbonoOpen, setIsAbonoOpen] = useState(false);
  const [abonoVentaId, setAbonoVentaId] = useState('');
  const [abonoVentaFolio, setAbonoVentaFolio] = useState('');
  const [abonoVentaSaldo, setAbonoVentaSaldo] = useState(0);

  const [refreshKey, setRefreshKey] = useState(0);

  const fetchClientes = async () => {
    try {
      setLoading(true);
      const { data: cli, error } = await supabase
        .from('clientes')
        .select('*')
        .order('nombre', { ascending: true });
      if (error) throw error;
      const lista = (cli as Cliente[]) || [];
      setClientes(lista);

      // Cartera: notas a crédito pendientes para calcular estatus real por cliente.
      // Capturamos los errores: si fallan, NO debemos mostrar a todos como "al
      // corriente" silenciosamente (ocultaría morosos reales).
      const { data: ventas, error: ventasError } = await supabase
        .from('ventas')
        .select('id, cliente_id, total, fecha, plazo_dias')
        .eq('tipo_pago', 'credito');
      if (ventasError) throw ventasError;

      const ventaIds = (ventas || []).map((v) => v.id);
      let pagos: { venta_id: string; monto: number }[] = [];
      if (ventaIds.length > 0) {
        const { data: pg, error: pagosError } = await supabase
          .from('pagos_credito')
          .select('venta_id, monto')
          .in('venta_id', ventaIds);
        if (pagosError) throw pagosError;
        pagos = pg || [];
      }

      const mapa: Record<string, CarteraInfo> = {};
      for (const c of lista) mapa[c.id] = { estatus: 'al-corriente', notasActivas: 0, saldoVencido: 0 };

      for (const v of ventas || []) {
        if (!v.cliente_id || !mapa[v.cliente_id]) continue;
        const pagado = pagos
          .filter((p) => p.venta_id === v.id)
          .reduce((s, p) => s + Number(p.monto || 0), 0);
        const saldo = round2(Math.max(0, Number(v.total) - round2(pagado)));
        if (saldo <= 0) continue;

        const entry = mapa[v.cliente_id];
        entry.notasActivas += 1;
        const e = estatusNota({ saldo, fechaVenta: v.fecha, plazoDias: v.plazo_dias || 30 });
        if (e === 'vencida') {
          entry.saldoVencido += saldo;
          entry.estatus = 'vencida';
        } else if (e === 'por-vencer' && entry.estatus !== 'vencida') {
          entry.estatus = 'por-vencer';
        }
      }
      setCartera(mapa);
    } catch (err) {
      console.error('Error fetching clientes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

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
    fetchClientes();
  };

  const infoDe = (c: Cliente): CarteraInfo =>
    cartera[c.id] || { estatus: 'al-corriente', notasActivas: 0, saldoVencido: 0 };

  const kpis = useMemo(() => {
    let corriente = 0, porVencer = 0, vencida = 0, montoVencido = 0;
    for (const c of clientes) {
      const info = cartera[c.id];
      const e = info?.estatus ?? 'al-corriente';
      if (e === 'vencida') vencida += 1;
      else if (e === 'por-vencer') porVencer += 1;
      else corriente += 1;
      montoVencido += info?.saldoVencido ?? 0;
    }
    return { total: clientes.length, corriente, porVencer, vencida, montoVencido };
  }, [clientes, cartera]);

  const filtered = clientes.filter((c) => {
    const term = search.toLowerCase();
    const coincide =
      c.nombre.toLowerCase().includes(term) ||
      (c.rancho && c.rancho.toLowerCase().includes(term)) ||
      (c.telefono && c.telefono.toLowerCase().includes(term));
    if (!coincide) return false;
    if (filtro === 'todos') return true;
    return infoDe(c).estatus === filtro;
  });

  if (selectedClient) {
    return (
      <>
        <EstadoCuenta
          key={`${selectedClient.id}-${refreshKey}`}
          cliente={selectedClient}
          onBack={() => {
            setSelectedClient(null);
            fetchClientes();
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
    { label: 'Al corriente', val: kpis.corriente, sub: 'Sin adeudos vencidos', color: 'ok' },
    { label: 'Por vencer (7d)', val: kpis.porVencer, sub: 'Requieren seguimiento', color: 'amber' },
    { label: 'Deuda vencida', val: kpis.vencida, sub: `${fmtMXN(kpis.montoVencido)} por cobrar`, color: 'red' },
  ];

  const FILTROS: { id: Filtro; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'al-corriente', label: 'Al corriente' },
    { id: 'por-vencer', label: 'Por vencer' },
    { id: 'vencida', label: 'Vencidas' },
  ];

  return (
    <>
      <Topbar
        title="Clientes"
        subtitle={loading ? 'Cargando...' : `${kpis.total} clientes · ${kpis.vencida} con deuda vencida`}
      >
        <button className="btn btn-secondary" onClick={fetchClientes} disabled={loading}>
          <Icon name="clock" size={16} />
          Actualizar
        </button>
        <button className="btn btn-primary" onClick={() => setIsNewModalOpen(true)}>
          <Icon name="plus" size={16} />
          Nuevo Cliente
        </button>
      </Topbar>

      <div className="content">
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
        ) : filtered.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            {search || filtro !== 'todos' ? 'No hay clientes que coincidan con el filtro.' : 'No hay clientes registrados.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 12 }}>
            {filtered.map((c) => {
              const info = infoDe(c);
              const suspendido = !c.activo_para_credito;
              const badge = ESTATUS_BADGE[info.estatus];
              const limite = Number(c.limite_credito || 0);
              const saldo = Number(c.saldo_deudor || 0);
              const pct = limite > 0 ? Math.min(100, (saldo / limite) * 100) : 0;
              return (
                <div key={c.id} className="card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 12, background: AVATAR_BG[info.estatus], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 15, flex: 'none' }}>
                      {iniciales(c.nombre)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre}</div>
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
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{info.notasActivas}</div>
                      </div>
                    </div>
                    <div style={{ height: 6, background: 'var(--line-2)', borderRadius: 999 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: ESTATUS_COLOR[info.estatus], borderRadius: 999 }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                    <button className="btn btn-secondary" style={{ height: 34, padding: '0 12px', fontSize: 12 }} onClick={() => setProfileClient(c)}>
                      <Icon name="search" size={12} />
                      Ver perfil
                    </button>
                    <button className="btn btn-primary" style={{ height: 34, padding: '0 12px', fontSize: 12 }} onClick={() => setSelectedClient(c)}>
                      <Icon name="file" size={12} />
                      Estado de cuenta
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <NuevoClienteModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSave={() => {
          setIsNewModalOpen(false);
          fetchClientes();
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

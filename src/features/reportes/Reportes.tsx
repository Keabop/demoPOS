import React, { useState, useMemo, Suspense, lazy } from 'react';
import { Topbar } from '../../components/Topbar';
import { Icon } from '../../components/Icon';
import { rangoDeFechas } from '../ventas/historialModel';
import { useAlActivar } from '../../hooks/useAlActivar';

// Lazily import tab subcomponents
const ReporteVentas = lazy(() => import('./ReporteVentas').then(m => ({ default: m.ReporteVentas })));
const ReporteCobranza = lazy(() => import('./ReporteCobranza').then(m => ({ default: m.ReporteCobranza })));
const ReporteInventario = lazy(() => import('./ReporteInventario').then(m => ({ default: m.ReporteInventario })));
const ReporteCaja = lazy(() => import('./ReporteCaja').then(m => ({ default: m.ReporteCaja })));

type TabType = 'ventas' | 'cobranza' | 'inventario' | 'caja';
type DateRangeOption = 'hoy' | '7dias' | 'mes' | 'ano';

interface ReportesProps {
  activo?: boolean;
}

export const Reportes: React.FC<ReportesProps> = ({ activo }) => {
  const [activeTab, setActiveTab] = useState<TabType>('ventas');
  const [dateRange, setDateRange] = useState<DateRangeOption>('mes');
  // Keep-alive: nonce que se usa como `key` del reporte activo. Al volver a la
  // pantalla (sin remontar) lo incrementamos para forzar que el reporte vuelva a
  // pedir sus datos al servidor, conservando la pestaña y el período elegidos.
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Rango de fechas anclado a la hora de México (no del navegador). Ver rangoDeFechas.
  const { startDate, endDate } = useMemo(() => rangoDeFechas(dateRange), [dateRange]);

  const recargar = () => setRefreshNonce(n => n + 1);
  useAlActivar(activo ?? true, recargar);

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'ventas', label: 'Ventas', icon: 'trending-up' },
    { id: 'cobranza', label: 'Crédito y Cobranza', icon: 'credit' },
    { id: 'inventario', label: 'Inventario', icon: 'box' },
    { id: 'caja', label: 'Caja y Turnos', icon: 'cash' },
  ];

  const periods: { id: DateRangeOption; label: string }[] = [
    { id: 'hoy', label: 'Hoy' },
    { id: '7dias', label: '7 días' },
    { id: 'mes', label: 'Mes' },
    { id: 'ano', label: 'Año' },
  ];

  const periodLabel = {
    hoy: 'hoy',
    '7dias': 'los últimos 7 días',
    mes: 'este mes',
    ano: 'este año',
  }[dateRange];

  return (
    <>
      <Topbar title="Reportes Detallados" subtitle="Análisis de ventas, crédito, inventario y caja" />
      <div className="content" style={{ display: 'flex', flexDirection: 'column' }}>

        {/* Tabs + período */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
          <div className="tabs-scroll" data-tour="rep-tabs" style={{ display: 'flex', gap: 20, overflowX: 'auto', maxWidth: '100%' }}>
            {tabs.map(tab => (
              <button key={tab.id} className={`tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                <Icon name={tab.icon} size={17} />
                {tab.label}
              </button>
            ))}
          </div>
          <div data-tour="rep-periodo" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface-2)', border: '1px solid var(--line)', padding: 4, borderRadius: 9, marginBottom: 8, flex: 'none' }}>
            {periods.map(p => (
              <button key={p.id} className={`seg ${dateRange === p.id ? 'active' : ''}`} onClick={() => setDateRange(p.id)}>{p.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22, color: 'var(--muted)', fontSize: 12.5 }}>
          <Icon name="clock" size={14} style={{ color: 'var(--muted)' }} />
          <span>Mostrando <strong style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{periodLabel}</strong></span>
        </div>

        {/* Content body */}
        <Suspense
          fallback={
            <div className="card" style={{ padding: 60, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div className="premium-loading-icon-wrapper" style={{ animation: 'spin 1.5s linear infinite' }}>
                <Icon name="clock" size={32} color="var(--green)" />
              </div>
              <div style={{ marginTop: 16, color: 'var(--muted)', fontSize: 14 }}>Preparando reporte...</div>
            </div>
          }
        >
          {activeTab === 'ventas' && <ReporteVentas key={refreshNonce} startDate={startDate} endDate={endDate} />}
          {activeTab === 'cobranza' && <ReporteCobranza key={refreshNonce} startDate={startDate} endDate={endDate} />}
          {activeTab === 'inventario' && <ReporteInventario key={refreshNonce} startDate={startDate} endDate={endDate} />}
          {activeTab === 'caja' && <ReporteCaja key={refreshNonce} startDate={startDate} endDate={endDate} />}
        </Suspense>
      </div>
    </>
  );
};

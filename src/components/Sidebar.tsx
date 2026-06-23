import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { useAuth } from '../features/auth/AuthContext';
import { useConfig } from '../features/config/ConfigContext';
import { supabase } from '../lib/supabase';

interface SidebarProps {
  role: 'admin' | 'vendedor' | 'usuario' | null;
  screen: string;
  onNav: (screen: string) => void;
  onLogout: () => void;
}

const NAV_ADMIN = [
  { id: 'dashboard',  label: 'Tablero',        icon: 'home' },
  { id: 'pos',        label: 'Nueva Venta',    icon: 'cart' },
  { id: 'caja',       label: 'Caja',           icon: 'cash' },
  { id: 'clientes',   label: 'Clientes',       icon: 'users' },
  { id: 'inventario', label: 'Inventario',     icon: 'box' },
  { id: 'proveedores',label: 'Proveedores',    icon: 'sack' },
  { id: 'credito',    label: 'Notas a Crédito', icon: 'credit', counterWarn: true },
  { id: 'reportes',   label: 'Reportes',       icon: 'report' },
  { id: 'historial-ventas', label: 'Historial de ventas', icon: 'clock' },
  { id: 'usuarios',   label: 'Usuarios',       icon: 'users' },
];

const NAV_VENDEDOR = [
  { id: 'pos',        label: 'Nueva Venta',    icon: 'cart' },
  { id: 'caja',       label: 'Caja',           icon: 'cash' },
  { id: 'clientes',   label: 'Clientes',       icon: 'users' },
  { id: 'proveedores',label: 'Proveedores',    icon: 'sack' },
  { id: 'credito',    label: 'Notas a Crédito', icon: 'credit', counterWarn: true },
  { id: 'historial-ventas', label: 'Historial de ventas', icon: 'clock' },
];

const NAV_USUARIO = [
  { id: 'precios',    label: 'Lista de Precios',     icon: 'report' },
  { id: 'historial',  label: 'Historial de Clientes', icon: 'users' },
];

export const Sidebar: React.FC<SidebarProps> = ({ role, screen, onNav, onLogout }) => {
  const { config } = useConfig();
  const { profile } = useAuth();
  const nav = role === 'admin' ? NAV_ADMIN : role === 'vendedor' ? NAV_VENDEDOR : NAV_USUARIO;
  const fullNav = NAV_ADMIN;

  const [overdueCount, setOverdueCount] = useState<number>(0);

  useEffect(() => {
    const fetchOverdueCount = async () => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateStr = thirtyDaysAgo.toISOString();

        const { count, error } = await supabase
          .from('ventas')
          .select('*', { count: 'exact', head: true })
          .eq('tipo_pago', 'credito')
          .eq('estado', 'pendiente')
          .lt('fecha', dateStr);

        if (!error && count !== null) {
          setOverdueCount(count);
        }
      } catch (err) {
        console.error('Error fetching overdue count:', err);
      }
    };

    fetchOverdueCount();

    // Listen to changes in pagos_credito and ventas to update in real time
    const channel = supabase
      .channel('sidebar-overdue-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pagos_credito' },
        () => {
          fetchOverdueCount();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ventas' },
        () => {
          fetchOverdueCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  let userInfo = {
    name: 'Visitante',
    role: 'Sólo precios',
    initials: 'V'
  };

  if (profile) {
    const rolMap: Record<string, string> = {
      admin: 'Administrador',
      vendedor: 'Vendedor',
      visitante: 'Sólo precios'
    };
    const initials = profile.nombre
      .split(/\s+/)
      .filter(Boolean)
      .map(word => word[0])
      .join('')
      .toUpperCase();

    userInfo = {
      name: profile.nombre,
      role: rolMap[profile.rol] || 'Sólo precios',
      initials
    };
  }
  if (role === 'usuario') {
    return (
      <aside className="sidebar" onClick={e => e.stopPropagation()}>
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <img src={config.logoUrl} alt={config.nombre} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <div className="sidebar-brand-name">{config.nombre}</div>
            <div className="sidebar-brand-sub">{config.ciudad}</div>
          </div>
        </div>

        <div className="sidebar-scroll">
          <div className="sidebar-section">Consulta</div>
          <nav className="sidebar-nav">
            {nav.map(item => {
              const isActive = screen === item.id;
              return (
                <div
                  key={item.id}
                  className={`sidebar-item ${isActive ? 'active' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    onNav(item.id);
                    document.querySelector('.app')?.classList.remove('sidebar-open');
                  }}
                >
                  <Icon name={item.icon} size={18} style={{ flex: 'none' }} />
                  <span>{item.label}</span>
                </div>
              );
            })}
            <div style={{ flex: 1 }} />
          </nav>
        </div>

        <div className="sidebar-foot">
          <div className="avatar">{userInfo.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-user-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userInfo.name}</div>
            <div className="sidebar-user-role">{userInfo.role}</div>
          </div>
          <button className="btn-ghost" style={{ padding: 8, borderRadius: 8, color: 'var(--sidebar-muted)' }} onClick={onLogout} title="Cerrar sesión">
            <Icon name="logout" size={16} />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar" onClick={e => e.stopPropagation()}>
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <img src={config.logoUrl} alt={config.nombre} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div>
          <div className="sidebar-brand-name">{config.nombre}</div>
          <div className="sidebar-brand-sub">{config.ciudad}</div>
        </div>
      </div>

      <div className="sidebar-scroll">
      <div className="sidebar-section">Operación</div>
      <nav className="sidebar-nav" style={{flex: 'none'}}>
        {fullNav.slice(0, 7).map(item => {
          const allowed = nav.find(n => n.id === item.id);
          const isActive = screen === item.id;
          return (
            <div
              key={item.id}
              className={`sidebar-item ${isActive ? 'active' : ''}`}
              style={{ opacity: allowed ? 1 : 0.45, cursor: allowed ? 'pointer' : 'not-allowed' }}
              onClick={() => {
                if (allowed) {
                  onNav(item.id);
                  document.querySelector('.app')?.classList.remove('sidebar-open');
                }
              }}
              title={allowed ? '' : 'No disponible para este rol'}
            >
              <Icon name={item.icon} size={18} style={{flex: 'none'}} />
              <span>{item.label}</span>
              {item.id === 'credito' && overdueCount > 0 && (
                <span className={`sidebar-counter ${item.counterWarn ? 'warn' : ''}`}>{overdueCount}</span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-section">Análisis</div>
      <nav className="sidebar-nav">
        {fullNav.slice(7).map(item => {
          const allowed = nav.find(n => n.id === item.id);
          const isActive = screen === item.id;
          return (
            <div
              key={item.id}
              className={`sidebar-item ${isActive ? 'active' : ''}`}
              style={{ opacity: allowed ? 1 : 0.45, cursor: allowed ? 'pointer' : 'not-allowed' }}
              onClick={() => {
                if (allowed) {
                  onNav(item.id);
                  document.querySelector('.app')?.classList.remove('sidebar-open');
                }
              }}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </div>
          );
        })}
        <div style={{flex: 1}} />
        {role === 'admin' && (
          <div
            className={`sidebar-item ${screen === 'configuracion' ? 'active' : ''}`}
            style={{ cursor: 'pointer' }}
            onClick={() => {
              onNav('configuracion');
              document.querySelector('.app')?.classList.remove('sidebar-open');
            }}
          >
            <Icon name="settings" size={18} />
            <span>Configuración</span>
          </div>
        )}
      </nav>
      </div>

      <div className="sidebar-foot">
        <div className="avatar">{userInfo.initials}</div>
        <div style={{flex: 1, minWidth: 0}}>
          <div className="sidebar-user-name" style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{userInfo.name}</div>
          <div className="sidebar-user-role">{userInfo.role}</div>
        </div>
        <button className="btn-ghost" style={{padding: 8, borderRadius: 8, color: 'var(--sidebar-muted)'}} onClick={onLogout} title="Cerrar sesión">
          <Icon name="logout" size={16} />
        </button>
      </div>
    </aside>
  );
};

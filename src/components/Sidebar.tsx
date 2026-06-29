import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { LogoNegocio } from './LogoNegocio';
import { useAuth } from '../features/auth/AuthContext';
import { useConfig } from '../features/config/ConfigContext';
import { useCan } from '../features/auth/useCan';
import { NAV_ITEMS } from '../config/navegacion';
import { supabase } from '../lib/supabase';
import { CambiarMiPasswordModal } from '../features/auth/CambiarMiPasswordModal';

interface SidebarProps {
  screen: string;
  onNav: (screen: string) => void;
  onLogout: () => void;
}

const ROL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  vendedor: 'Vendedor',
  visitante: 'Consulta',
};

export const Sidebar: React.FC<SidebarProps> = ({ screen, onNav, onLogout }) => {
  const { config } = useConfig();
  const { profile } = useAuth();
  const can = useCan();

  // Navegación derivada de capacidades: solo se listan los ítems permitidos.
  const visibles = NAV_ITEMS.filter((i) => can(i.cap));
  const operacion = visibles.filter((i) => i.grupo === 'operacion');
  const analisis = visibles.filter((i) => i.grupo === 'analisis');
  const config_ = visibles.filter((i) => i.grupo === 'config');

  const [overdueCount, setOverdueCount] = useState<number>(0);
  const [cambiarPwOpen, setCambiarPwOpen] = useState(false);

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

    // Sincronización en tiempo real con pagos_credito y ventas.
    const channel = supabase
      .channel('sidebar-overdue-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos_credito' }, () => {
        fetchOverdueCount();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, () => {
        fetchOverdueCount();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const userInfo = (() => {
    if (!profile) return { name: 'Visitante', role: 'Sólo precios', initials: 'V' };
    const initials = profile.nombre
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
    return {
      name: profile.nombre,
      role: profile.etiqueta || ROL_LABEL[profile.rol] || 'Consulta',
      initials,
    };
  })();

  const moverFoco = (delta: number) => {
    const total = visibles.length;
    const actual = document.activeElement as HTMLElement | null;
    const idxAttr = actual?.getAttribute('data-nav-index');
    const actualIdx = idxAttr != null ? Number(idxAttr) : -1;
    const next = Math.max(0, Math.min(total - 1, (actualIdx < 0 ? 0 : actualIdx) + delta));
    (document.querySelector(`[data-nav-index="${next}"]`) as HTMLElement | null)?.focus();
  };

  const onItemKeyDown = (e: React.KeyboardEvent, item: (typeof NAV_ITEMS)[number]) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); moverFoco(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); moverFoco(-1); }
    else if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); (document.querySelector('[data-nav-index="0"]') as HTMLElement | null)?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); e.stopPropagation(); (document.querySelector(`[data-nav-index="${visibles.length - 1}"]`) as HTMLElement | null)?.focus(); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); e.stopPropagation();
      onNav(item.id);
      document.querySelector('.app')?.classList.remove('sidebar-open');
    }
  };

  const renderItem = (item: (typeof NAV_ITEMS)[number]) => {
    const isActive = screen === item.id;
    const idx = visibles.indexOf(item);
    return (
      <div
        key={item.id}
        role="menuitem"
        tabIndex={0}
        data-nav-index={idx}
        className={`sidebar-item ${isActive ? 'active' : ''}`}
        style={{ cursor: 'pointer' }}
        onKeyDown={(e) => onItemKeyDown(e, item)}
        onClick={() => {
          onNav(item.id);
          document.querySelector('.app')?.classList.remove('sidebar-open');
        }}
      >
        <Icon name={item.icon} size={18} style={{ flex: 'none' }} />
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.id === 'credito' && overdueCount > 0 && (
          <span className={`sidebar-counter ${item.counterWarn ? 'warn' : ''}`}>{overdueCount}</span>
        )}
        {idx >= 0 && idx < 9 && (
          <span className="sidebar-kbd" aria-hidden="true">{idx + 1}</span>
        )}
      </div>
    );
  };

  return (
    <aside className="sidebar" onClick={(e) => e.stopPropagation()}>
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <LogoNegocio logoUrl={config.logoUrl} nombre={config.nombre} fontSize={14} radius={6} />
        </div>
        <div>
          <div className="sidebar-brand-name">{config.nombre}</div>
          <div className="sidebar-brand-sub">{config.ciudad}</div>
        </div>
      </div>

      <div className="sidebar-scroll">
        {operacion.length > 0 && (
          <>
            <div className="sidebar-section">Operación</div>
            <nav className="sidebar-nav" role="menu" style={{ flex: 'none' }}>
              {operacion.map(renderItem)}
            </nav>
          </>
        )}

        <div className="sidebar-section">{analisis.length > 0 ? 'Análisis' : 'Consulta'}</div>
        <nav className="sidebar-nav" role="menu">
          {analisis.map(renderItem)}
          <div style={{ flex: 1 }} />
          {config_.map(renderItem)}
        </nav>
      </div>

      <div className="sidebar-foot">
        <div className="avatar">{userInfo.initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sidebar-user-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userInfo.name}</div>
          <div className="sidebar-user-role">{userInfo.role}</div>
        </div>
        <button
          className="btn-ghost"
          style={{ padding: 8, borderRadius: 8, color: 'var(--sidebar-muted)' }}
          onClick={() => setCambiarPwOpen(true)}
          title="Cambiar mi contraseña"
        >
          <Icon name="key" size={16} />
        </button>
        <button className="btn-ghost" style={{ padding: 8, borderRadius: 8, color: 'var(--sidebar-muted)' }} onClick={onLogout} title="Cerrar sesión">
          <Icon name="logout" size={16} />
        </button>
      </div>
      <CambiarMiPasswordModal
        isOpen={cambiarPwOpen}
        email={profile?.email ?? ''}
        onClose={() => setCambiarPwOpen(false)}
      />
    </aside>
  );
};

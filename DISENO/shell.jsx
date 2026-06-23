// Shell: sidebar + topbar
const { useState, useEffect, useMemo, useRef } = React;

const NAV_ADMIN = [
  { id: 'dashboard',  label: 'Tablero',        icon: 'home' },
  { id: 'pos',        label: 'Nueva Venta',    icon: 'cart' },
  { id: 'clientes',   label: 'Clientes',       icon: 'users' },
  { id: 'inventario', label: 'Inventario',     icon: 'box' },
  { id: 'credito',    label: 'Notas a Crédito', icon: 'credit', counter: 7, counterWarn: true },
  { id: 'reportes',   label: 'Reportes',       icon: 'report' },
];

const NAV_VENDEDOR = [
  { id: 'pos',        label: 'Nueva Venta',    icon: 'cart' },
  { id: 'clientes',   label: 'Clientes',       icon: 'users' },
  { id: 'credito',    label: 'Notas a Crédito', icon: 'credit', counter: 7, counterWarn: true },
];

const NAV_USUARIO = [
  { id: 'precios',    label: 'Lista de Precios', icon: 'report' },
];

const Sidebar = ({ role, screen, onNav, onLogout }) => {
  const nav = role === 'admin' ? NAV_ADMIN : role === 'vendedor' ? NAV_VENDEDOR : NAV_USUARIO;
  // Visually use admin nav even for non-admin to keep all screens reachable in the prototype
  const fullNav = NAV_ADMIN;

  const userInfo = {
    admin:    { name: 'Lucía Bermúdez',   role: 'Administrador',  initials: 'LB' },
    vendedor: { name: 'Carlos Núñez',     role: 'Vendedor',       initials: 'CN' },
    usuario:  { name: 'Visitante',        role: 'Sólo precios',   initials: 'V' },
  }[role];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <Icon name="leaf" size={20} color="#fff" />
        </div>
        <div>
          <div className="sidebar-brand-name">AGROMAR</div>
          <div className="sidebar-brand-sub">Suc. Querétaro · Centro</div>
        </div>
      </div>

      <div className="sidebar-section">Operación</div>
      <nav className="sidebar-nav" style={{flex: 'none'}}>
        {fullNav.slice(0, 5).map(item => {
          const allowed = nav.find(n => n.id === item.id);
          const isActive = screen === item.id;
          return (
            <div
              key={item.id}
              className={`sidebar-item ${isActive ? 'active' : ''}`}
              style={{ opacity: allowed ? 1 : 0.45 }}
              onClick={() => allowed && onNav(item.id)}
              title={allowed ? '' : 'No disponible para este rol'}
            >
              <Icon name={item.icon} size={18} style={{flex: 'none'}} />
              <span>{item.label}</span>
              {item.counter && (
                <span className={`sidebar-counter ${item.counterWarn ? 'warn' : ''}`}>{item.counter}</span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-section">Análisis</div>
      <nav className="sidebar-nav">
        {fullNav.slice(5).map(item => {
          const allowed = nav.find(n => n.id === item.id);
          const isActive = screen === item.id;
          return (
            <div
              key={item.id}
              className={`sidebar-item ${isActive ? 'active' : ''}`}
              style={{ opacity: allowed ? 1 : 0.45 }}
              onClick={() => allowed && onNav(item.id)}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </div>
          );
        })}
        <div style={{flex: 1}} />
        <div className="sidebar-item" style={{ opacity: 0.7 }}>
          <Icon name="settings" size={18} />
          <span>Configuración</span>
        </div>
      </nav>

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

const Topbar = ({ title, subtitle, children }) => (
  <header className="topbar">
    <div className="topbar-left">
      <div>
        <div className="topbar-title">{title}</div>
        {subtitle && <div className="topbar-sub">{subtitle}</div>}
      </div>
    </div>
    <div className="topbar-right">
      {children}
      <div style={{display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--green-soft)', borderRadius: 999, fontSize: 12, fontWeight: 600, color: 'var(--green-2)'}}>
        <span style={{width: 6, height: 6, borderRadius: 999, background: 'var(--green)'}}></span>
        Caja abierta · turno T-2
      </div>
    </div>
  </header>
);

Object.assign(window, { Sidebar, Topbar });

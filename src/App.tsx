import { useState, useEffect } from 'react';
import { Login } from './features/auth/Login';
import { POS } from './features/pos/POS';
import { MobileScanner } from './features/pos/MobileScanner';
import { Catalogo } from './features/inventario/Catalogo';
import { Dashboard } from './features/dashboard/Dashboard';
import { Clientes } from './features/clientes/Clientes';
import { HistorialClientes } from './features/clientes/HistorialClientes';
import { CreditosList } from './features/credito/CreditosList';
import { HistorialVentas } from './features/ventas/HistorialVentas';
import { Caja } from './features/pos/Caja';
import { Sidebar } from './components/Sidebar';
import { Icon } from './components/Icon';
import { ToastHost } from './components/ToastHost';
import { ConfigProvider } from './features/config/ConfigContext';
import { Configuracion } from './features/config/Configuracion';
import { getConfig } from './lib/configNegocio';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { Reportes } from './features/reportes/Reportes';
import { Precios } from './features/inventario/Precios';
import { Usuarios } from './features/admin/Usuarios';
import { Compras } from './features/compras/Compras';
import './App.css';

// Escáner de barras retirado del alcance (captura manual). Cambiar a true para reactivar.
const SHOW_BARCODE_FEATURES = false;


const LoadingScreen = () => (
  <div className="premium-loading-container">
    <div className="premium-loading-card">
      <div className="premium-loading-icon-wrapper">
        <Icon name="leaf" size={40} color="var(--green)" />
      </div>
      <div>
        <h2 className="premium-loading-title">{getConfig().nombre}</h2>
        <p className="premium-loading-subtitle">Cargando...</p>
      </div>
    </div>
  </div>
);

function AppContent() {
  const { profile, loading, logout } = useAuth();
  
  // 1. Detect if this is a mobile scanner session directly on initialization
  const [scanSession] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('scan_session');
    }
    return null;
  });

  const [screen, setScreen] = useState('login'); // login | dashboard | pos | clientes | inventario | credito | reportes | precios
  const [prevProfileId, setPrevProfileId] = useState<string | null>(null);

  // Barra de estado (theme-color) que combina con la pantalla: oscura cuando el
  // menu movil esta abierto, crema cuando esta cerrado. Evita el bloque blanco.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const appEl = document.querySelector('.app');
    if (!meta || !appEl) return;
    const LIGHT = '#f6f3ec', DARK = '#0f1714';
    const update = () => meta.setAttribute('content', appEl.classList.contains('sidebar-open') ? DARK : LIGHT);
    update();
    const obs = new MutationObserver(update);
    obs.observe(appEl, { attributes: true, attributeFilter: ['class'] });
    return () => { obs.disconnect(); meta.setAttribute('content', LIGHT); };
  }, [profile, loading, scanSession]);

  // 2. Automatically change active screen when profile is loaded (React 18/19 state transition pattern during render)
  if (profile && profile.id !== prevProfileId) {
    setPrevProfileId(profile.id);
    if (profile.rol === 'admin') {
      setScreen('dashboard');
    } else if (profile.rol === 'vendedor') {
      setScreen('pos');
    } else if (profile.rol === 'visitante') {
      setScreen('precios');
    }
  }

  // Reset states if logged out
  if (!profile && prevProfileId !== null) {
    setPrevProfileId(null);
    setScreen('login');
  }

  // If this is a synchronized mobile scanner, bypass login/sidebar.
  // Gateado por SHOW_BARCODE_FEATURES (escáner retirado del alcance): la ruta
  // ?scan_session no abre la cámara salvo que se reactive la feature.
  if (scanSession && SHOW_BARCODE_FEATURES) {
    return <MobileScanner session={scanSession} />;
  }

  // Show premium loading screen when loading is true
  if (loading) {
    return <LoadingScreen />;
  }

  // Show Login page if user is not authenticated
  if (!profile) {
    return <Login />;
  }

  // Map the application roles to the sidebar roles
  const sidebarRole = profile.rol === 'visitante' ? 'usuario' : profile.rol;

  const renderScreen = () => {
    switch (screen) {
      case 'dashboard':
        return <Dashboard onNav={setScreen} />;
      case 'pos':
        return <POS vendedorId={profile.id} vendedorNombre={profile.nombre} onNav={setScreen} />;
      case 'inventario':
        return <Catalogo />;
      case 'proveedores':
        return <Compras vendedorId={profile.id} />;
      case 'caja':
        return <Caja />;
      
      case 'clientes':
        return <Clientes onNav={setScreen} />;
      case 'historial':
        return <HistorialClientes />;
      case 'credito':
        return <CreditosList />;
      case 'historial-ventas':
        return <HistorialVentas rol={profile.rol} vendedorId={profile.id} />;
      case 'reportes':
        return <Reportes />;
      case 'usuarios':
        return profile.rol === 'admin' ? <Usuarios /> : <Precios />;
      case 'configuracion':
        return profile.rol === 'admin' ? <Configuracion /> : <Precios />;
      case 'precios':
      default:
        return <Precios />;
    }
  };

  return (
    <div
      data-screen-label={`${screen}`}
      className="app"
      onClick={() => document.querySelector('.app')?.classList.remove('sidebar-open')}
    >
      <Sidebar role={sidebarRole} screen={screen} onNav={setScreen} onLogout={logout} />
      <main className="main">
        {renderScreen()}
      </main>
    </div>
  );
}

function App() {
  return (
    <ConfigProvider>
      <AuthProvider>
        <AppContent />
        <ToastHost />
      </AuthProvider>
    </ConfigProvider>
  );
}

export default App;

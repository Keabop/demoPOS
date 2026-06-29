import { useState, useEffect, useMemo } from 'react';
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
import { DemoBanner } from './components/DemoBanner';
import { TourGuiado } from './components/TourGuiado';
import { ConfigProvider } from './features/config/ConfigContext';
import { Configuracion } from './features/config/Configuracion';
import { getConfig } from './lib/configNegocio';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { can } from './features/auth/useCan';
import { pantallaInicial, itemsVisibles } from './config/navegacion';
import { useScreenHistory } from './hooks/useScreenHistory';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { AtajosHelp } from './components/AtajosHelp';
import type { Capacidad } from './lib/capacidades';
import { Reportes } from './features/reportes/Reportes';
import { Precios } from './features/inventario/Precios';
import { Usuarios } from './features/admin/Usuarios';
import { Bitacora } from './features/admin/Bitacora';
import { Compras } from './features/compras/Compras';
import './App.css';

// La vista de escáner de CELULAR sincronizado (ruta ?scan_session) usa Supabase Realtime
// broadcast, no soportado por el shim PGlite de la demo. Se mantiene deshabilitada.
const SHOW_MOBILE_SCAN_SYNC = false;


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
  // Keep-alive: pantallas ya visitadas (montadas). Se ocultan en vez de desmontarse
  // para preservar su estado al navegar. Se reinicia al cambiar de usuario/logout.
  const [mounted, setMounted] = useState<string[]>([]);

  // Sincroniza la pantalla con el historial del navegador: `navigate` reemplaza a
  // `setScreen` en la navegación del usuario para que Atrás/Adelante funcionen.
  const navigate = useScreenHistory(screen, setScreen);

  // R8: capa de atajos de teclado a nivel app. Debe ir antes de los returns
  // tempranos (login/loading) para respetar las reglas de hooks.
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const itemsMenu = useMemo(
    () => (profile ? itemsVisibles((c) => can(profile, c)) : []),
    [profile]
  );
  useGlobalShortcuts({
    items: itemsMenu,
    navigate,
    onAbrirAyuda: () => setAyudaAbierta(true),
    habilitado: !!profile,
  });

  // Keep-alive: registra la pantalla activa como montada (lazy-mount al 1er acceso).
  useEffect(() => {
    if (!profile) return;
    setMounted((prev) => (prev.includes(screen) ? prev : [...prev, screen]));
  }, [screen, profile]);

  // Tutorial guiado (driver.js): el tour cambia de pantalla disparando 'demo:goto'.
  useEffect(() => {
    const h = (e: Event) => navigate((e as CustomEvent).detail as string);
    window.addEventListener('demo:goto', h as EventListener);
    return () => window.removeEventListener('demo:goto', h as EventListener);
  }, [navigate]);

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
    setMounted([]); // descarta las pantallas montadas del usuario anterior
    const inicial = pantallaInicial((c) => can(profile, c));
    setScreen(inicial);
    // Ancla la entrada base del historial a la pantalla inicial (replace, no push)
    // para que el botón Atrás pueda regresar a ella tras navegar.
    window.history.replaceState({ screen: inicial }, '');
  }

  // Reset states if logged out
  if (!profile && prevProfileId !== null) {
    setPrevProfileId(null);
    setScreen('login');
    setMounted([]); // libera las pantallas montadas al cerrar sesión
  }

  // If this is a synchronized mobile scanner, bypass login/sidebar.
  // Gateado por SHOW_MOBILE_SCAN_SYNC: el escáner de celular requiere Realtime broadcast
  // (no soportado por el shim PGlite), así que la ruta ?scan_session queda inerte en la demo.
  if (scanSession && SHOW_MOBILE_SCAN_SYNC) {
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

  // Nodo de cada pantalla (mismo switch + guarda por capacidad que antes). Se
  // invoca por cada pantalla MONTADA para el keep-alive (ver más abajo).
  const screenNode = (s: string, activo: boolean): React.ReactNode => {
    // Guarda por capacidad: si el perfil no la tiene, cae a la Lista de Precios.
    const guard = (cap: Capacidad, el: React.ReactNode) => (can(profile, cap) ? el : <Precios activo={activo} />);
    switch (s) {
      case 'dashboard':
        return guard('ver_reportes', <Dashboard onNav={navigate} activo={activo} />);
      case 'pos':
        return guard('vender', <POS vendedorId={profile.id} vendedorNombre={profile.nombre} onNav={navigate} activo={activo} />);
      case 'inventario':
        return guard('gestionar_inventario', <Catalogo activo={activo} />);
      case 'proveedores':
        return guard('gestionar_compras', <Compras vendedorId={profile.id} activo={activo} />);
      case 'caja':
        return guard('manejar_caja', <Caja activo={activo} />);

      case 'clientes':
        return guard('gestionar_clientes', <Clientes onNav={navigate} activo={activo} />);
      case 'historial':
        return guard('ver_estados_cuenta', <HistorialClientes activo={activo} />);
      case 'credito':
        return guard('ver_estados_cuenta', <CreditosList activo={activo} />);
      case 'historial-ventas':
        return guard('vender', <HistorialVentas rol={profile.rol} vendedorId={profile.id} activo={activo} />);
      case 'reportes':
        return guard('ver_reportes', <Reportes activo={activo} />);
      case 'usuarios':
        return guard('gestionar_usuarios', <Usuarios />);
      case 'configuracion':
        return guard('configurar_sistema', <Configuracion />);
      case 'auditoria':
        return guard('ver_auditoria', <Bitacora />);
      case 'precios':
      default:
        return <Precios activo={activo} />;
    }
  };

  // Keep-alive: las pantallas visitadas se mantienen montadas y las inactivas se
  // ocultan con CSS (en vez de desmontarse) para conservar su estado al navegar.
  // La activa siempre está en la lista a renderizar (evita un flash antes de que
  // el efecto agregue la pantalla al conjunto).
  const screensToRender = mounted.includes(screen) ? mounted : [...mounted, screen];

  return (
    <div
      data-screen-label={`${screen}`}
      className="app"
      onClick={() => document.querySelector('.app')?.classList.remove('sidebar-open')}
    >
      <Sidebar screen={screen} onNav={navigate} onLogout={logout} />
      <main className="main">
        {screensToRender.map((s) => (
          // display:contents en la activa → el root del screen queda como hijo
          // flex directo de .main (layout idéntico al actual); display:none oculta
          // las inactivas manteniéndolas montadas con su estado vivo.
          <div key={s} data-keepalive={s} style={{ display: s === screen ? 'contents' : 'none' }}>
            {screenNode(s, s === screen)}
          </div>
        ))}
      </main>
      <AtajosHelp open={ayudaAbierta} onClose={() => setAyudaAbierta(false)} />
    </div>
  );
}

function App() {
  return (
    <ConfigProvider>
      <AuthProvider>
        {/* Banner fijo de demo (≈22px). El espaciador evita que tape el contenido. */}
        <DemoBanner />
        <div style={{ paddingTop: 22 }}>
          <AppContent />
        </div>
        <TourGuiado />
        <ToastHost />
      </AuthProvider>
    </ConfigProvider>
  );
}

export default App;

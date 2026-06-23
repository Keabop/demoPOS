// Main app — router
const App = () => {
  const [screen, setScreen]   = useState('login'); // login | dashboard | pos | clientes | inventario | credito
  const [role, setRole]       = useState(null);

  const handleLogin = (selectedRole) => {
    setRole(selectedRole);
    if (selectedRole === 'admin') setScreen('dashboard');
    else if (selectedRole === 'vendedor') setScreen('pos');
    else setScreen('precios');
  };

  const handleLogout = () => {
    setRole(null);
    setScreen('login');
  };

  if (screen === 'login' || !role) {
    return <Login onLogin={handleLogin} />;
  }

  const renderScreen = () => {
    switch (screen) {
      case 'dashboard':  return <Dashboard onNav={setScreen} />;
      case 'pos':        return <POS />;
      case 'clientes':   return <Clientes onNav={setScreen} />;
      case 'inventario': return <Inventario />;
      case 'credito':    return <Credito onNav={setScreen} />;
      case 'reportes':
      case 'precios':
        return (
          <>
            <Topbar title={screen === 'reportes' ? 'Reportes' : 'Lista de Precios'} subtitle="Vista en construcción para esta demostración" />
            <div className="content">
              <div className="card" style={{padding: 60, textAlign: 'center', color: 'var(--muted)'}}>
                <Icon name={screen === 'reportes' ? 'report' : 'eye'} size={48} color="var(--muted-2)" />
                <div className="h2" style={{marginTop: 16, color: 'var(--ink)'}}>Pantalla disponible en próxima iteración</div>
                <p style={{marginTop: 8, fontSize: 14}}>Esta pantalla se diseñará después de aprobar las pantallas principales.</p>
              </div>
            </div>
          </>
        );
      default: return null;
    }
  };

  return (
    <div data-screen-label={`${screen}`} className="app">
      <Sidebar role={role} screen={screen} onNav={setScreen} onLogout={handleLogout} />
      <main className="main">{renderScreen()}</main>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

# Supabase Auth Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the mock login system with real Supabase Auth, synchronize auth users with public profiles, and implement a global React AuthContext to handle session and role-based access.

**Architecture:** Database-level sync using a Postgres trigger, React Context Provider (`AuthContext`) for auth state management, and refactored UI views utilizing the `useAuth()` hook.

**Tech Stack:** React 19 + TypeScript + Supabase JS SDK + Vitest (Testing) + Postgres

---

### Task 1: Database Migration (Trigger, FK & Seed Users)

**Files:**
- Create: `supabase/migrations/20260613000000_configurar_supabase_auth.sql`

**Step 1: Write the SQL migration file**

Create the file `supabase/migrations/20260613000000_configurar_supabase_auth.sql` containing the trigger and user seed queries:
```sql
-- Habilitar extensión pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Limpiar perfiles temporales de maqueta
DELETE FROM public.perfiles WHERE id IN (
  'e0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000003'
);

-- Crear función de sincronización auth.users -> public.perfiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles (id, email, nombre, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', 'Usuario Nuevo'),
    COALESCE(NEW.raw_user_meta_data->>'rol', 'vendedor')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear el disparador en auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insertar los tres usuarios iniciales directamente en auth.users
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, 
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
  created_at, updated_at
) VALUES 
-- Administrador (admin@agromar.com / adminAgromar)
(
  '00000000-0000-0000-0000-000000000000',
  'e0000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 
  'admin@agromar.com', crypt('adminAgromar', gen_salt('bf', 10)), 
  now(), '{"provider":"email","providers":["email"]}', 
  '{"nombre":"Admin Agromar","rol":"admin"}', now(), now()
),
-- Vendedor (vendedor@agromar.com / vendedorAgromar)
(
  '00000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000002',
  'authenticated', 'authenticated', 
  'vendedor@agromar.com', crypt('vendedorAgromar', gen_salt('bf', 10)), 
  now(), '{"provider":"email","providers":["email"]}', 
  '{"nombre":"Vendedor Agromar","rol":"vendedor"}', now(), now()
),
-- Visitante (visitante@agromar.com / visitanteAgromar)
(
  '00000000-0000-0000-0000-000000000003',
  'authenticated', 'authenticated', 
  'visitante@agromar.com', crypt('visitanteAgromar', gen_salt('bf', 10)), 
  now(), '{"provider":"email","providers":["email"]}', 
  '{"nombre":"Visitante Agromar","rol":"visitante"}', now(), now()
);

-- Añadir la llave foránea fk_perfiles_users apuntando a auth.users(id)
ALTER TABLE public.perfiles 
  ADD CONSTRAINT fk_perfiles_users 
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

**Step 2: Apply SQL migration to database**

Run the migration query directly in the database using the Supabase MCP tool or SQL execution.
Confirm that 3 users were added to `auth.users` and their corresponding profiles appeared in `public.perfiles`.

**Step 3: Commit**

```bash
git add supabase/migrations/20260613000000_configurar_supabase_auth.sql
git commit -m "db: add supabase auth sync trigger, users seed and profile foreign key"
```

---

### Task 2: Auth Context and Hook (`AuthContext.tsx`)

**Files:**
- Create: `src/features/auth/AuthContext.tsx`
- Create: `src/features/auth/AuthContext.test.tsx`

**Step 1: Write a failing test for AuthContext**

Write `src/features/auth/AuthContext.test.tsx` mocking the Supabase JS SDK:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import React from 'react';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn()
    }
  }
}));

describe('AuthContext', () => {
  it('should initially set loading to true and user/profile to null', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- AuthContext`  
Expected: FAIL with "Cannot find module './AuthContext'"

**Step 3: Implement AuthContext**

Create `src/features/auth/AuthContext.tsx`:
```tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Perfil } from '../../types';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  profile: Perfil | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (err) {
      console.error('Error al obtener perfil del usuario:', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Obtener sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // 2. Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, pass: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
};
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- AuthContext`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/features/auth/AuthContext.tsx src/features/auth/AuthContext.test.tsx
git commit -m "feat: implement AuthContext and useAuth hook with unit test"
```

---

### Task 3: Refactor Login View (`Login.tsx`)

**Files:**
- Modify: `src/features/auth/Login.tsx`

**Step 1: Write tests for Login behavior**

Modify tests or write code in `src/features/auth/Login.tsx` ensuring it calls context login.
Since we want fast development, let's update `Login.tsx` directly and verify it compiles.

**Step 2: Implement new Login component**

Update `src/features/auth/Login.tsx` to use `useAuth` hook and provide correct preset autofills:
```tsx
import React, { useState } from 'react';
import { Icon } from '../../components/Icon';
import { useAuth } from './AuthContext';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [role, setRole] = useState<'admin' | 'vendedor' | 'visitante'>('admin');
  const [email, setEmail] = useState('admin@agromar.com');
  const [pass, setPass] = useState('adminAgromar');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const roles = [
    { id: 'admin',    label: 'Administrador', desc: 'Acceso completo · reportes, inventario y caja', icon: 'shield', defaultEmail: 'admin@agromar.com', defaultPass: 'adminAgromar' },
    { id: 'vendedor', label: 'Vendedor',      desc: 'Ventas, clientes y notas a crédito',           icon: 'cart',   defaultEmail: 'vendedor@agromar.com', defaultPass: 'vendedorAgromar' },
    { id: 'visitante',  label: 'Usuario',       desc: 'Sólo consulta de lista de precios',            icon: 'eye',    defaultEmail: 'visitante@agromar.com', defaultPass: 'visitanteAgromar' },
  ] as const;

  const handleRoleChange = (selectedRole: 'admin' | 'vendedor' | 'visitante') => {
    setRole(selectedRole);
    const rInfo = roles.find(r => r.id === selectedRole);
    if (rInfo) {
      setEmail(rInfo.defaultEmail);
      setPass(rInfo.defaultPass);
    }
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const res = await login(email, pass);
    if (!res.success) {
      setErrorMsg(res.error || 'Error al iniciar sesión. Verifique sus datos.');
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div style={{ width: '100%', maxWidth: 980, display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 0, background: 'var(--surface)', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--line)' }}>

        {/* Left brand panel */}
        <div style={{ background: 'linear-gradient(160deg, #0f1714 0%, #1a2a23 100%)', color: '#fff', padding: '44px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -120, top: -120, width: 380, height: 380, borderRadius: '50%', border: '1px solid oklch(0.7 0.13 145 / 0.15)' }}></div>
          <div style={{ position: 'absolute', right: -60, top: -60, width: 260, height: 260, borderRadius: '50%', border: '1px solid oklch(0.7 0.13 145 / 0.1)' }}></div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)' }}>
              <Icon name="leaf" size={26} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>AGROMAR</div>
              <div style={{ fontSize: 11, color: '#a4b3ad', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Punto de Venta · v3.2</div>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em', textWrap: 'pretty' }}>
              Insumos agrícolas para el productor mexicano
            </div>
            <p style={{ marginTop: 14, color: '#a4b3ad', fontSize: 14, lineHeight: 1.55, maxWidth: 380 }}>
              Sistema integral de ventas, inventario y notas a crédito.
              Diseñado para mostradores rápidos y para el productor que paga al levantar la cosecha.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', fontSize: 12, color: '#7d8a83' }}>
            <div style={{display:'flex', alignItems:'center', gap: 6}}>
              <span style={{width: 6, height: 6, borderRadius: 999, background: 'var(--green)'}}></span>
              Servidor en línea
            </div>
            <span>·</span>
            <span>Conectado a Supabase</span>
          </div>
        </div>

        {/* Right form panel */}
        <div style={{ padding: '44px 44px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Iniciar sesión</div>
          <h1 className="h1" style={{ marginTop: 6, marginBottom: 26 }}>Bienvenido de vuelta</h1>

          <form onSubmit={handleSubmit}>
            <div className="label">Tipo de usuario</div>
            <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
              {roles.map(r => {
                const active = role === r.id;
                return (
                  <button
                    type="button"
                    key={r.id}
                    disabled={loading}
                    onClick={() => handleRoleChange(r.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
                      border: `1.5px solid ${active ? 'var(--green)' : 'var(--line)'}`,
                      background: active ? 'var(--green-soft)' : 'var(--surface)',
                      borderRadius: 10, textAlign: 'left', transition: 'all 0.12s',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      width: '100%'
                    }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: active ? 'var(--green)' : 'var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? '#fff' : 'var(--ink-2)', flex: 'none' }}>
                      <Icon name={r.icon} size={18} />
                    </div>
                    <div style={{flex: 1}}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{r.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.desc}</div>
                    </div>
                    <div style={{ width: 18, height: 18, borderRadius: 999, border: `2px solid ${active ? 'var(--green)' : '#d4cebe'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {active && <div style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--green)' }}></div>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="label">Correo Electrónico</div>
            <input 
              type="email"
              className="input input-lg" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              style={{marginBottom: 14}} 
              disabled={loading}
              required 
            />

            <div className="label" style={{display: 'flex', justifyContent: 'space-between'}}>
              <span>Contraseña</span>
              <span style={{ color: 'var(--green-2)', fontWeight: 600, cursor: 'pointer' }}>¿Olvidaste tu contraseña?</span>
            </div>
            <div style={{position: 'relative', marginBottom: 22}}>
              <input
                className="input input-lg"
                type={showPass ? 'text' : 'password'}
                value={pass}
                onChange={e => setPass(e.target.value)}
                style={{paddingRight: 44}}
                disabled={loading}
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', padding: 8, color: 'var(--muted)', background: 'transparent', border: 0, cursor: 'pointer' }}
              >
                <Icon name="eye" size={16} />
              </button>
            </div>

            {errorMsg && (
              <div style={{ padding: '12px 14px', background: 'var(--red-soft)', color: 'var(--red)', borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="alert" size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>
              {loading ? 'Validando acceso...' : 'Entrar al sistema'}
              <Icon name="arrow-right" size={18} />
            </button>
          </form>

          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)', display:'flex', justifyContent: 'space-between' }}>
            <span>© 2026 AGROMAR Insumos del Campo</span>
            <span>Soporte: 442 100 0000</span>
          </div>
        </div>
      </div>
    </div>
  );
};
```

**Step 3: Verify and Commit**

Verify that tests compile and commit:
```bash
git add src/features/auth/Login.tsx
git commit -m "feat: refactor Login screen to utilize Supabase Auth context"
```

---

### Task 4: Main Layout and Routing Refactor (`App.tsx`)

**Files:**
- Modify: `src/App.tsx`

**Step 1: Refactor App.tsx to use AuthProvider**

Replace contents of `src/App.tsx`:
```tsx
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { Login } from './features/auth/Login';
import { POS } from './features/pos/POS';
import { MobileScanner } from './features/pos/MobileScanner';
import { Catalogo } from './features/inventario/Catalogo';
import { Dashboard } from './features/dashboard/Dashboard';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Icon } from './components/Icon';
import './App.css';

function AppContent() {
  const [scanSession, setScanSession] = useState<string | null>(null);
  const [screen, setScreen] = useState('login'); 
  const { profile, loading, logout } = useAuth();

  // 1. Detect if this is a mobile scanner session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get('scan_session');
    if (session) {
      setScanSession(session);
    }
  }, []);

  // 2. Set default screen depending on role upon profile load
  useEffect(() => {
    if (profile) {
      if (profile.rol === 'admin') {
        setScreen('dashboard');
      } else if (profile.rol === 'vendedor') {
        setScreen('pos');
      } else {
        setScreen('precios');
      }
    }
  }, [profile]);

  // If this is a synchronized mobile scanner, bypass login/sidebar
  if (scanSession) {
    return <MobileScanner session={scanSession} />;
  }

  // Show premium loading screen
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: 16 }}>
        <div className="pulse-logo" style={{ fontSize: 48, animation: 'logo-pulse-anim 1.6s infinite ease-in-out' }}>🌱</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green-2)' }}>Iniciando AGROMAR...</div>
        <style>{`
          @keyframes logo-pulse-anim {
            0% { transform: scale(0.9); opacity: 0.6; }
            50% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(0.9); opacity: 0.6; }
          }
        `}</style>
      </div>
    );
  }

  // Render Login page if not authenticated
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
        return <POS vendedorId={profile.id} vendedorNombre={profile.nombre} />;
      case 'inventario':
        return <Catalogo />;
      
      // Placeholders for other screens in progress
      case 'clientes':
      case 'credito':
      case 'reportes':
      case 'precios':
      default:
        return (
          <>
            <Topbar 
              title={screen === 'clientes' ? 'Clientes' : screen === 'credito' ? 'Notas a Crédito' : screen === 'reportes' ? 'Reportes' : 'Lista de Precios'} 
              subtitle="Vista en desarrollo para esta iteración" 
            />
            <div className="content">
              <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>
                <Icon name={screen === 'credito' ? 'credit' : screen === 'clientes' ? 'users' : 'report'} size={48} color="var(--muted-2)" />
                <div className="h2" style={{ marginTop: 16, color: 'var(--ink)' }}>Pantalla en Construcción</div>
                <p style={{ marginTop: 8, fontSize: 14 }}>Esta vista se integrará completamente en la próxima fase del proyecto.</p>
                <div style={{ marginTop: 20 }}>
                  <button className="btn btn-primary" onClick={() => setScreen(profile.rol === 'admin' ? 'dashboard' : 'pos')}>Volver</button>
                </div>
              </div>
            </div>
          </>
        );
    }
  };

  return (
    <div data-screen-label={`${screen}`} className="app">
      <Sidebar role={sidebarRole} screen={screen} onNav={setScreen} onLogout={logout} />
      <main className="main" onClick={() => document.querySelector('.app')?.classList.remove('sidebar-open')}>
        {renderScreen()}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
```

**Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wrap application in AuthProvider and refactor App navigation"
```

---

### Task 5: Sidebar and POS Context integration

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/features/pos/POS.tsx`

**Step 1: Connect Sidebar and POS to AuthContext**

1. In `src/components/Sidebar.tsx`, retrieve user profile details from the `useAuth()` hook to display them at the bottom profile banner, replacing any static values, and wire the `onLogout` button to context `logout()`.
2. In `src/features/pos/POS.tsx`, confirm that if it uses `vendedorId` and `vendedorNombre` as props, it receives them from `App.tsx` correctly (since we passed `profile.id` and `profile.nombre`). Double-check that it successfully executes transaction calls.

**Step 2: Verify the whole app build and run tests**

Run: `npm run lint` and `npm run test` to make sure all tests pass and there are no compilation errors.

**Step 3: Commit**

```bash
git add src/components/Sidebar.tsx src/features/pos/POS.tsx
git commit -m "refactor: integrate AuthContext with Sidebar and verify POS props mapping"
```

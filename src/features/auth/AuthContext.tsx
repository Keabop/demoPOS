import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
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

      // Soft-delete: una cuenta desactivada no debe poder usar la app.
      if (data && data.activo === false) {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        return;
      }

      setProfile(data);
    } catch (err) {
      console.error('Error al obtener perfil del usuario:', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // onAuthStateChange emite INITIAL_SESSION al suscribirse con la sesión
    // actual (o null), así que cubre la carga inicial sin necesidad de un
    // getSession() aparte (eso causaba doble fetchProfile y una race).
    // El callback NO es async: disparar fetchProfile sin await evita el
    // posible deadlock del cliente de auth al llamar APIs dentro del callback.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        fetchProfile(session.user.id);
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

  const login = useCallback(async (email: string, pass: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) {
      return { success: false, error: error.message };
    }
    // Soft-delete: rechazar el acceso (con mensaje) si la cuenta está desactivada.
    if (data.user) {
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('activo')
        .eq('id', data.user.id)
        .single();
      if (perfil && perfil.activo === false) {
        await supabase.auth.signOut();
        return { success: false, error: 'Tu cuenta está desactivada. Contacta al administrador.' };
      }
    }
    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ user, profile, loading, login, logout }),
    [user, profile, loading, login, logout],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// El hook useAuth convive con el provider en este archivo a propósito (patrón
// común de contexto). Fast Refresh lo tolera sin problema en la práctica.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
};

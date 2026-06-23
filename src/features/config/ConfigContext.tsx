import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { CONFIG_DEFAULT, configDesdeRow, setConfigActual, type ConfigNegocio } from '../../lib/configNegocio';

interface ConfigCtx {
  config: ConfigNegocio;
  recargar: () => Promise<void>;
}

const Ctx = createContext<ConfigCtx>({ config: CONFIG_DEFAULT, recargar: async () => {} });

// eslint-disable-next-line react-refresh/only-export-components
export const useConfig = (): ConfigCtx => useContext(Ctx);

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<ConfigNegocio>(CONFIG_DEFAULT);

  const recargar = useCallback(async () => {
    let c: ConfigNegocio = CONFIG_DEFAULT;
    try {
      const { data, error } = await supabase.from('configuracion').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      c = configDesdeRow(data);
    } catch {
      // Fallback: si la tabla/fila no existe o falla la red, se queda con los defaults (CONFIG_DEFAULT).
    }
    setConfig(c);
    setConfigActual(c); // también para los generadores PDF (funciones puras)
    if (typeof document !== 'undefined') {
      document.title = `${c.nombre} · Punto de Venta`;
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return <Ctx.Provider value={{ config, recargar }}>{children}</Ctx.Provider>;
};

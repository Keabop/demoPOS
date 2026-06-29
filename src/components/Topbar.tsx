import React, { useState, useEffect, useId } from 'react';
import { Icon } from './Icon';
import { supabase } from '../lib/supabase';

interface TopbarProps {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}

export const Topbar: React.FC<TopbarProps> = ({ title, subtitle, children }) => {
  const [cajaStatus, setCajaStatus] = useState<{ abierta: boolean; label?: string; esPrevio?: boolean }>({ abierta: false });
  // Nombre de canal ÚNICO por instancia: con keep-alive (varias pantallas montadas)
  // hay varios Topbars vivos; un nombre fijo colisiona en Supabase Realtime
  // ("cannot add postgres_changes after subscribe()") y tumba la app.
  const uid = useId();

  useEffect(() => {
    const checkCaja = async () => {
      try {
        // 1. Get the latest apertura
        const { data: apData, error: apErr } = await supabase
          .from('movimientos_caja')
          .select('*')
          .eq('tipo', 'apertura')
          .order('fecha', { ascending: false })
          .limit(1);

        if (apErr) throw apErr;

        if (!apData || apData.length === 0) {
          setCajaStatus({ abierta: false });
          return;
        }

        const lastApertura = apData[0];

        // 2. Check if there is a closing egreso after the last apertura
        const { data: clData, error: clErr } = await supabase
          .from('movimientos_caja')
          .select('*')
          .eq('tipo', 'egreso')
          .like('descripcion', 'Corte de caja%')
          .gt('fecha', lastApertura.fecha)
          .order('fecha', { ascending: false })
          .limit(1);

        if (clErr) throw clErr;

        if (clData && clData.length > 0) {
          setCajaStatus({ abierta: false });
        } else {
          // Format time for label
          const date = new Date(lastApertura.fecha);
          const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dateStr = date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
          
          // Check if it's from a different day or open for more than 16 hours
          const today = new Date();
          const diffHours = (today.getTime() - date.getTime()) / (1000 * 60 * 60);
          const esPrevio = date.toDateString() !== today.toDateString() || diffHours > 16;

          setCajaStatus({ 
            abierta: true, 
            label: `Turno ${dateStr} ${timeStr}`,
            esPrevio
          });
        }
      } catch (err) {
        console.error('Error checking caja status in Topbar:', err);
      }
    };

    checkCaja();

    // Sincronizar en tiempo real (canal único por instancia, ver `uid`).
    const channel = supabase
      .channel(`topbar-caja-sync-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'movimientos_caja' },
        () => {
          checkCaja();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid]);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="mobile-menu-btn"
          onClick={(e) => {
            e.stopPropagation();
            document.querySelector('.app')?.classList.toggle('sidebar-open');
          }}
          style={{ marginRight: 8, padding: 6, cursor: 'pointer', display: 'none', color: 'var(--ink)' }}
        >
          <Icon name="menu" size={22} />
        </button>
        <div>
          <div className="topbar-title">{title}</div>
          {subtitle && <div className="topbar-sub">{subtitle}</div>}
        </div>
      </div>
      <div className="topbar-right">
        {children}
        {cajaStatus.abierta ? (
          <div 
            className="topbar-caja-badge" 
            style={{
              display: 'flex', 
              alignItems: 'center', 
              gap: 8, 
              padding: '6px 12px', 
              background: cajaStatus.esPrevio ? 'var(--amber-soft)' : 'var(--green-soft)', 
              borderRadius: 999, 
              fontSize: 12, 
              fontWeight: 600, 
              color: cajaStatus.esPrevio ? 'oklch(0.52 0.13 75)' : 'var(--green-2)'
            }}
            title={cajaStatus.esPrevio ? 'Este turno es de un día anterior o lleva abierto más de 16 horas. Se recomienda realizar corte de caja.' : undefined}
          >
            <span style={{
              width: 6, 
              height: 6, 
              borderRadius: 999, 
              background: cajaStatus.esPrevio ? 'var(--amber)' : 'var(--green)'
            }}></span>
            Caja abierta · {cajaStatus.label} {cajaStatus.esPrevio && <span style={{fontSize: 10, opacity: 0.85, fontWeight: 700}}>· Turno previo</span>}
          </div>
        ) : (
          <div className="topbar-caja-badge" style={{display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--red-soft)', borderRadius: 999, fontSize: 12, fontWeight: 600, color: 'var(--red)'}}>
            <span style={{width: 6, height: 6, borderRadius: 999, background: 'var(--red)'}}></span>
            Caja cerrada
          </div>
        )}
      </div>
    </header>
  );
};

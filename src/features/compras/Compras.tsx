import React, { useState } from 'react';
import { Topbar } from '../../components/Topbar';
import { Icon } from '../../components/Icon';
import { OrdenesTab } from './OrdenesTab';
import { ProveedoresTab } from './ProveedoresTab';
import { ComprasLocalesTab } from './ComprasLocalesTab';

interface ComprasProps {
  vendedorId: string;
  activo?: boolean;
}

type Tab = 'ordenes' | 'locales' | 'proveedores';

export const Compras: React.FC<ComprasProps> = ({ vendedorId, activo }) => {
  const [tab, setTab] = useState<Tab>('ordenes');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'ordenes', label: 'Órdenes de Compra', icon: 'credit' },
    { id: 'locales', label: 'Compras locales', icon: 'sack' },
    { id: 'proveedores', label: 'Proveedores', icon: 'users' },
  ];

  return (
    <>
      <Topbar title="Proveedores" subtitle="Proveedores y órdenes de compra" />
      <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div data-tour="compras-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, background: 'var(--surface-2)', padding: 4, borderRadius: 8, border: '1px solid var(--line)', alignSelf: 'flex-start' }}>
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 0, cursor: 'pointer', background: active ? 'var(--surface)' : 'transparent', color: active ? 'var(--green)' : 'var(--muted)', boxShadow: active ? 'var(--shadow-sm)' : 'none' }}>
                <Icon name={t.icon} size={16} color={active ? 'var(--green)' : 'var(--muted)'} />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'ordenes' ? <OrdenesTab vendedorId={vendedorId} />
          : tab === 'locales' ? <ComprasLocalesTab />
          : <ProveedoresTab activo={activo} />}
      </div>
    </>
  );
};

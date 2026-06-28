import React, { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Topbar } from '../../components/Topbar';
import { CrearUsuarioModal } from './CrearUsuarioModal';
import { UsuariosList } from './UsuariosList';

// Panel de administración de usuarios. La creación segura de logins se hace vía
// la Edge Function `crear-usuario` (el browser no puede usar la service_role key).
export const Usuarios: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <Topbar title="Usuarios" subtitle="Alta y gestión de cuentas de acceso" />
      <div
        style={{
          minHeight: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '32px 24px',
          boxSizing: 'border-box',
        }}
      >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Recuadro de acción */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.08))',
            padding: 32,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'var(--green-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="users" size={28} color="var(--green)" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>
              Usuarios
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>
              Alta de cuentas de acceso al sistema (vendedores, visitantes o administradores).
            </p>
          </div>

          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--muted)',
              lineHeight: 1.6,
              background: 'var(--surface-2)',
              border: '1px solid var(--line-2)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 16px',
            }}
          >
            Al crear un usuario se genera su acceso y se sincroniza automáticamente su perfil y
            rol. Cada venta queda registrada con el vendedor que la realizó.
          </p>

          <button
            className="btn btn-primary"
            style={{
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 4,
            }}
            onClick={() => setModalOpen(true)}
          >
            <Icon name="users" size={16} />
            Crear usuario
          </button>
        </div>

        {/* Recuadro con la lista de usuarios creados */}
        <UsuariosList refreshKey={refreshKey} />
      </div>

      <CrearUsuarioModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />
      </div>
    </>
  );
};

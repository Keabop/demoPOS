import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../../components/Icon';
import type { Perfil } from '../../types';
import { EditarUsuarioModal } from './EditarUsuarioModal';

interface UsuariosListProps {
  /** Cambia este valor desde el padre para forzar una recarga (p.ej. tras crear un usuario). */
  refreshKey: number;
}

const ROL_LABEL: Record<Perfil['rol'], string> = {
  admin: 'Administrador',
  vendedor: 'Vendedor',
  visitante: 'Visitante',
};

const ROL_BADGE: Record<Perfil['rol'], { bg: string; fg: string }> = {
  admin: { bg: 'var(--green-soft, oklch(0.95 0.04 145))', fg: 'var(--green)' },
  vendedor: { bg: 'var(--surface-2)', fg: 'var(--ink-2)' },
  visitante: { bg: 'var(--surface-2)', fg: 'var(--muted)' },
};

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

// Extrae el mensaje legible de un error de supabase.functions.invoke (FunctionsHttpError).
interface ContextConJson {
  json: () => Promise<unknown>;
}
function tieneContextJson(value: unknown): value is { context: ContextConJson } {
  if (typeof value !== 'object' || value === null) return false;
  const ctx = (value as { context?: unknown }).context;
  return typeof ctx === 'object' && ctx !== null && typeof (ctx as { json?: unknown }).json === 'function';
}
async function extraerMensajeError(error: unknown): Promise<string> {
  if (tieneContextJson(error)) {
    try {
      const cuerpo = await error.context.json();
      if (typeof cuerpo === 'object' && cuerpo !== null && typeof (cuerpo as { error?: unknown }).error === 'string') {
        return (cuerpo as { error: string }).error;
      }
    } catch {
      /* cae al genérico */
    }
  }
  if (error instanceof Error) return error.message;
  return 'No se pudo completar la acción.';
}

type Accion = { tipo: 'eliminar' | 'desactivar'; usuario: Perfil };

export const UsuariosList: React.FC<UsuariosListProps> = ({ refreshKey }) => {
  const { profile } = useAuth();
  const [usuarios, setUsuarios] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Perfil | null>(null);

  // Confirmación de acción destructiva (eliminar o desactivar).
  const [accion, setAccion] = useState<Accion | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Reactivar es seguro y reversible → directo, con loading por fila.
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('perfiles')
      .select('id, email, nombre, rol, activo, creado_en')
      .order('creado_en', { ascending: true });

    if (error) {
      setError('No se pudieron cargar los usuarios.');
      setUsuarios([]);
    } else {
      setUsuarios((data as Perfil[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios, refreshKey]);

  const handleConfirmAccion = async () => {
    if (!accion) return;
    setActionLoading(true);
    setActionError(null);
    try {
      if (accion.tipo === 'eliminar') {
        const { error } = await supabase.functions.invoke('eliminar-usuario', {
          body: { id: accion.usuario.id },
        });
        if (error) throw new Error(await extraerMensajeError(error));
      } else {
        // Desactivar = soft-delete: solo marca activo=false (RLS perfiles_update_admin).
        const { error } = await supabase
          .from('perfiles')
          .update({ activo: false })
          .eq('id', accion.usuario.id);
        if (error) throw new Error(error.message);
      }
      setAccion(null);
      fetchUsuarios();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo completar la acción.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivar = async (u: Perfil) => {
    setBusyId(u.id);
    const { error } = await supabase.from('perfiles').update({ activo: true }).eq('id', u.id);
    setBusyId(null);
    if (!error) fetchUsuarios();
  };

  const cardStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.08))',
    overflow: 'hidden',
  };

  const accionBtn = (color: string): React.CSSProperties => ({
    flex: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    fontSize: 13,
    background: 'transparent',
    border: `1px solid ${color}`,
    color,
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
  });

  const esEliminar = accion?.tipo === 'eliminar';
  const accent = esEliminar ? 'var(--red)' : 'var(--amber)';
  const accentSoft = esEliminar ? 'var(--red-soft)' : 'var(--amber-soft)';

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--line-2)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
          Usuarios del sistema
        </h2>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {loading ? '—' : `${usuarios.length} ${usuarios.length === 1 ? 'usuario' : 'usuarios'}`}
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          Cargando usuarios...
        </div>
      ) : error ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--red)', fontSize: 14 }}>{error}</div>
      ) : usuarios.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          Aún no hay usuarios registrados.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {usuarios.map((u, i) => {
            const esYo = u.id === profile?.id;
            const esVisitante = u.rol === 'visitante';
            const activo = u.activo !== false;
            const badge = ROL_BADGE[u.rol];
            return (
              <li
                key={u.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 20px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--line-2)',
                  opacity: activo ? 1 : 0.6,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    flex: 'none',
                    background: 'var(--green-soft, oklch(0.95 0.04 145))',
                    color: 'var(--green)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {iniciales(u.nombre)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--ink)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {u.nombre}
                    </span>
                    {esYo && <span style={{ fontSize: 11, color: 'var(--muted)', flex: 'none' }}>(tú)</span>}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {u.email}
                  </div>
                </div>

                <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: badge.bg,
                      color: badge.fg,
                    }}
                  >
                    {ROL_LABEL[u.rol]}
                  </span>
                  {!activo && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: 999,
                        background: 'var(--red-soft)',
                        color: 'var(--red)',
                      }}
                    >
                      Inactivo
                    </span>
                  )}
                </div>

                {/* Acciones por rol y estado:
                    - Visitante: Eliminar (sin historial, borrado físico).
                    - Vendedor/Admin activo: Editar + Desactivar (soft-delete, conserva ventas).
                    - Vendedor/Admin inactivo: Reactivar + Eliminar.
                    - Tu propia cuenta: solo Editar (anti-bloqueo). */}
                <div style={{ flex: 'none', display: 'flex', gap: 8 }}>
                  {esYo ? (
                    <button
                      className="btn btn-secondary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13 }}
                      onClick={() => setEditando(u)}
                      title="Editar usuario"
                    >
                      <Icon name="edit" size={14} />
                      Editar
                    </button>
                  ) : esVisitante ? (
                    <button
                      style={accionBtn('var(--red)')}
                      onClick={() => {
                        setActionError(null);
                        setAccion({ tipo: 'eliminar', usuario: u });
                      }}
                      title="Eliminar usuario"
                    >
                      <Icon name="trash" size={14} />
                      Eliminar
                    </button>
                  ) : activo ? (
                    <>
                      <button
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13 }}
                        onClick={() => setEditando(u)}
                        title="Editar usuario"
                      >
                        <Icon name="edit" size={14} />
                        Editar
                      </button>
                      <button
                        style={accionBtn('var(--amber)')}
                        onClick={() => {
                          setActionError(null);
                          setAccion({ tipo: 'desactivar', usuario: u });
                        }}
                        title="Desactivar usuario (conserva su historial)"
                      >
                        <Icon name="shield" size={14} />
                        Desactivar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        style={accionBtn('var(--green)')}
                        disabled={busyId === u.id}
                        onClick={() => handleReactivar(u)}
                        title="Reactivar usuario"
                      >
                        <Icon name="check" size={14} />
                        {busyId === u.id ? '...' : 'Reactivar'}
                      </button>
                      <button
                        style={accionBtn('var(--red)')}
                        onClick={() => {
                          setActionError(null);
                          setAccion({ tipo: 'eliminar', usuario: u });
                        }}
                        title="Eliminar usuario"
                      >
                        <Icon name="trash" size={14} />
                        Eliminar
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <EditarUsuarioModal
        isOpen={editando !== null}
        usuario={editando}
        bloquearRol={editando?.id === profile?.id}
        onClose={() => setEditando(null)}
        onSaved={() => {
          setEditando(null);
          fetchUsuarios();
        }}
      />

      {/* Confirmación de eliminar / desactivar */}
      {accion && (
        <div
          onClick={() => !actionLoading && setAccion(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.18))',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  flex: 'none',
                  background: accentSoft,
                  color: accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={esEliminar ? 'trash' : 'shield'} size={18} />
              </span>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>
                {esEliminar ? 'Eliminar usuario' : 'Desactivar usuario'}
              </h3>
            </div>

            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              {esEliminar ? (
                <>
                  ¿Seguro que quieres eliminar a <strong>{accion.usuario.nombre}</strong> (
                  {accion.usuario.email})? Esta acción no se puede deshacer.
                </>
              ) : (
                <>
                  ¿Desactivar a <strong>{accion.usuario.nombre}</strong>? No podrá iniciar sesión ni
                  operar, pero <strong>se conservan todas sus ventas y movimientos</strong>. Podrás
                  reactivarlo cuando quieras.
                </>
              )}
            </p>

            {actionError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 16px',
                  background: 'var(--red-soft)',
                  border: '1px solid oklch(0.85 0.1 25)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--red)',
                  fontSize: 13,
                }}
              >
                <Icon name="alert" size={16} />
                <span>{actionError}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
              <button className="btn btn-secondary" onClick={() => setAccion(null)} disabled={actionLoading}>
                Cancelar
              </button>
              <button
                onClick={handleConfirmAccion}
                disabled={actionLoading}
                style={{
                  background: accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: actionLoading ? 'default' : 'pointer',
                  opacity: actionLoading ? 0.7 : 1,
                }}
              >
                {actionLoading
                  ? esEliminar
                    ? 'Eliminando...'
                    : 'Desactivando...'
                  : esEliminar
                    ? 'Sí, eliminar'
                    : 'Sí, desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

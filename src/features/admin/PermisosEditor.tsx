import React from 'react';
import { PLANTILLAS, CAPACIDADES_META, permisosDePlantilla, type Permisos, type Capacidad } from '../../lib/capacidades';

export interface PerfilForm {
  plantilla: string;
  etiqueta: string;
  permisos: Permisos;
}

interface Props {
  value: PerfilForm;
  onChange: (v: PerfilForm) => void;
  disabled?: boolean;
}

/** Selector de plantilla + nombre visible + checkboxes de capacidades. Reutilizado por Crear/Editar usuario. */
export const PermisosEditor: React.FC<Props> = ({ value, onChange, disabled }) => {
  const aplicarPlantilla = (id: string) => {
    const pl = permisosDePlantilla(id);
    if (!pl) {
      onChange({ ...value, plantilla: id });
      return;
    }
    onChange({ plantilla: id, etiqueta: value.etiqueta || pl.etiqueta, permisos: { ...pl.permisos } });
  };

  const toggle = (cap: Capacidad) =>
    onChange({ ...value, plantilla: 'personalizado', permisos: { ...value.permisos, [cap]: !value.permisos[cap] } });

  const grupos = ['Visibilidad', 'Acciones'] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="form-group">
        <label className="label">Plantilla</label>
        <select
          className="input"
          value={value.plantilla}
          disabled={disabled}
          onChange={(e) => aplicarPlantilla(e.target.value)}
        >
          {PLANTILLAS.map((p) => (
            <option key={p.id} value={p.id}>{p.etiqueta}</option>
          ))}
          <option value="personalizado">Personalizado</option>
        </select>
      </div>

      <div className="form-group">
        <label className="label">Nombre del perfil (visible)</label>
        <input
          className="input"
          value={value.etiqueta}
          disabled={disabled}
          placeholder="Ej. Técnico, Ventas, Mostrador…"
          onChange={(e) => onChange({ ...value, etiqueta: e.target.value })}
        />
      </div>

      {grupos.map((g) => (
        <div key={g}>
          <div className="label" style={{ marginBottom: 6 }}>{g}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {CAPACIDADES_META.filter((c) => c.grupo === g).map((c) => (
              <label
                key={c.cap}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: disabled ? 'default' : 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={!!value.permisos[c.cap]}
                  disabled={disabled}
                  onChange={() => toggle(c.cap)}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

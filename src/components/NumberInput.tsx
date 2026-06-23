import React, { useState, useEffect } from 'react';

/**
 * Input numérico controlado que SÍ se puede dejar vacío.
 *
 * Problema que resuelve: un `<input value={numero}>` con onChange que hace
 * Number(e.target.value) fuerza el "0" — al borrar el campo, Number('') === 0
 * reaparece y no se puede vaciar. Aquí el display lo maneja un borrador (string),
 * así que el campo puede quedar vacío mientras el modelo numérico vale 0.
 */
interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onChange: (n: number) => void;
  /** Permitir decimales (default true). Si es false, solo enteros. */
  allowDecimal?: boolean;
}

// 0 (o no-finito) se muestra como vacío para que nunca quede un "0" pegado.
const fmtDraft = (v: number) => (v === 0 || !Number.isFinite(v) ? '' : String(v));

export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  allowDecimal = true,
  className = 'input',
  ...rest
}) => {
  const [draft, setDraft] = useState<string>(() => fmtDraft(value));

  // Sincroniza el borrador cuando el valor cambia desde fuera (reset de formulario,
  // botones +/-, carga de datos). No pisa lo que el usuario está tecleando.
  useEffect(() => {
    const parsed = draft.trim() === '' ? 0 : Number(draft);
    if (Number.isFinite(parsed) && parsed === value) return;
    setDraft(fmtDraft(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const pattern = allowDecimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw !== '' && !pattern.test(raw)) return; // rechaza caracteres no numéricos
    setDraft(raw);
    // Estados intermedios/vacíos → el modelo vale 0, pero el display queda como está.
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
      onChange(0);
      return;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(n);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      className={className}
      value={draft}
      onChange={handleChange}
    />
  );
};

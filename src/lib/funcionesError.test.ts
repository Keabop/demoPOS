import { describe, it, expect } from 'vitest';
import { extraerMensajeError } from './funcionesError';

describe('extraerMensajeError', () => {
  it('extrae el mensaje del cuerpo JSON de un FunctionsHttpError', async () => {
    const error = { context: { json: async () => ({ error: 'Acceso denegado.' }) } };
    expect(await extraerMensajeError(error)).toBe('Acceso denegado.');
  });

  it('cae al message de un Error estándar', async () => {
    expect(await extraerMensajeError(new Error('boom'))).toBe('boom');
  });

  it('usa el genérico provisto cuando no hay información útil', async () => {
    expect(await extraerMensajeError({}, 'Error al crear el usuario.')).toBe(
      'Error al crear el usuario.',
    );
  });
});

// Extrae el mensaje legible de un error de supabase.functions.invoke
// (FunctionsHttpError), cuyo cuerpo JSON suele venir en error.context.json().

interface ContextConJson {
  json: () => Promise<unknown>;
}

function tieneContextJson(value: unknown): value is { context: ContextConJson } {
  if (typeof value !== 'object' || value === null) return false;
  const ctx = (value as { context?: unknown }).context;
  return (
    typeof ctx === 'object' &&
    ctx !== null &&
    typeof (ctx as { json?: unknown }).json === 'function'
  );
}

export async function extraerMensajeError(
  error: unknown,
  generico = 'No se pudo completar la acción.',
): Promise<string> {
  if (tieneContextJson(error)) {
    try {
      const cuerpo = await error.context.json();
      if (
        typeof cuerpo === 'object' &&
        cuerpo !== null &&
        typeof (cuerpo as { error?: unknown }).error === 'string'
      ) {
        return (cuerpo as { error: string }).error;
      }
    } catch {
      // Cae al genérico de abajo.
    }
  }
  if (error instanceof Error) return error.message;
  return generico;
}

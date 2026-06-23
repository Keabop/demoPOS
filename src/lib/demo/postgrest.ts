// src/lib/demo/postgrest.ts
// Parser mínimo del lenguaje "select" de PostgREST y generador de SQL con
// subconsultas JSON para los embeds que usa AGROMAR. Cubre: columnas planas,
// '*', embeds many-to-one (objeto) y one-to-many (arreglo), con alias y anidamiento.
//
// Corrección vs. el plan: cuando '*' aparece JUNTO a un embed dentro de una
// subconsulta (p.ej. `ventas_detalles(*, productos(*))`), se conservan TODAS las
// columnas de la fila con `to_jsonb(alias) || jsonb_build_object(<embeds>)`, en vez
// de descartarlas.

// --- Metadatos de relaciones (FKs del snapshot §3). FK_TARGET[base][fkColumn] = tablaDestino ---
const FK_TARGET: Record<string, Record<string, string>> = {
  ventas: { cliente_id: 'clientes', vendedor_id: 'perfiles' },
  ventas_detalles: { venta_id: 'ventas', producto_id: 'productos', lote_id: 'lotes' },
  movimientos_caja: { vendedor_id: 'perfiles', venta_id: 'ventas', pago_id: 'pagos_credito' },
  movimientos_inventario: { producto_id: 'productos', lote_id: 'lotes' },
  pagos_credito: { venta_id: 'ventas' },
  lotes: { producto_id: 'productos' },
  ordenes_compra: { proveedor_id: 'proveedores', creado_por: 'perfiles' },
  ordenes_compra_detalles: { orden_id: 'ordenes_compra', producto_id: 'productos' },
  proveedor_productos: { proveedor_id: 'proveedores', producto_id: 'productos' },
};

export type Field =
  | { col: string }
  | { key: string; table: string; kind: 'one' | 'many'; joinCol: string; fields: Field[] };

export function lit(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Parte una lista por comas respetando paréntesis anidados.
function splitTop(s: string): string[] {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Resuelve (tablaDestino, kind, joinCol) para un embed sobre `base`.
function resolveRel(base: string, fkHint: string | null, embedName: string)
  : { table: string; kind: 'one' | 'many'; joinCol: string } {
  // Caso alias:fk(...) -> many-to-one por la FK indicada.
  if (fkHint) {
    const table = FK_TARGET[base]?.[fkHint];
    if (!table) throw new Error(`Embed: FK ${base}.${fkHint} desconocida`);
    return { table, kind: 'one', joinCol: fkHint };
  }
  // ¿many-to-one? alguna FK de `base` apunta a embedName.
  const fkCol = Object.entries(FK_TARGET[base] || {}).find(([, t]) => t === embedName)?.[0];
  if (fkCol) return { table: embedName, kind: 'one', joinCol: fkCol };
  // ¿one-to-many? alguna FK de embedName apunta a `base`.
  const childFk = Object.entries(FK_TARGET[embedName] || {}).find(([, t]) => t === base)?.[0];
  if (childFk) return { table: embedName, kind: 'many', joinCol: childFk };
  throw new Error(`Embed: no se pudo resolver la relación ${base} -> ${embedName}`);
}

export function parseSelect(sel: string, base = ''): Field[] {
  const parts = splitTop(sel.replace(/\s+/g, ' ').trim());
  return parts.map((p): Field => {
    const paren = p.indexOf('(');
    if (paren === -1) return { col: p.trim() }; // columna plana o '*'
    const head = p.slice(0, paren).trim();
    const inner = p.slice(paren + 1, p.lastIndexOf(')'));
    let alias: string | null = null, fkHint: string | null = null;
    let embedName = head;
    if (head.includes(':')) {
      const [a, b] = head.split(':');
      alias = a.trim(); fkHint = b.trim();
    }
    const rel = resolveRel(base, fkHint, embedName);
    const key = alias ?? embedName;
    return { key, table: rel.table, kind: rel.kind, joinCol: rel.joinCol, fields: parseSelect(inner, rel.table) };
  });
}

let _n = 0;

function isCol(f: Field): f is { col: string } { return 'col' in f; }

// Construye una expresión jsonb que representa una fila (con o sin embeds anidados).
function jsonForFields(alias: string, fields: Field[]): string {
  const cols = fields.filter(isCol);
  const embeds = fields.filter((f): f is Extract<Field, { key: string }> => !isCol(f));
  const hasStar = cols.some((c) => c.col === '*');
  const explicit = cols.filter((c) => c.col !== '*');
  const baseObj = hasStar
    ? `to_jsonb(${alias})`
    : `jsonb_build_object(${explicit.map((c) => `'${c.col}', ${alias}.${c.col}`).join(', ')})`;
  if (embeds.length === 0) return baseObj;
  const embedObj = `jsonb_build_object(${embeds.map((e) => `'${e.key}', ${embedExpr(alias, e)}`).join(', ')})`;
  if (!hasStar && explicit.length === 0) return embedObj; // solo embeds
  return `(${baseObj} || ${embedObj})`;
}

function embedExpr(parentAlias: string, f: Extract<Field, { key: string }>): string {
  const a = `e${_n++}`;
  const inner = jsonForFields(a, f.fields);
  if (f.kind === 'one') {
    return `(SELECT ${inner} FROM ${f.table} ${a} WHERE ${a}.id = ${parentAlias}.${f.joinCol})`;
  }
  return `(SELECT coalesce(jsonb_agg(${inner}), '[]'::jsonb) FROM ${f.table} ${a} WHERE ${a}.${f.joinCol} = ${parentAlias}.id)`;
}

export function buildSelectSql(base: string, sel: string, where: string, orderLimit: string): string {
  _n = 0;
  const fields = parseSelect(sel || '*', base);
  const cols: string[] = [];
  for (const f of fields) {
    if (isCol(f)) cols.push(f.col === '*' ? 'b.*' : `b.${f.col}`);
    else cols.push(`${embedExpr('b', f)} AS "${f.key}"`);
  }
  return `SELECT ${cols.join(', ')} FROM ${base} b ${where} ${orderLimit}`.trim();
}

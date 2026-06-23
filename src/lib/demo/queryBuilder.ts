// src/lib/demo/queryBuilder.ts
// `from(table)` encadenable que traduce el subconjunto de la API de PostgREST que
// usa AGROMAR a SQL contra PGlite. Es *thenable*: resuelve a PostgrestResult.
import { getDB } from './db';
import { buildSelectSql, lit } from './postgrest';
import type { PostgrestResult } from './types';
import { emitChange } from './realtime';

type Op = '=' | '<>' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'ILIKE' | 'IS';
interface Filter { col: string; op: Op; val: unknown; isIn?: boolean; }

class QueryBuilder<T = any[]> implements PromiseLike<PostgrestResult<T>> {
  private _select = '*';
  private _filters: Filter[] = [];
  private _order = '';
  private _limit = '';
  private _action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private _payload: unknown = null;
  private _returning = false;
  private _single: false | 'one' | 'maybe' = false;
  private _count: false | 'exact' = false;
  private _head = false;
  private table: string;

  constructor(table: string) { this.table = table; }

  select(sel = '*', opts?: { count?: 'exact'; head?: boolean }) {
    if (this._action === 'select') { this._select = sel; }
    else { this._returning = true; this._select = sel; }
    if (opts?.count) this._count = opts.count;
    if (opts?.head) this._head = true;
    return this;
  }
  insert(rows: unknown) { this._action = 'insert'; this._payload = rows; return this; }
  update(obj: unknown) { this._action = 'update'; this._payload = obj; return this; }
  delete() { this._action = 'delete'; return this; }

  eq(c: string, v: unknown) { this._filters.push({ col: c, op: v === null ? 'IS' : '=', val: v }); return this; }
  neq(c: string, v: unknown) { this._filters.push({ col: c, op: '<>', val: v }); return this; }
  gt(c: string, v: unknown) { this._filters.push({ col: c, op: '>', val: v }); return this; }
  gte(c: string, v: unknown) { this._filters.push({ col: c, op: '>=', val: v }); return this; }
  lt(c: string, v: unknown) { this._filters.push({ col: c, op: '<', val: v }); return this; }
  lte(c: string, v: unknown) { this._filters.push({ col: c, op: '<=', val: v }); return this; }
  like(c: string, v: string) { this._filters.push({ col: c, op: 'LIKE', val: v }); return this; }
  ilike(c: string, v: string) { this._filters.push({ col: c, op: 'ILIKE', val: v }); return this; }
  is(c: string, v: unknown) { this._filters.push({ col: c, op: 'IS', val: v }); return this; }
  in(c: string, arr: unknown[]) { this._filters.push({ col: c, op: '=', val: arr, isIn: true }); return this; }

  order(col: string, opts?: { ascending?: boolean }) {
    const dir = opts?.ascending === false ? 'DESC' : 'ASC';
    this._order = this._order ? `${this._order}, ${col} ${dir}` : `ORDER BY ${col} ${dir}`;
    return this;
  }
  limit(n: number) { this._limit = `LIMIT ${n}`; return this; }
  // single()/maybeSingle() devuelven un objeto (no arreglo): resuelven a data: any.
  single() { this._single = 'one'; return this as unknown as QueryBuilder<any>; }
  maybeSingle() { this._single = 'maybe'; return this as unknown as QueryBuilder<any>; }

  private whereSql(forBase: boolean): string {
    if (!this._filters.length) return '';
    const pre = forBase ? 'b.' : '';
    const conds = this._filters.map((f) => {
      if (f.isIn) {
        const arr = (f.val as unknown[]).map(lit).join(', ');
        return `${pre}${f.col} IN (${arr || 'NULL'})`;
      }
      if (f.op === 'IS') return `${pre}${f.col} IS ${f.val === null ? 'NULL' : lit(f.val)}`;
      return `${pre}${f.col} ${f.op} ${lit(f.val)}`;
    });
    return 'WHERE ' + conds.join(' AND ');
  }

  private async run(): Promise<PostgrestResult<T>> {
    const db = await getDB();
    try {
      let sql = '';
      if (this._action === 'select') {
        if (this._count && this._head) {
          const r = await db.query<{ c: number }>(
            `SELECT count(*)::int AS c FROM ${this.table} b ${this.whereSql(true)}`);
          return { data: [] as unknown as T, error: null, count: r.rows[0].c };
        }
        sql = buildSelectSql(this.table, this._select, this.whereSql(true), `${this._order} ${this._limit}`);
      } else if (this._action === 'insert') {
        const rows = Array.isArray(this._payload) ? this._payload : [this._payload];
        const cols = Object.keys(rows[0] as object);
        const values = (rows as Record<string, unknown>[])
          .map((r) => `(${cols.map((c) => lit(r[c])).join(', ')})`).join(', ');
        sql = `INSERT INTO ${this.table} (${cols.join(', ')}) VALUES ${values}`;
        if (this._returning) sql += ` RETURNING ${this._select === '*' ? '*' : this._select}`;
      } else if (this._action === 'update') {
        const obj = this._payload as Record<string, unknown>;
        const sets = Object.keys(obj).map((c) => `${c} = ${lit(obj[c])}`).join(', ');
        sql = `UPDATE ${this.table} SET ${sets} ${this.whereSql(false)}`;
        if (this._returning) sql += ` RETURNING ${this._select === '*' ? '*' : this._select}`;
      } else {
        sql = `DELETE FROM ${this.table} ${this.whereSql(false)}`;
        if (this._returning) sql += ` RETURNING ${this._select === '*' ? '*' : this._select}`;
      }

      const res = await db.query<Record<string, unknown>>(sql);
      if (this._action !== 'select') emitChange(this.table);

      // Escritura sin .select(): supabase devuelve data null.
      if (this._action !== 'select' && !this._returning) {
        return { data: null, error: null, count: null };
      }

      const rows = res.rows as unknown[];
      if (this._single) {
        if (rows.length === 0) {
          if (this._single === 'maybe') return { data: null, error: null, count: null };
          return { data: null, error: { message: 'No rows found', code: 'PGRST116' }, count: null };
        }
        return { data: rows[0] as T, error: null, count: null };
      }
      return { data: rows as T, error: null, count: this._count ? rows.length : null };
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) }, count: null };
    }
  }

  then<R1 = PostgrestResult<T>, R2 = never>(
    onF?: ((v: PostgrestResult<T>) => R1 | PromiseLike<R1>) | null,
    onR?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onF, onR);
  }
}

export function from(table: string) { return new QueryBuilder(table); }

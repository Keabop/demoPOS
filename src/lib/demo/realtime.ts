// src/lib/demo/realtime.ts
// Bus mínimo de tiempo real: tras cualquier escritura emitimos un cambio global y
// los canales suscritos a 'postgres_changes' re-disparan su callback (re-fetch).
// 'broadcast'/'system' (escáner de barras, deshabilitado) se aceptan como no-op.
type Handler = () => void;
const pgHandlers = new Set<Handler>();

export function emitChange(_table: string): void { pgHandlers.forEach((h) => h()); }

class DemoChannel {
  name: string;
  private handlers: Handler[] = [];
  constructor(name: string) { this.name = name; }

  on(type: string, _filterOrCb: unknown, cb?: (payload?: any) => void) {
    if (type === 'postgres_changes' && cb) this.handlers.push(() => cb({}));
    return this; // broadcast/system: ignorados
  }

  subscribe(cb?: (status: string) => void) {
    this.handlers.forEach((h) => pgHandlers.add(h));
    cb?.('SUBSCRIBED');
    return this;
  }

  // No-op: el escáner por broadcast está deshabilitado en la demo.
  async send(_msg: unknown) { return 'ok'; }
  unsubscribe() { this._teardown(); return Promise.resolve('ok'); }
  _teardown() { this.handlers.forEach((h) => pgHandlers.delete(h)); this.handlers = []; }
}

const channels = new Map<string, DemoChannel>();

export function channel(name: string, _opts?: unknown) {
  const c = new DemoChannel(name);
  channels.set(name, c);
  return c;
}

export function removeChannel(c: DemoChannel) { c?._teardown?.(); }

// Motor de interés moratorio 2% mensual COMPUESTO (on-demand). Réplica EXACTA del
// SQL `fn_saldo_nota`: capitaliza 2% por mes vencido sobre (capital+interés), aplica
// abonos interés-primero y devoluciones como reducción de capital. Sirve de oráculo
// de pruebas y para cálculos puros en el front. Ver docs/superpowers/specs/2026-06-26-interes-moratorio-design.md
import { round2 } from './money';
import { parseLocalDate, fechaVencimiento } from './dates';

export const TASA_MORA_MENSUAL = 0.02;

export interface MovimientoNota {
  monto: number;
  fecha: Date | string;
}

export interface NotaParaInteres {
  total: number;
  fechaVenta: Date | string;
  plazoDias: number;
  pagos?: MovimientoNota[];
  devoluciones?: MovimientoNota[];
  cancelada?: boolean;
}

export interface SaldoNota {
  capital: number;
  interes: number;
  saldoTotal: number;
  mesesVencidos: number;
  diasAtraso: number;     // > 0 si vencida, <= 0 si al corriente
  fechaVenc: Date;
}

/** Suma n meses conservando fin de mes (Ene 31 + 1 mes = Feb 28), sin overflow. */
function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const ultimoDia = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), ultimoDia));
  return r;
}

function diasEntre(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

interface Evento { t: number; orden: 0 | 1 | 2; monto: number } // orden: 0 cap, 1 pago, 2 devolución

/** Saldo de una nota a crédito a una fecha de corte (réplica del SQL fn_saldo_nota). */
export function saldoNota(nota: NotaParaInteres, corte: Date | string = new Date()): SaldoNota {
  const venc = fechaVencimiento(nota.fechaVenta, nota.plazoDias);
  const cut = parseLocalDate(corte);
  const diasAtraso = diasEntre(cut, venc);

  if (nota.cancelada) {
    return { capital: 0, interes: 0, saldoTotal: 0, mesesVencidos: 0, diasAtraso, fechaVenc: venc };
  }

  // meses vencidos completos hasta el corte
  let meses = 0;
  while (addMonths(venc, meses + 1).getTime() <= cut.getTime()) meses++;

  const eventos: Evento[] = [];
  for (let k = 1; k <= meses; k++) eventos.push({ t: addMonths(venc, k).getTime(), orden: 0, monto: 0 });
  for (const p of nota.pagos ?? []) {
    const t = parseLocalDate(p.fecha).getTime();
    if (t <= cut.getTime()) eventos.push({ t, orden: 1, monto: Number(p.monto) });
  }
  for (const d of nota.devoluciones ?? []) {
    const t = parseLocalDate(d.fecha).getTime();
    if (t <= cut.getTime()) eventos.push({ t, orden: 2, monto: Number(d.monto) });
  }
  eventos.sort((a, b) => a.t - b.t || a.orden - b.orden);

  let capital = Number(nota.total);
  let interes = 0;
  for (const e of eventos) {
    if (e.orden === 0) {
      interes = round2(interes + (capital + interes) * TASA_MORA_MENSUAL);
    } else if (e.orden === 1) {
      const pagoInteres = Math.min(e.monto, interes);
      interes = round2(interes - pagoInteres);
      const resto = round2(e.monto - pagoInteres);
      capital = round2(Math.max(0, capital - resto));
    } else {
      capital = round2(Math.max(0, capital - Math.min(capital, e.monto)));
    }
  }

  return {
    capital,
    interes,
    saldoTotal: round2(capital + interes),
    mesesVencidos: meses,
    diasAtraso,
    fechaVenc: venc,
  };
}

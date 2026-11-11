// Datas são tratadas como texto ISO (AAAA-MM-DD) e como nº de dias desde 1970 (UTC),
// para que somas de dias nunca sofram com fuso horário ou horário de verão.
export const DIA_MS = 864e5;

export const dn = (iso: string): number => Math.round(Date.parse(iso + 'T00:00:00Z') / DIA_MS);
export const iso = (k: number): string => new Date(k * DIA_MS).toISOString().slice(0, 10);

export const somaDias = (data: string, dias: number): string => iso(dn(data) + dias);
export const difDias = (a: string, b: string): number => dn(a) - dn(b);

/** Data de hoje no fuso do navegador. */
export function hoje(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const br = (d: string | null | undefined): string =>
  d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—';
export const brCurto = (d: string | null | undefined): string => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—');

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const SEMANA_LONGA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const diaSemanaN = (k: number): number => new Date(k * DIA_MS).getUTCDay();
export const diaSemana = (d: string): string => SEMANA[diaSemanaN(dn(d))];
export const diaSemanaLongo = (d: string): string => SEMANA_LONGA[diaSemanaN(dn(d))];
export const segunda = (k: number): number => k - ((diaSemanaN(k) + 6) % 7);

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Data provável de colheita = dessecação + dias. */
export function dataProvavel(dataDessecacao: string | null, dias: number | null | undefined): string | null {
  if (!dataDessecacao || dias == null || !Number.isFinite(dias)) return null;
  return somaDias(dataDessecacao, Math.round(dias));
}

export const ehIso = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

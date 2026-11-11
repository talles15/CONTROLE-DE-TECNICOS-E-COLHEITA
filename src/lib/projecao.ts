// Estimativa de internalização: mesma lógica do HTML de previsão de colheita.
// Cada campo colhe no máximo `haDia` hectares por dia a partir do início da colheita.
import { dn } from './dates';
import type { Campo, Parametros } from './types';

export type Origem = 'real' | 'manual' | 'dessecacao' | 'planilha' | 'presumida';
export const ORIGENS: Record<Origem, string> = {
  real: 'colheita iniciada',
  manual: 'ajuste manual',
  dessecacao: 'dessecação',
  planilha: 'planilha',
  presumida: 'presumida',
};

export interface Unidade {
  campo: Campo;
  area: number;
  origem: Origem;
  haDia: number;
  scHa: number;
  aprov: number;
  t0: number;
  t1: number;
  /** primeiro e último dia de colheita (nº do dia) */
  ini: number;
  fim: number;
  ndias: number;
  bruto: number;
  aprovSc: number;
}
export interface ItemDia {
  u: Unidade;
  ha: number;
  bruto: number;
  aprov: number;
}
export interface DiaProj {
  k: number;
  ha: number;
  bruto: number;
  aprov: number;
  itens: ItemDia[];
  acc: number;
  pct: number;
}
export interface Projecao {
  unidades: Unidade[];
  semData: Campo[];
  dias: DiaProj[];
  total: number;
}

export const areaDe = (c: Campo, P: Parametros): number => c[P.area] || 0;

/** Sacos potenciais e aproveitados de um campo com os parâmetros (e ajustes do campo). */
export function sacosCampo(c: Campo, P: Parametros): { bruto: number; aprov: number } {
  const bruto = areaDe(c, P) * (c.ov_sc_ha ?? P.scHa);
  return { bruto, aprov: (bruto * (c.ov_aprov ?? P.aprov)) / 100 };
}

/**
 * Início da colheita, por prioridade:
 * colheita real iniciada → ajuste manual → data provável (dessecação) → planilha + deslocamento → plantio presumido + ciclo.
 */
export function inicioColheita(c: Campo, provavel: string | null | undefined, P: Parametros): { k: number; origem: Origem } | null {
  if (c.colheita_inicio) return { k: dn(c.colheita_inicio), origem: 'real' };
  if (c.ov_inicio) return { k: dn(c.ov_inicio), origem: 'manual' };
  if (provavel) return { k: dn(provavel), origem: 'dessecacao' };
  if (c.data_colheita_prevista) return { k: dn(c.data_colheita_prevista) + (P.desloc || 0), origem: 'planilha' };
  if (P.pres && c.ciclo) return { k: dn(P.pres) + c.ciclo + (P.desloc || 0), origem: 'presumida' };
  return null;
}

export function projetar(campos: Campo[], provaveis: Map<string, string | null>, P: Parametros): Projecao {
  const unidades: Unidade[] = [];
  const semData: Campo[] = [];
  const porDia = new Map<number, DiaProj>();
  for (const c of campos) {
    if (!c.ativo || !c.incluir_projecao) continue;
    const area = areaDe(c, P);
    if (!(area > 0)) continue;
    const ini = inicioColheita(c, provaveis.get(c.id), P);
    if (!ini) {
      semData.push(c);
      continue;
    }
    let haDia = Math.max(c.ov_ha_dia ?? P.haDia, 0.0001);
    const scHa = c.ov_sc_ha ?? P.scHa;
    const aprov = c.ov_aprov ?? P.aprov;
    const t0 = ini.k;
    let t1 = t0 + area / haDia;
    // colheita já encerrada: distribui a área pelos dias realmente colhidos
    if (ini.origem === 'real' && c.colheita_fim && dn(c.colheita_fim) >= t0) {
      t1 = dn(c.colheita_fim) + 1;
      haDia = area / (t1 - t0);
    }
    const u: Unidade = {
      campo: c, area, origem: ini.origem, haDia, scHa, aprov, t0, t1,
      ini: Math.floor(t0), fim: Math.ceil(t1 - 1e-9) - 1, ndias: t1 - t0,
      bruto: area * scHa, aprovSc: (area * scHa * aprov) / 100,
    };
    unidades.push(u);
    for (let k = Math.floor(t0); k < t1 - 1e-9; k++) {
      const fracao = Math.min(k + 1, t1) - Math.max(k, t0);
      if (fracao <= 1e-9) continue;
      const ha = fracao * haDia;
      const bruto = ha * scHa;
      const ap = (bruto * aprov) / 100;
      let d = porDia.get(k);
      if (!d) porDia.set(k, (d = { k, ha: 0, bruto: 0, aprov: 0, itens: [], acc: 0, pct: 0 }));
      d.ha += ha;
      d.bruto += bruto;
      d.aprov += ap;
      d.itens.push({ u, ha, bruto, aprov: ap });
    }
  }
  const ks = [...porDia.keys()].sort((a, b) => a - b);
  const dias: DiaProj[] = [];
  if (ks.length) {
    for (let k = ks[0]; k <= ks[ks.length - 1]; k++) {
      dias.push(porDia.get(k) ?? { k, ha: 0, bruto: 0, aprov: 0, itens: [], acc: 0, pct: 0 });
    }
  }
  const total = dias.reduce((s, d) => s + d.aprov, 0);
  let acc = 0;
  for (const d of dias) {
    acc += d.aprov;
    d.acc = acc;
    d.pct = total ? acc / total : 0;
  }
  return { unidades, semData, dias, total };
}

export function maxBonito(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
export function marcasY(max: number): number[] {
  const passo = maxBonito(max / 5);
  const t: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += passo) t.push(v);
  return t;
}

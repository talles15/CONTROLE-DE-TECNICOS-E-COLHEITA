// Colheita real do campo: volume lançado dia a dia, produtividade informada pelo produtor,
// aproveitamento para semente e o que ainda falta colher.
import { areaDe } from './projecao';
import type { Campo, ColheitaDia, Parametros } from './types';

export interface RealCampo {
  /** lançamentos em ordem de data */
  lancamentos: ColheitaDia[];
  /** nº de dias diferentes com lançamento */
  dias: number;
  colhidoKg: number;
  internKg: number;
  /** volume colhido e entregue na UBS, em sacos */
  colhidoSc: number;
  /** volume aprovado e internalizado na UBS, em sacos */
  internSc: number;
  /** % do volume entregue que foi aprovado na UBS */
  aprovadoDoEntreguePct: number | null;
  areaCampo: number;
  /** soma das áreas colhidas informadas nos lançamentos (null = nenhuma informada) */
  areaColhida: number | null;
  /** área usada no cálculo do potencial */
  areaBase: number;
  /** true = colheita em andamento e o potencial considera só a área já colhida */
  parcial: boolean;
  /** produtividade usada no potencial (sc/ha) e de onde ela veio */
  prodHa: number;
  prodOrigem: 'produtor' | 'estimada';
  /** o que a área poderia ter rendido = produtividade × área */
  potencialSc: number;
  /** aproveitamento para semente = internalizado ÷ potencial */
  aprovPct: number | null;
  /** potencial que não virou semente internalizada */
  naoAproveitadoSc: number;
  /** sacos internalizados por hectare */
  internScHa: number | null;
  /** área que ainda falta colher (0 quando a colheita foi encerrada) */
  areaRestante: number;
  /** true = área restante estimada pelo volume, porque nenhuma área colhida foi informada */
  restanteEstimado: boolean;
  /** volume que ainda deve ser internalizado a partir da área restante */
  scRestante: number;
}

/** volume aprovado de um lançamento: em branco = todo o volume colhido foi aprovado */
export const aprovadoKg = (l: ColheitaDia): number => l.aprovado_kg ?? l.colhido_kg;

export function agruparColheitas(colheitas: ColheitaDia[]): Map<string, ColheitaDia[]> {
  const m = new Map<string, ColheitaDia[]>();
  for (const l of colheitas) {
    if (!m.has(l.campo_id)) m.set(l.campo_id, []);
    m.get(l.campo_id)!.push(l);
  }
  return m;
}

export function realCampo(c: Campo, lanc: ColheitaDia[], P: Parametros): RealCampo {
  const kg = P.kg > 0 ? P.kg : 60;
  const lancamentos = [...lanc].sort((a, b) => a.data.localeCompare(b.data) || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const colhidoKg = lancamentos.reduce((s, l) => s + (l.colhido_kg || 0), 0);
  const internKg = lancamentos.reduce((s, l) => s + (aprovadoKg(l) || 0), 0);
  const colhidoSc = colhidoKg / kg;
  const internSc = internKg / kg;
  const comArea = lancamentos.filter((l) => l.area_ha != null && l.area_ha > 0);
  const areaColhida = comArea.length ? comArea.reduce((s, l) => s + l.area_ha!, 0) : null;
  const areaCampo = areaDe(c, P);

  // colheita encerrada → potencial sobre o campo inteiro; em andamento → sobre a área já colhida, se informada
  const parcial = !c.colheita_fim && areaColhida != null;
  const areaBase = parcial ? areaColhida! : areaCampo;
  const prodOrigem = c.prod_real_sc_ha != null ? 'produtor' : 'estimada';
  const prodHa = c.prod_real_sc_ha ?? c.ov_sc_ha ?? P.scHa;
  const potencialSc = areaBase * prodHa;
  const temVolume = lancamentos.length > 0;

  // o que ainda vem deste campo
  const esperadoHa = (prodHa * (c.ov_aprov ?? P.aprov)) / 100;
  let areaRestante = areaCampo;
  let restanteEstimado = false;
  if (!c.ativo || !c.incluir_projecao || c.colheita_fim) areaRestante = 0;
  else if (areaColhida != null) areaRestante = Math.max(0, areaCampo - areaColhida);
  else if (internSc > 0 && esperadoHa > 0) {
    areaRestante = Math.max(0, areaCampo - internSc / esperadoHa);
    restanteEstimado = true;
  }

  return {
    lancamentos,
    dias: new Set(lancamentos.map((l) => l.data)).size,
    colhidoKg, internKg, colhidoSc, internSc,
    aprovadoDoEntreguePct: colhidoKg > 0 ? (internKg / colhidoKg) * 100 : null,
    areaCampo, areaColhida, areaBase, parcial, prodHa, prodOrigem, potencialSc,
    aprovPct: temVolume && potencialSc > 0 ? (internSc / potencialSc) * 100 : null,
    naoAproveitadoSc: temVolume ? Math.max(0, potencialSc - internSc) : 0,
    internScHa: temVolume && areaBase > 0 ? internSc / areaBase : null,
    areaRestante, restanteEstimado,
    scRestante: areaRestante * esperadoHa,
  };
}

export type Unidade = 'kg' | 'sc' | 't';
export const UNIDADES: Record<Unidade, string> = { kg: 'kg', sc: 'sacos', t: 'toneladas' };

/** Converte o que foi digitado para kg (sacos usam o peso do saco do painel). */
export function paraKg(valor: number, un: Unidade, kgSaco: number): number {
  return un === 'kg' ? valor : un === 't' ? valor * 1000 : valor * (kgSaco > 0 ? kgSaco : 60);
}
export function deKg(kg: number, un: Unidade, kgSaco: number): number {
  return un === 'kg' ? kg : un === 't' ? kg / 1000 : kg / (kgSaco > 0 ? kgSaco : 60);
}

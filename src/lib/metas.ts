// Metas por cultivar: quanto de matéria-prima bruta precisa ser internalizado para chegar
// aos big bags de semente pronta planejados, e se o que ainda há para colher dá conta.
//
//   sacos de 200 mil = big bags × sacos por big bag
//   semente pronta (sc 60 kg) = sacos de 200 mil × (PMS × 0,2 kg) ÷ 60
//   meta de internalização = semente pronta ÷ rendimento do beneficiamento
//   GAP = internalizado − meta
import { semAcento } from './format';
import type { RealCampo } from './realizado';
import type { Campo, MetaCultivar, Parametros, ParametrosMetas } from './types';

export const chaveCultivar = (s: string | null | undefined): string => semAcento(s ?? '').replace(/\s+/g, ' ').trim();

export type SituacaoMeta = 'sem_meta' | 'atingida' | 'no_caminho' | 'alerta';

export interface LinhaMeta {
  chave: string;
  cultivar: string;
  meta: MetaCultivar | null;
  /** campos ativos da cultivar e a área deles */
  campos: number;
  areaTotal: number;
  pms: number;
  rend: number;
  /** semente pronta planejada */
  metaBB: number | null;
  metaSc200: number | null;
  metaSc60: number | null;
  /** true = big bags deduzidos de uma meta de internalização digitada à mão */
  bbDeduzido: boolean;
  /** meta de internalização de matéria-prima bruta (sacos) */
  metaIntern: number | null;
  metaManual: boolean;
  intern: number;
  gap: number | null;
  pct: number | null;
  /** quanto ainda falta internalizar para a meta (0 se já atingiu) */
  falta: number;
  /** o que ainda há para colher */
  camposAColher: number;
  areaDisp: number;
  scDisp: number;
  /** disponível − falta (negativo = não fecha a meta) */
  saldo: number | null;
  /** área que seria preciso colher para fechar a meta */
  areaNecessaria: number | null;
  /** internalizado + disponível, como % da meta */
  cobertura: number | null;
  situacao: SituacaoMeta;
  /** big bags: prontos, possíveis com o que já entrou e projetados com o que ainda vem */
  bbProntos: number;
  bbPossiveis: number;
  bbProjetados: number;
  pctProducao: number | null;
}

export interface ResumoMetas {
  linhas: LinhaMeta[];
  metaIntern: number;
  intern: number;
  gap: number;
  pct: number | null;
  metaBB: number;
  bbProntos: number;
  areaDisp: number;
  scDisp: number;
  alertas: LinhaMeta[];
}

/** sacos (de `kgSaco`) de semente pronta em um saco de 200 mil sementes */
export const scPorSc200 = (pms: number, kgSaco: number): number => (pms * 0.2) / (kgSaco > 0 ? kgSaco : 60);

export function metaInternDe(sc200: number, pms: number, rend: number, kgSaco: number): number {
  return rend > 0 ? (sc200 * scPorSc200(pms, kgSaco)) / (rend / 100) : 0;
}

export function resumirMetas(
  campos: Campo[],
  reais: Map<string, RealCampo>,
  metas: MetaCultivar[],
  P: Parametros,
  M: ParametrosMetas,
): ResumoMetas {
  const grupos = new Map<string, { nome: string; campos: Campo[] }>();
  for (const c of campos) {
    if (!c.ativo) continue;
    const k = chaveCultivar(c.produto);
    if (!k) continue;
    if (!grupos.has(k)) grupos.set(k, { nome: (c.produto ?? '').trim(), campos: [] });
    grupos.get(k)!.campos.push(c);
  }
  const metaPor = new Map(metas.map((m) => [chaveCultivar(m.cultivar), m]));
  const chaves = new Set([...grupos.keys(), ...metaPor.keys()]);
  const porBB = M.sc200PorBB > 0 ? M.sc200PorBB : 25;

  const linhas: LinhaMeta[] = [];
  for (const chave of chaves) {
    const g = grupos.get(chave);
    const meta = metaPor.get(chave) ?? null;
    const pms = meta?.pms_g ?? M.pms;
    const rend = meta?.rend_ubs ?? M.rendUbs;
    const fator = scPorSc200(pms, P.kg);

    let intern = 0, areaTotal = 0, areaDisp = 0, scDisp = 0, camposAColher = 0;
    for (const c of g?.campos ?? []) {
      const r = reais.get(c.id);
      if (!r) continue;
      intern += r.internSc;
      areaTotal += r.areaCampo;
      if (r.areaRestante > 0.005) {
        camposAColher++;
        areaDisp += r.areaRestante;
        scDisp += r.scRestante;
      }
    }

    const metaManual = meta?.meta_intern_sc != null;
    let metaSc200 = meta?.meta_sc200 ?? null;
    let metaIntern: number | null = null;
    if (metaManual) metaIntern = meta!.meta_intern_sc!;
    else if (metaSc200 != null) metaIntern = metaInternDe(metaSc200, pms, rend, P.kg);
    // só a meta de internalização foi digitada → deduz a semente pronta equivalente
    const bbDeduzido = metaManual && metaSc200 == null;
    if (bbDeduzido && fator > 0) metaSc200 = (metaIntern! * rend) / 100 / fator;
    const metaSc60 = metaSc200 != null ? metaSc200 * fator : null;
    const metaBB = metaSc200 != null ? metaSc200 / porBB : null;

    const temMeta = metaIntern != null && metaIntern > 0;
    const falta = temMeta ? Math.max(0, metaIntern! - intern) : 0;
    const saldo = temMeta ? scDisp - falta : null;
    const mediaHa = areaDisp > 0 ? scDisp / areaDisp : (P.scHa * P.aprov) / 100;
    const paraBB = (sc: number) => (fator > 0 ? ((sc * rend) / 100 / fator) / porBB : 0);
    const bbProntos = (meta?.bb_ubs ?? 0) + (meta?.bb_tolling ?? 0);

    let situacao: SituacaoMeta = 'sem_meta';
    if (temMeta) situacao = falta <= 0.5 ? 'atingida' : scDisp + 0.5 >= falta ? 'no_caminho' : 'alerta';

    linhas.push({
      chave, cultivar: g?.nome || meta?.cultivar || chave, meta,
      campos: g?.campos.length ?? 0, areaTotal, pms, rend,
      metaBB, metaSc200, metaSc60, bbDeduzido, metaIntern, metaManual,
      intern,
      gap: temMeta ? intern - metaIntern! : null,
      pct: temMeta ? (intern / metaIntern!) * 100 : null,
      falta, camposAColher, areaDisp, scDisp, saldo,
      areaNecessaria: temMeta && falta > 0 && mediaHa > 0 ? falta / mediaHa : temMeta ? 0 : null,
      cobertura: temMeta ? ((intern + scDisp) / metaIntern!) * 100 : null,
      situacao,
      bbProntos, bbPossiveis: paraBB(intern), bbProjetados: paraBB(intern + scDisp),
      pctProducao: metaBB != null && metaBB > 0 ? (bbProntos / metaBB) * 100 : null,
    });
  }
  // maior atingimento primeiro; cultivares sem meta vão para o fim
  linhas.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.cultivar.localeCompare(b.cultivar, 'pt', { numeric: true }));

  const soma = (f: (l: LinhaMeta) => number) => linhas.reduce((s, l) => s + f(l), 0);
  const metaIntern = soma((l) => l.metaIntern ?? 0);
  const intern = soma((l) => l.intern);
  return {
    linhas, metaIntern, intern,
    gap: intern - metaIntern,
    pct: metaIntern > 0 ? (intern / metaIntern) * 100 : null,
    metaBB: soma((l) => l.metaBB ?? 0),
    bbProntos: soma((l) => l.bbProntos),
    areaDisp: soma((l) => l.areaDisp),
    scDisp: soma((l) => l.scDisp),
    alertas: linhas.filter((l) => l.situacao === 'alerta').sort((a, b) => (a.saldo ?? 0) - (b.saldo ?? 0)),
  };
}

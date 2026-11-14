// Ranking de cooperados: quem mais contribuiu com a produção e quanto do potencial de cada um virou semente.
//
//   potencial do campo = área × sc/ha × aproveitamento de campo, os dois da aba Internalização (ou o ajuste do campo):
//                        é o que o campo deveria internalizar, então entregar o previsto dá 100%
//   aproveitamento     = aprovado e internalizado ÷ potencial dos campos já colhidos, em colheita ou descartados
//
// A produtividade informada pelo produtor não entra aqui: ela é só informativa e fica na ficha do campo.
import { br } from './dates';
import { semAcento } from './format';
import type { RealCampo } from './realizado';
import { SITUACOES, type Resumo, type Situacao } from './status';
import { DESCARTES, motivoDescarte, type Campo } from './types';

export const chaveCooperado = (s: string | null | undefined): string => semAcento(s ?? '').replace(/\s+/g, ' ').trim();

export interface CampoRank {
  campo: Campo;
  real: RealCampo;
  situacao: Situacao;
  /** potencial do campo inteiro */
  potencialSc: number;
  /** parte do potencial que já entra na conta do aproveitamento (0 = campo ainda por colher) */
  potContaSc: number;
  /** true = colheita em andamento: o potencial da conta ainda pode mudar */
  emAndamento: boolean;
  colhidoSc: number;
  internSc: number;
  aprovPct: number | null;
}

export interface CooperadoRank {
  chave: string;
  nome: string;
  /** posição pelo volume aprovado e internalizado (null = ainda sem entrega) */
  posicao: number | null;
  campos: CampoRank[];
  area: number;
  /** campos colhidos, em colheita (com volume) e descartados */
  nColhidos: number;
  nEmColheita: number;
  nDescartados: number;
  nAColher: number;
  potencialSc: number;
  potContaSc: number;
  colhidoSc: number;
  internSc: number;
  aprovPct: number | null;
  /** % do total internalizado por todos os cooperados */
  participacao: number;
  areaDescartada: number;
  scDescartado: number;
}

export interface Ranking {
  cooperados: CooperadoRank[];
  colhidoSc: number;
  internSc: number;
  potencialSc: number;
  potContaSc: number;
  aprovPct: number | null;
  areaDescartada: number;
  scDescartado: number;
  comEntrega: number;
  /** descartes por motivo, do maior para o menor volume */
  motivos: { motivo: string; campos: number; area: number; sc: number }[];
}

export function campoRank(c: Campo, real: RealCampo, situacao: Situacao): CampoRank {
  const temVolume = real.lancamentos.length > 0;
  const fechado = !!c.colheita_fim || !!c.descarte;
  // encerrado → campo inteiro; em colheita → só a área já colhida, se lançada; ainda por colher → fora da conta
  let potContaSc = 0;
  if (fechado) potContaSc = real.previstoSc;
  else if (temVolume) potContaSc = real.areaColhida != null && real.areaCampo > 0 ? (real.previstoSc * real.areaColhida) / real.areaCampo : real.previstoSc;
  return {
    campo: c, real, situacao,
    potencialSc: real.previstoSc, potContaSc,
    emAndamento: !fechado && temVolume,
    colhidoSc: real.colhidoSc, internSc: real.internSc,
    aprovPct: potContaSc > 0 ? (real.internSc / potContaSc) * 100 : null,
  };
}

export function rankear(campos: Campo[], reais: Map<string, RealCampo>, resumos: Map<string, Resumo>): Ranking {
  const grupos = new Map<string, CooperadoRank>();
  const motivos = new Map<string, { motivo: string; campos: number; area: number; sc: number }>();
  for (const c of campos) {
    const real = reais.get(c.id);
    const resumo = resumos.get(c.id);
    if (!c.ativo || !real || !resumo) continue;
    const chave = chaveCooperado(c.cliente) || '(sem cliente)';
    let g = grupos.get(chave);
    if (!g) {
      grupos.set(chave, (g = {
        chave, nome: (c.cliente ?? '').trim() || '(sem cliente)', posicao: null, campos: [], area: 0,
        nColhidos: 0, nEmColheita: 0, nDescartados: 0, nAColher: 0,
        potencialSc: 0, potContaSc: 0, colhidoSc: 0, internSc: 0, aprovPct: null, participacao: 0, areaDescartada: 0, scDescartado: 0,
      }));
    }
    const x = campoRank(c, real, resumo.situacao);
    g.campos.push(x);
    g.area += real.areaCampo;
    g.potencialSc += x.potencialSc;
    g.potContaSc += x.potContaSc;
    g.colhidoSc += x.colhidoSc;
    g.internSc += x.internSc;
    g.areaDescartada += real.areaDescartada;
    g.scDescartado += real.scDescartado;
    if (c.descarte === 'total') g.nDescartados++;
    else if (c.colheita_fim) g.nColhidos++;
    else if (x.emAndamento) g.nEmColheita++;
    else g.nAColher++;
    if (c.descarte) {
      const m = motivoDescarte(c.descarte_motivo) || '(sem motivo)';
      const y = motivos.get(m) ?? { motivo: m, campos: 0, area: 0, sc: 0 };
      y.campos++;
      y.area += real.areaDescartada;
      y.sc += real.scDescartado;
      motivos.set(m, y);
    }
  }
  const cooperados = [...grupos.values()];
  const soma = (f: (g: CooperadoRank) => number) => cooperados.reduce((s, g) => s + f(g), 0);
  const internSc = soma((g) => g.internSc);
  const potContaSc = soma((g) => g.potContaSc);
  for (const g of cooperados) {
    g.aprovPct = g.potContaSc > 0 ? (g.internSc / g.potContaSc) * 100 : null;
    g.participacao = internSc > 0 ? (g.internSc / internSc) * 100 : 0;
    g.campos.sort((a, b) => b.internSc - a.internSc || a.campo.num_campo.localeCompare(b.campo.num_campo, 'pt', { numeric: true }));
  }
  // quem mais internalizou primeiro; empate pelo volume entregue e depois pelo nome
  cooperados.sort((a, b) => b.internSc - a.internSc || b.colhidoSc - a.colhidoSc || a.nome.localeCompare(b.nome, 'pt'));
  cooperados.forEach((g, i) => (g.posicao = g.internSc > 0 || g.colhidoSc > 0 ? i + 1 : null));
  return {
    cooperados, internSc, potContaSc,
    colhidoSc: soma((g) => g.colhidoSc),
    potencialSc: soma((g) => g.potencialSc),
    aprovPct: potContaSc > 0 ? (internSc / potContaSc) * 100 : null,
    areaDescartada: soma((g) => g.areaDescartada),
    scDescartado: soma((g) => g.scDescartado),
    comEntrega: cooperados.filter((g) => g.posicao != null).length,
    motivos: [...motivos.values()].sort((a, b) => b.sc - a.sc || b.area - a.area),
  };
}

type Celula = string | number | null;

/** Relatório de colheita e descartes: uma linha por campo, com datas, motivo e volumes. */
export function relatorioColheita(itens: CampoRank[]): Celula[][] {
  const r = (v: number | null, casas = 0) => (v == null ? null : +v.toFixed(casas));
  const linhas: Celula[][] = [[
    'Cooperado', 'Campo', 'Categoria a colher', 'Fazenda', 'Cidade', 'UF', 'Cultivar', 'Área (ha)', 'Situação',
    'Início da colheita', 'Fim da colheita', 'Descartado direto (sem colher)', 'Tipo de descarte', 'Motivo do descarte', 'Data do descarte', 'Observações',
    'Potencial (sc)', 'Colhido e entregue (sc)', 'Aprovado e internalizado (sc)', 'Aproveitamento (%)',
    'Área descartada (ha)', 'Volume descartado (sc)', 'Como o descarte foi calculado',
  ]];
  for (const x of itens) {
    const c = x.campo;
    const como = !c.descarte ? '' : c.descarte === 'total' ? 'campo inteiro' : x.real.descarteEstimado ? 'projetado pelo volume internalizado' : 'área do campo − área colhida lançada';
    linhas.push([
      c.cliente, c.num_campo, c.categoria_colher, c.propriedade, c.cidade, c.uf, c.produto, r(x.real.areaCampo, 1), SITUACOES[x.situacao].rotulo,
      c.colheita_inicio ? br(c.colheita_inicio) : null, c.colheita_fim ? br(c.colheita_fim) : null,
      c.descarte === 'total' ? 'Sim' : 'Não', c.descarte ? DESCARTES[c.descarte] : null, motivoDescarte(c.descarte_motivo) || null,
      c.descarte_data ? br(c.descarte_data) : null, c.encerramento_obs,
      r(x.potencialSc), x.real.lancamentos.length ? r(x.colhidoSc) : null, x.real.lancamentos.length ? r(x.internSc) : null, r(x.aprovPct, 1),
      c.descarte ? r(x.real.areaDescartada, 1) : null, c.descarte ? r(x.real.scDescartado) : null, como || null,
    ]);
  }
  return linhas;
}

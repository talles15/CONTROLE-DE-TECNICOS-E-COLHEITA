import { difDias } from './dates';
import type { Campo, Dessecacao, Programacao, Tecnico } from './types';

export type Situacao = 'plantado' | 'dessecado' | 'programada' | 'em_colheita' | 'colhido' | 'descartado';

export const SITUACOES: Record<Situacao, { rotulo: string; cor: string }> = {
  plantado: { rotulo: 'Plantado', cor: 'var(--st-plantado)' },
  dessecado: { rotulo: 'Dessecado', cor: 'var(--st-dessecado)' },
  programada: { rotulo: 'Colheita programada', cor: 'var(--st-programada)' },
  em_colheita: { rotulo: 'Em colheita', cor: 'var(--st-colheita)' },
  colhido: { rotulo: 'Colhido', cor: 'var(--st-colhido)' },
  descartado: { rotulo: 'Descartado', cor: 'var(--st-descartado)' },
};
export const ORDEM_SITUACAO: Situacao[] = ['plantado', 'dessecado', 'programada', 'em_colheita', 'colhido', 'descartado'];

/** Campo que não tem mais nada a colher: colheita finalizada ou descartado sem colher. */
export const encerrado = (c: Campo): boolean => !!c.colheita_fim || c.descarte === 'total';

export interface Resumo {
  situacao: Situacao;
  dessecacoes: Dessecacao[];
  /** primeira data provável de colheita entre as dessecações */
  provavel: string | null;
  ultimaDessecacao: string | null;
  areaDessecada: number;
}

export function resumoCampo(campo: Campo, dess: Dessecacao[], hoje: string): Resumo {
  const ordenadas = [...dess].sort((a, b) => a.data.localeCompare(b.data));
  const provaveis = ordenadas.map((d) => d.data_provavel_colheita).filter((d): d is string => !!d).sort();
  const provavel = provaveis[0] ?? null;
  let situacao: Situacao = 'plantado';
  if (campo.descarte === 'total') situacao = 'descartado';
  else if (campo.colheita_fim) situacao = 'colhido';
  else if (campo.colheita_inicio && campo.colheita_inicio <= hoje) situacao = 'em_colheita';
  else if (campo.colheita_inicio || provavel) situacao = 'programada';
  else if (ordenadas.length) situacao = 'dessecado';
  return {
    situacao,
    dessecacoes: ordenadas,
    provavel,
    ultimaDessecacao: ordenadas.length ? ordenadas[ordenadas.length - 1].data : null,
    areaDessecada: ordenadas.reduce((s, d) => s + (d.area_ha ?? 0), 0),
  };
}

export type TipoAlerta = 'atrasado' | 'hoje' | 'vespera' | 'proximos';
export interface Alerta {
  tipo: TipoAlerta;
  campo: Campo;
  dessecacao: Dessecacao;
  provavel: string;
  /** dias que faltam para a colheita provável (negativo = atrasado) */
  faltam: number;
  /** técnicos já programados para o campo entre hoje e a data provável */
  programados: { tecnico: Tecnico; prog: Programacao }[];
}

/**
 * Avisos de colheita provável (dessecação + dias).
 *  - vespera: faltam de 1 a `avisoDias` dias → encaminhar alguém para a pré-colheita;
 *  - hoje: a colheita provável é hoje;
 *  - atrasado: a data passou e a colheita ainda não foi iniciada;
 *  - proximos: demais campos com colheita provável em até 7 dias.
 */
export function gerarAlertas(
  campos: Campo[],
  dessecacoes: Dessecacao[],
  programacoes: Programacao[],
  tecnicos: Tecnico[],
  hoje: string,
  avisoDias = 1,
): Alerta[] {
  const porId = new Map(campos.map((c) => [c.id, c]));
  const tec = new Map(tecnicos.map((t) => [t.id, t]));
  const out: Alerta[] = [];
  for (const d of dessecacoes) {
    const campo = porId.get(d.campo_id);
    if (!campo || !campo.ativo || encerrado(campo) || !d.data_provavel_colheita) continue;
    const faltam = difDias(d.data_provavel_colheita, hoje);
    let tipo: TipoAlerta | null = null;
    if (faltam < 0) tipo = campo.colheita_inicio ? null : 'atrasado';
    else if (faltam === 0) tipo = campo.colheita_inicio && campo.colheita_inicio < hoje ? null : 'hoje';
    else if (faltam <= Math.max(1, avisoDias)) tipo = 'vespera';
    else if (faltam <= 7) tipo = 'proximos';
    if (!tipo) continue;
    const limite = faltam < 0 ? hoje : d.data_provavel_colheita;
    const programados = programacoes
      .filter((p) => p.campo_id === campo.id && p.status !== 'cancelado' && p.data >= hoje && p.data <= limite)
      .map((p) => ({ tecnico: tec.get(p.tecnico_id)!, prog: p }))
      .filter((x) => x.tecnico);
    out.push({ tipo, campo, dessecacao: d, provavel: d.data_provavel_colheita, faltam, programados });
  }
  const ordem: TipoAlerta[] = ['atrasado', 'hoje', 'vespera', 'proximos'];
  return out.sort(
    (a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo) || a.faltam - b.faltam || a.campo.num_campo.localeCompare(b.campo.num_campo, 'pt', { numeric: true }),
  );
}

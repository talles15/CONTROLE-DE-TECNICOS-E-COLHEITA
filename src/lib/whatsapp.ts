import { br, diaSemanaLongo } from './dates';
import { n1 } from './format';
import type { Resumo } from './status';
import { ATIVIDADES, type Campo, type Programacao, type Tecnico } from './types';

export interface ItemProg {
  prog: Programacao;
  campo: Campo;
  resumo?: Resumo;
}

export const linkMapa = (c: Campo): string | null =>
  c.latitude != null && c.longitude != null
    ? `https://www.google.com/maps?q=${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`
    : null;

const area = (v: number) => n1(v).replace(/,0$/, '');

function blocoCampo(i: number, it: ItemProg): string {
  const c = it.campo;
  const l: string[] = [];
  l.push(`*${i}) Campo ${c.num_campo}* — ${ATIVIDADES[it.prog.atividade].longo}`);
  if (c.cliente) l.push(`Cliente: ${c.cliente}`);
  const local = [c.propriedade, [c.cidade, c.uf].filter(Boolean).join('/')].filter(Boolean).join(' — ');
  if (local) l.push(`Fazenda: ${local}`);
  if (c.talhao) l.push(`Talhão: ${c.talhao}`);
  const cult = [c.produto, c.categoria_colher ? `cat. ${c.categoria_colher}` : null].filter(Boolean).join(' · ');
  if (cult) l.push(`Cultivar: ${cult}`);
  if (c.area_mapa > 0) l.push(`Área: ${area(c.area_mapa)} ha`);
  const d = it.resumo?.dessecacoes.at(-1);
  if (d) {
    let s = `Dessecado em ${br(d.data)}`;
    if (d.area_ha) s += ` (${area(d.area_ha)} ha)`;
    if (d.data_provavel_colheita) s += ` · colheita provável ${br(d.data_provavel_colheita)}`;
    l.push(s);
  }
  if (it.prog.status === 'realizado') l.push('Situação: CONCLUÍDO ✅');
  if (it.prog.observacoes) l.push(`Obs.: ${it.prog.observacoes}`);
  const mapa = linkMapa(c);
  if (mapa) l.push(`Mapa: ${mapa}`);
  return l.join('\n');
}

const ordenar = (itens: ItemProg[]): ItemProg[] =>
  [...itens].sort((a, b) => a.campo.num_campo.localeCompare(b.campo.num_campo, 'pt', { numeric: true }));

/** Texto da programação de um técnico em um dia, pronto para colar no WhatsApp. */
export function textoTecnico(data: string, tecnico: Tecnico, itens: ItemProg[], posicaoAs?: string): string {
  const ativos = ordenar(itens.filter((i) => i.prog.status !== 'cancelado'));
  const cab = [`*PROGRAMAÇÃO DE COLHEITA*`, `${diaSemanaLongo(data)}, ${br(data)}`, `Técnico: ${tecnico.nome}`];
  // em reenvios ao longo do dia, a hora deixa claro qual é a versão mais recente
  if (posicaoAs) cab.push(`Atualizada às ${posicaoAs}`);
  if (!ativos.length) return [...cab, '', 'Sem campos programados para este dia.'].join('\n');
  const corpo = ativos.map((it, i) => blocoCampo(i + 1, it)).join('\n\n');
  return [...cab, '', corpo, '', `Total: ${ativos.length} campo(s).`].join('\n');
}

/** Texto geral do dia, com todos os técnicos. */
export function textoGeral(data: string, grupos: { tecnico: Tecnico; itens: ItemProg[] }[], posicaoAs?: string): string {
  const cab = [`*PROGRAMAÇÃO DE COLHEITA — EQUIPE*`, `${diaSemanaLongo(data)}, ${br(data)}`];
  if (posicaoAs) cab.push(`Atualizada às ${posicaoAs}`);
  const comItens = grupos
    .map((g) => ({ ...g, itens: ordenar(g.itens.filter((i) => i.prog.status !== 'cancelado')) }))
    .filter((g) => g.itens.length);
  if (!comItens.length) return [...cab, '', 'Sem campos programados para este dia.'].join('\n');
  const blocos = comItens.map((g) => {
    const linhas = g.itens.map((it) => {
      const c = it.campo;
      const local = [c.propriedade, c.cidade].filter(Boolean).join(' — ');
      const obs = it.prog.observacoes ? ` (${it.prog.observacoes})` : '';
      const feito = it.prog.status === 'realizado' ? ' ✅' : '';
      return `• ${c.num_campo} — ${ATIVIDADES[it.prog.atividade].curto}${local ? ` — ${local}` : ''}${obs}${feito}`;
    });
    return [`*${g.tecnico.nome}*`, ...linhas].join('\n');
  });
  const total = comItens.reduce((s, g) => s + g.itens.length, 0);
  return [...cab, '', blocos.join('\n\n'), '', `Total: ${total} atividade(s), ${comItens.length} técnico(s).`].join('\n');
}

/** Só os dígitos do telefone, com DDI 55 quando faltar. Retorna null se inválido. */
export function telefoneWhats(tel: string | null | undefined): string | null {
  const d = (tel ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) return '55' + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

export function linkWhats(tel: string | null | undefined, texto: string): string | null {
  const n = telefoneWhats(tel);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null;
}

import { describe, expect, it } from 'vitest';
import { dataProvavel, difDias, dn, iso, somaDias } from './dates';
import { faixaDe, haversine, posicoes, rotulosFaixas, volumePorFaixa } from './geo';
import { chaveCultivar, metaInternDe, resumirMetas } from './metas';
import { inicioColheita, projetar, sacosCampo } from './projecao';
import { agruparColheitas, paraKg, realCampo } from './realizado';
import { rankear, relatorioColheita } from './ranking';
import { encerrado, gerarAlertas, resumoCampo } from './status';
import { DemoStore, MIGRACAO_0002, MIGRACAO_0003, SEM_TABELAS, SupabaseStore } from './store';
import {
  CONFIG_PADRAO, CONTROLE_PADRAO,
  type Campo, type ColheitaDia, type Dados, type Dessecacao, type MetaCultivar, type Programacao, type Tecnico,
} from './types';
import { linkWhats, telefoneWhats, textoGeral, textoTecnico } from './whatsapp';

const P = CONFIG_PADRAO.params;

function campo(p: Partial<Campo> = {}): Campo {
  return {
    ...CONTROLE_PADRAO,
    id: 'c1', chave: 'T01|S1', num_campo: 'T01', cliente: 'Cliente Teste', propriedade: 'Fazenda Teste', cidade: 'RIO VERDE', uf: 'GO',
    produto: 'CULTIVAR T', obtentor: 'OBT', biotec: 'I2X', peneira: 'P1', categoria_plantada: 'C2', categoria_colher: 'S1',
    tipo_contrato: 'Cooperado', vendedor: null, uso_semente: null, proprio_terceiro: 'Próprio', acao: 'INSCRITO', autorizacao: null,
    contrato: null, talhao: 'T.1', data_plantio: '2026-09-20', ciclo: 110, data_colheita_prevista: '2027-01-08', data_floracao: null,
    area_mapa: 156, area_projetada: 156, area_real: 150, expectativa_sc: 9360, toneladas_mapa: 748.8,
    latitude: -17.4, longitude: -51.0, linhas: [],
    ...p,
  };
}
const dess = (p: Partial<Dessecacao> = {}): Dessecacao => {
  const b = { id: 'd1', campo_id: 'c1', data: '2026-11-11', area_ha: null, dias_para_colheita: 5 as number | null, observacoes: null, ...p };
  return { ...b, data_provavel_colheita: p.data_provavel_colheita ?? dataProvavel(b.data, b.dias_para_colheita) };
};
const tec: Tecnico = { id: 't1', nome: 'Técnico Teste', telefone: '(64) 99999-0001', cidade_base: null, funcao: null, cor: '#000', ativo: true, observacoes: null };
const prog = (p: Partial<Programacao> = {}): Programacao => ({
  id: 'p1', data: '2026-11-15', tecnico_id: 't1', campo_id: 'c1', atividade: 'coleta_pre', status: 'planejado', observacoes: null, ...p,
});

describe('datas', () => {
  it('soma os dias à data da dessecação (exemplo do pedido: 11/11/2026 + 5)', () => {
    expect(dataProvavel('2026-11-11', 5)).toBe('2026-11-16');
  });
  it('atravessa mês, ano e fevereiro sem erro de fuso', () => {
    expect(dataProvavel('2026-11-28', 5)).toBe('2026-12-03');
    expect(dataProvavel('2026-12-29', 7)).toBe('2027-01-05');
    expect(somaDias('2027-02-26', 3)).toBe('2027-03-01');
    expect(somaDias('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('sem dias informados não há data provável', () => {
    expect(dataProvavel('2026-11-11', null)).toBeNull();
    expect(dataProvavel(null, 5)).toBeNull();
  });
  it('converte ida e volta', () => {
    expect(iso(dn('2027-01-08'))).toBe('2027-01-08');
    expect(difDias('2026-11-16', '2026-11-11')).toBe(5);
  });
});

describe('situação e alertas', () => {
  it('classifica o campo pela ordem plantado → dessecado → programada → em colheita → colhido', () => {
    const hoje = '2026-11-12';
    expect(resumoCampo(campo(), [], hoje).situacao).toBe('plantado');
    expect(resumoCampo(campo(), [dess({ dias_para_colheita: null })], hoje).situacao).toBe('dessecado');
    const r = resumoCampo(campo(), [dess()], hoje);
    expect(r.situacao).toBe('programada');
    expect(r.provavel).toBe('2026-11-16');
    expect(resumoCampo(campo({ colheita_inicio: '2026-11-12' }), [dess()], hoje).situacao).toBe('em_colheita');
    expect(resumoCampo(campo({ colheita_inicio: '2026-11-12', colheita_fim: '2026-11-13' }), [dess()], '2026-11-14').situacao).toBe('colhido');
  });
  it('avisa na véspera da colheita provável', () => {
    const al = (hoje: string, c = campo(), ps: Programacao[] = []) => gerarAlertas([c], [dess()], ps, [tec], hoje, 1);
    expect(al('2026-11-11')[0].tipo).toBe('proximos');
    expect(al('2026-11-14')[0].tipo).toBe('proximos');
    const v = al('2026-11-15');
    expect(v).toHaveLength(1);
    expect(v[0].tipo).toBe('vespera');
    expect(v[0].faltam).toBe(1);
    expect(al('2026-11-16')[0].tipo).toBe('hoje');
    expect(al('2026-11-18')[0].tipo).toBe('atrasado');
    expect(al('2026-11-08')).toHaveLength(0); // ainda faltam mais de 7 dias
  });
  it('some quando a colheita começa ou termina, e mostra quem já está programado', () => {
    expect(gerarAlertas([campo({ colheita_inicio: '2026-11-16' })], [dess()], [], [tec], '2026-11-18')).toHaveLength(0);
    expect(gerarAlertas([campo({ colheita_inicio: '2026-11-10', colheita_fim: '2026-11-12' })], [dess()], [], [tec], '2026-11-15')).toHaveLength(0);
    const a = gerarAlertas([campo()], [dess()], [prog()], [tec], '2026-11-15');
    expect(a[0].programados.map((x) => x.tecnico.nome)).toEqual(['Técnico Teste']);
  });
  it('respeita o nº de dias de antecedência configurado', () => {
    expect(gerarAlertas([campo()], [dess()], [], [tec], '2026-11-14', 2)[0].tipo).toBe('vespera');
  });
});

describe('texto do WhatsApp', () => {
  const c = campo();
  const r = resumoCampo(c, [dess({ area_ha: 100 })], '2026-11-15');
  it('monta a mensagem do técnico com campo, local, atividade, dessecação e mapa', () => {
    const t = textoTecnico('2026-11-15', tec, [{ prog: prog({ observacoes: 'Chegar cedo' }), campo: c, resumo: r }]);
    expect(t).toContain('domingo, 15/11/2026');
    expect(t).toContain('Técnico: Técnico Teste');
    expect(t).toContain('*1) Campo T01* — PASSAR PEGANDO PRÉ-COLHEITA');
    expect(t).toContain('Fazenda: Fazenda Teste — RIO VERDE/GO');
    expect(t).toContain('Área: 156 ha');
    expect(t).toContain('Dessecado em 11/11/2026 (100 ha) · colheita provável 16/11/2026');
    expect(t).toContain('Obs.: Chegar cedo');
    expect(t).toContain('https://www.google.com/maps?q=-17.400000,-51.000000');
    expect(t).not.toMatch(/cpf|cnpj|inscri/i);
  });
  it('ignora cancelados e avisa quando não há campos', () => {
    const t = textoTecnico('2026-11-15', tec, [{ prog: prog({ status: 'cancelado' }), campo: c }]);
    expect(t).toContain('Sem campos programados');
  });
  it('gera o texto geral por técnico', () => {
    const t = textoGeral('2026-11-15', [{ tecnico: tec, itens: [{ prog: prog({ atividade: 'colheita_pre' }), campo: c }] }]);
    expect(t).toContain('*Técnico Teste*');
    expect(t).toContain('• T01 — Colher + retirar pré-colheita — Fazenda Teste — RIO VERDE');
    expect(t).toContain('Total: 1 atividade(s), 1 técnico(s).');
  });
  it('em reenvios ao longo do dia mostra a hora e o que já foi concluído', () => {
    const itens = [{ prog: prog({ status: 'realizado' }), campo: c }];
    const t = textoTecnico('2026-11-15', tec, itens, '14:30');
    expect(t).toContain('Atualizada às 14:30');
    expect(t).toContain('Situação: CONCLUÍDO');
    expect(textoTecnico('2026-11-15', tec, itens)).not.toContain('Atualizada');
    const g = textoGeral('2026-11-15', [{ tecnico: tec, itens }], '14:30');
    expect(g).toContain('Atualizada às 14:30');
    expect(g).toMatch(/• T01 .* ✅/);
  });
  it('normaliza o telefone para o link do WhatsApp', () => {
    expect(telefoneWhats('(64) 99999-0001')).toBe('5564999990001');
    expect(telefoneWhats('+55 64 3621-0000')).toBe('556436210000');
    expect(telefoneWhats('99999-0001')).toBeNull();
    expect(linkWhats('64999990001', 'oi & tchau')).toBe('https://wa.me/5564999990001?text=oi%20%26%20tchau');
  });
});

describe('distâncias e faixas', () => {
  const ubs = CONFIG_PADRAO.ubs;
  it('calcula a distância em linha reta', () => {
    expect(haversine(ubs.lat, ubs.lng, ubs.lat, ubs.lng)).toBe(0);
    // 1 grau de latitude ≈ 111,2 km
    expect(haversine(ubs.lat, ubs.lng, ubs.lat - 1, ubs.lng)).toBeCloseTo(111.19, 1);
    // Rio Verde (sede) fica a ~79 km da UBS de referência
    expect(haversine(ubs.lat, ubs.lng, -17.7979, -50.9278)).toBeGreaterThan(70);
    expect(haversine(ubs.lat, ubs.lng, -17.7979, -50.9278)).toBeLessThan(90);
  });
  it('classifica nas faixas 10, 20, 50, 100, 200, 300 km', () => {
    const f = CONFIG_PADRAO.faixas;
    expect([0, 10, 10.01, 20, 49.9, 100, 150, 300, 300.1].map((d) => faixaDe(d, f))).toEqual([0, 0, 1, 1, 2, 3, 4, 5, 6]);
    expect(rotulosFaixas(f, false)).toEqual(['até 10 km', '10–20 km', '20–50 km', '50–100 km', '100–200 km', '200–300 km', 'acima de 300 km']);
    expect(rotulosFaixas(f, true)[2]).toBe('até 50 km');
  });
  it('soma o volume por cultivar e faixa, com visão acumulada', () => {
    const itens = [
      { grupo: 'A', faixa: 0, valor: 100 }, { grupo: 'A', faixa: 2, valor: 50 }, { grupo: 'B', faixa: 2, valor: 30 },
      { grupo: 'B', faixa: null, valor: 20 }, { grupo: 'A', faixa: 6, valor: 5 },
    ];
    const t = volumePorFaixa(itens, 6, false);
    expect(t.linhas.map((l) => l.grupo)).toEqual(['A', 'B']);
    expect(t.linhas[0].faixas).toEqual([100, 0, 50, 0, 0, 0, 5]);
    expect(t.linhas[1].semCoord).toBe(20);
    expect(t.total.faixas).toEqual([100, 0, 80, 0, 0, 0, 5]);
    expect(t.total.total).toBe(205);
    const acc = volumePorFaixa(itens, 6, true);
    expect(acc.total.faixas).toEqual([100, 100, 180, 180, 180, 180, 185]);
  });
  it('só aproxima campos sem coordenada quando pedido', () => {
    const cs = [campo({ id: 'a', latitude: -17, longitude: -51 }), campo({ id: 'b', latitude: -18, longitude: -52 }), campo({ id: 'c', latitude: null, longitude: null })];
    expect(posicoes(cs, false).has('c')).toBe(false);
    expect(posicoes(cs, true).get('c')).toEqual({ lat: -17.5, lng: -51.5, aprox: true });
  });
});

describe('projeção de internalização', () => {
  const prov = new Map<string, string | null>();
  it('colhe no máximo a capacidade diária: 156 ha a 120 ha/dia = 120 + 36', () => {
    const r = projetar([campo()], prov, P);
    expect(r.dias.map((d) => [iso(d.k), Math.round(d.ha)])).toEqual([['2027-01-08', 120], ['2027-01-09', 36]]);
    expect(r.total).toBeCloseTo(156 * 65 * 0.7, 6);
    expect(r.dias[1].pct).toBeCloseTo(1, 9);
    expect(sacosCampo(campo(), P).aprov).toBeCloseTo(7098, 6);
  });
  it('segue a prioridade do início da colheita', () => {
    const c = campo();
    expect(inicioColheita(c, null, { ...P, desloc: 3 })).toEqual({ k: dn('2027-01-11'), origem: 'planilha' });
    expect(inicioColheita(c, '2027-01-05', P)?.origem).toBe('dessecacao');
    expect(inicioColheita(campo({ ov_inicio: '2027-01-02' }), '2027-01-05', P)).toEqual({ k: dn('2027-01-02'), origem: 'manual' });
    expect(inicioColheita(campo({ ov_inicio: '2027-01-02', colheita_inicio: '2027-01-04' }), '2027-01-05', P)?.origem).toBe('real');
    const sem = campo({ data_colheita_prevista: null });
    expect(inicioColheita(sem, null, P)).toBeNull();
    expect(inicioColheita(sem, null, { ...P, pres: '2026-10-01' })).toEqual({ k: dn('2026-10-01') + 110, origem: 'presumida' });
  });
  it('distribui a área pelos dias reais quando a colheita já terminou', () => {
    const r = projetar([campo({ colheita_inicio: '2027-01-10', colheita_fim: '2027-01-13' })], prov, P);
    expect(r.dias).toHaveLength(4);
    expect(r.dias.every((d) => Math.abs(d.ha - 39) < 1e-9)).toBe(true);
  });
  it('deixa de fora campos sem data, inativos ou desmarcados', () => {
    const r = projetar(
      [campo({ id: 'a', data_colheita_prevista: null }), campo({ id: 'b', ativo: false }), campo({ id: 'c', incluir_projecao: false }), campo({ id: 'd', ov_aprov: 100, ov_sc_ha: 10 })],
      prov, P,
    );
    expect(r.semData.map((c) => c.id)).toEqual(['a']);
    expect(r.unidades.map((u) => u.campo.id)).toEqual(['d']);
    expect(r.total).toBeCloseTo(1560, 6);
  });
});

describe('armazenamento de demonstração', () => {
  const vazio = (): Dados => ({ tecnicos: [], campos: [], dessecacoes: [], programacoes: [], colheitas: [], metas: [], config: structuredClone(CONFIG_PADRAO) });
  it('reimportar atualiza a planilha e preserva o controle operacional', async () => {
    const s = new DemoStore(null, vazio());
    const { id: _i, ...planilha } = campo();
    const [c] = await s.importarCampos([planilha]);
    await s.atualizarCampos([c.id], { colheita_inicio: '2027-01-08', ov_ha_dia: 80 });
    const [d1] = await s.salvarDessecacoes([{ campo_id: c.id, data: '2026-11-11', area_ha: 50, dias_para_colheita: 5, observacoes: null }]);
    expect(d1.data_provavel_colheita).toBe('2026-11-16');
    const [de] = await s.importarCampos([{ ...planilha, area_mapa: 200 }]);
    expect(de.id).toBe(c.id);
    expect(de.area_mapa).toBe(200);
    expect(de.colheita_inicio).toBe('2027-01-08');
    expect(de.ov_ha_dia).toBe(80);
    expect((await s.carregar()).dessecacoes).toHaveLength(1);
  });
  it('não duplica a programação do mesmo técnico, campo e dia', async () => {
    const s = new DemoStore(null, vazio());
    const base = { data: '2026-11-12', tecnico_id: 't1', campo_id: 'c1', observacoes: null };
    await s.salvarProgramacoes([{ ...base, atividade: 'colheita_pre' }]);
    await s.salvarProgramacoes([{ ...base, atividade: 'coleta_pre' }]);
    const d = await s.carregar();
    expect(d.programacoes).toHaveLength(1);
    expect(d.programacoes[0].atividade).toBe('coleta_pre');
  });
  it('permite trocar técnico, dia e andamento, sem duplicar técnico + campo + dia', async () => {
    const s = new DemoStore(null, vazio());
    const base = { data: '2026-11-12', campo_id: 'c1', atividade: 'colheita_pre' as const, observacoes: null };
    const [a] = await s.salvarProgramacoes([{ ...base, tecnico_id: 't1' }]);
    await s.salvarProgramacoes([{ ...base, tecnico_id: 't2' }]);
    const m = await s.atualizarProgramacao(a.id, { tecnico_id: 't3', data: '2026-11-13', status: 'realizado' });
    expect([m.tecnico_id, m.data, m.status]).toEqual(['t3', '2026-11-13', 'realizado']);
    await expect(s.atualizarProgramacao(a.id, { tecnico_id: 't2', data: '2026-11-12' })).rejects.toThrow(/Já existe/);
    await s.excluirProgramacao(a.id);
    expect((await s.carregar()).programacoes.map((p) => p.tecnico_id)).toEqual(['t2']);
  });
  it('os dados de exemplo são fictícios e trazem um aviso de véspera', async () => {
    const s = new DemoStore(null);
    const d = await s.carregar();
    expect(d.campos.length).toBeGreaterThan(20);
    expect(d.campos.every((c) => /Demonstração/.test(c.cliente ?? ''))).toBe(true);
  });
});

describe('colheita real do campo', () => {
  let n = 0;
  const lanc = (p: Partial<ColheitaDia> = {}): ColheitaDia => ({
    id: 'l' + ++n, campo_id: 'c1', data: '2027-01-08', colhido_kg: 60000, aprovado_kg: null, area_ha: null, observacoes: null, ...p,
  });
  it('soma os lançamentos do dia a dia e converte kg em sacos', () => {
    const r = realCampo(campo(), [lanc({ data: '2027-01-09', colhido_kg: 120000 }), lanc(), lanc({ data: '2027-01-09', colhido_kg: 30000 })], P);
    expect(r.colhidoSc).toBe(3500);
    expect(r.internSc).toBe(3500);
    expect(r.dias).toBe(2);
    expect(r.lancamentos.map((l) => l.data)).toEqual(['2027-01-08', '2027-01-09', '2027-01-09']);
    expect(paraKg(10, 'sc', 60)).toBe(600);
    expect(paraKg(1.5, 't', 60)).toBe(1500);
  });
  it('aproveitamento para semente = aprovado e internalizado ÷ potencial (produtividade do produtor × área)', () => {
    // 156 ha × 60 sc/ha = 9.360 sc de potencial; entraram 6.000 sc, dos quais 5.616 aprovados → 60%
    const c = campo({ prod_real_sc_ha: 60, colheita_inicio: '2027-01-08', colheita_fim: '2027-01-10' });
    const r = realCampo(c, [lanc({ colhido_kg: 360000, aprovado_kg: 336960 })], P);
    expect(r.potencialSc).toBe(9360);
    expect(r.internSc).toBe(5616);
    expect(r.aprovPct).toBeCloseTo(60, 9);
    // deixou de ir para a UBS = potencial − entregue = 9.360 − 6.000
    expect(r.naoEnviadoSc).toBeCloseTo(3360, 9);
    expect(r.aprovadoDoEntreguePct).toBeCloseTo(93.6, 9);
    expect(r.areaRestante).toBe(0);
  });
  it('sem a produtividade do produtor não há potencial nem aproveitamento (nada é estimado no lugar)', () => {
    const r = realCampo(campo(), [lanc()], P);
    expect([r.prodHa, r.potencialSc, r.naoEnviadoSc, r.aprovPct]).toEqual([null, null, null, null]);
    expect(r.internSc).toBe(1000);
  });
  it('a produtividade do produtor é só informativa: não muda o volume nem o que falta colher', () => {
    const base = campo({ colheita_inicio: '2027-01-08' });
    for (const l of [[], [lanc({ colhido_kg: 151200, area_ha: 56 })], [lanc({ colhido_kg: 151200 })]]) {
      const sem = realCampo(base, l, P);
      const com = realCampo({ ...base, prod_real_sc_ha: 90 }, l, P);
      expect([com.colhidoSc, com.internSc, com.areaRestante, com.scRestante]).toEqual([sem.colhidoSc, sem.internSc, sem.areaRestante, sem.scRestante]);
    }
  });
  it('com a colheita em andamento mede o parcial sobre a área já colhida e desconta do que falta', () => {
    const c = campo({ prod_real_sc_ha: 60, colheita_inicio: '2027-01-08' });
    const r = realCampo(c, [lanc({ colhido_kg: 151200, area_ha: 56 })], P);
    expect(r.parcial).toBe(true);
    expect(r.potencialSc).toBe(56 * 60);
    expect(r.aprovPct).toBeCloseTo(75, 9);
    expect(r.areaRestante).toBe(100);
    // o que falta usa os parâmetros da Internalização (65 sc/ha × 70%), não a produtividade do produtor
    expect(r.scRestante).toBeCloseTo(4550, 9);
  });
  it('sem área lançada estima o que falta colher pelo volume entregue', () => {
    // esperado 156 ha × 65 × 70% = 7.098 sc; entraram 3.549 sc → metade do campo
    const r = realCampo(campo({ colheita_inicio: '2027-01-08' }), [lanc({ colhido_kg: 3549 * 60 })], P);
    expect(r.restanteEstimado).toBe(true);
    expect(r.areaRestante).toBeCloseTo(78, 9);
    expect(realCampo(campo(), [], P).areaRestante).toBe(156);
    expect(realCampo(campo({ ativo: false }), [], P).areaRestante).toBe(0);
  });
});

describe('metas por cultivar', () => {
  const M = CONFIG_PADRAO.metas;
  const meta = (p: Partial<MetaCultivar> = {}): MetaCultivar => ({
    id: 'm1', cultivar: 'CULTIVAR T', meta_sc200: 2500, pms_g: null, rend_ubs: null, meta_intern_sc: null, bb_ubs: null, bb_tolling: null, observacoes: null, ...p,
  });
  const resumo = (campos: Campo[], colheitas: ColheitaDia[], metas: MetaCultivar[]) => {
    const g = agruparColheitas(colheitas);
    return resumirMetas(campos, new Map(campos.map((c) => [c.id, realCampo(c, g.get(c.id) ?? [], P)])), metas, P, M);
  };
  const vol = (campo_id: string, sc: number, area_ha: number | null = null): ColheitaDia => ({
    id: 'v' + campo_id + sc, campo_id, data: '2027-01-08', colhido_kg: sc * 60, aprovado_kg: null, area_ha, observacoes: null,
  });

  it('big bags → sacos de 200 mil → semente pronta → matéria-prima a internalizar', () => {
    // 100 big bags × 25 = 2.500 sc de 200 mil × 36 kg ÷ 60 = 1.500 sc prontos ÷ 75% = 2.000 sc brutos
    expect(metaInternDe(2500, 180, 75, 60)).toBeCloseTo(2000, 9);
    const [l] = resumo([campo()], [], [meta()]).linhas;
    expect([l.metaBB, l.metaSc200, l.metaSc60]).toEqual([100, 2500, 1500]);
    expect(l.metaIntern).toBeCloseTo(2000, 9);
  });
  it('PMS e aproveitamento na UBS por cultivar valem no lugar do padrão; meta manual vale no lugar do cálculo', () => {
    expect(resumo([campo()], [], [meta({ pms_g: 150, rend_ubs: 80 })]).linhas[0].metaIntern).toBeCloseTo((2500 * 30) / 60 / 0.8, 9);
    const [l] = resumo([campo()], [], [meta({ meta_intern_sc: 3000 })]).linhas;
    expect(l.metaIntern).toBe(3000);
    expect(l.metaManual).toBe(true);
    // só a meta manual: os big bags equivalentes são deduzidos (3.000 × 75% ÷ 0,6 ÷ 25 = 150)
    const [s] = resumo([campo()], [], [meta({ meta_sc200: null, meta_intern_sc: 3000 })]).linhas;
    expect(s.bbDeduzido).toBe(true);
    expect(s.metaBB).toBeCloseTo(150, 9);
  });
  it('GAP e atingimento usam o volume aprovado e internalizado dos campos da cultivar', () => {
    const campos = [campo(), campo({ id: 'c2', chave: 'T02|S1', num_campo: 'T02', produto: ' cultivar t ' }), campo({ id: 'c3', chave: 'T03|S1', produto: 'OUTRA' })];
    const r = resumo(campos, [vol('c1', 900), vol('c2', 600), vol('c3', 50)], [meta()]);
    const l = r.linhas.find((x) => x.chave === chaveCultivar('CULTIVAR T'))!;
    expect(l.campos).toBe(2);
    expect(l.intern).toBe(1500);
    expect(l.gap).toBe(-500);
    expect(l.pct).toBe(75);
    expect(r.intern).toBe(1550);
    expect(r.gap).toBe(-450);
    expect(r.linhas.find((x) => x.cultivar === 'OUTRA')!.situacao).toBe('sem_meta');
  });
  it('alerta quando falta internalizar mais do que o previsto nos campos ainda a colher', () => {
    // 156 ha × 65 sc/ha × 70% = 7.098 sc previstos
    const ok = resumo([campo()], [], [meta({ meta_intern_sc: 7000 })]);
    expect(ok.linhas[0].situacao).toBe('no_caminho');
    expect(ok.alertas).toHaveLength(0);
    const al = resumo([campo()], [], [meta({ meta_intern_sc: 8000 })]);
    expect(al.linhas[0].situacao).toBe('alerta');
    expect(al.linhas[0].saldo).toBeCloseTo(7098 - 8000, 9);
    expect(al.linhas[0].areaNecessaria).toBeCloseTo(8000 / 45.5, 9);
    expect(al.alertas.map((l) => l.cultivar)).toEqual(['CULTIVAR T']);
  });
  it('campo já colhido não conta como disponível; meta atingida não gera alerta', () => {
    const colhido = campo({ colheita_inicio: '2027-01-08', colheita_fim: '2027-01-10' });
    const falta = resumo([colhido], [vol('c1', 5000)], [meta({ meta_intern_sc: 6000 })]).linhas[0];
    expect([falta.areaDisp, falta.scDisp, falta.falta, falta.situacao]).toEqual([0, 0, 1000, 'alerta']);
    const bateu = resumo([colhido], [vol('c1', 6500)], [meta({ meta_intern_sc: 6000 })]).linhas[0];
    expect([bateu.situacao, bateu.gap, bateu.falta]).toEqual(['atingida', 500, 0]);
  });
  it('cultivar com meta e sem campo cadastrado entra na lista e alerta', () => {
    const r = resumo([], [], [meta({ cultivar: 'SEM CAMPO' })]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].situacao).toBe('alerta');
  });
  it('a produtividade do produtor não mexe nas metas: só o volume internalizado conta', () => {
    const c = campo({ colheita_inicio: '2027-01-08' });
    const sem = resumo([c], [vol('c1', 2000, 56)], [meta()]).linhas[0];
    const com = resumo([{ ...c, prod_real_sc_ha: 20 }], [vol('c1', 2000, 56)], [meta()]).linhas[0];
    expect([com.intern, com.gap, com.scDisp, com.areaDisp, com.situacao, com.bbProjetados]).toEqual([sem.intern, sem.gap, sem.scDisp, sem.areaDisp, sem.situacao, sem.bbProjetados]);
  });
  it('projeta os big bags com o que já entrou e o que ainda vem', () => {
    const [l] = resumo([campo({ colheita_inicio: '2027-01-08' })], [vol('c1', 2000, 56)], [meta({ bb_ubs: 40, bb_tolling: 10 })]).linhas;
    expect(l.bbPossiveis).toBeCloseTo(100, 9);
    // + 100 ha × 65 × 70% = 4.550 sc → (2.000 + 4.550) × 75% ÷ 0,6 ÷ 25
    expect(l.bbProjetados).toBeCloseTo((6550 * 0.75) / 0.6 / 25, 9);
    expect(l.bbProntos).toBe(50);
    expect(l.pctProducao).toBe(50);
  });
});

describe('armazenamento: volume colhido e metas', () => {
  const vazio = (): Dados => ({ tecnicos: [], campos: [], dessecacoes: [], programacoes: [], colheitas: [], metas: [], config: structuredClone(CONFIG_PADRAO) });
  it('lança, corrige e exclui volume; reimportar a planilha preserva a produtividade do produtor', async () => {
    const s = new DemoStore(null, vazio());
    const { id: _i, ...planilha } = campo();
    const [c] = await s.importarCampos([planilha]);
    expect(c.prod_real_sc_ha).toBeNull();
    await s.atualizarCampos([c.id], { prod_real_sc_ha: 58 });
    const [a] = await s.salvarColheitas([{ campo_id: c.id, data: '2027-01-08', colhido_kg: 1000, aprovado_kg: null, area_ha: null, observacoes: null }]);
    await s.salvarColheitas([{ campo_id: c.id, data: '2027-01-08', colhido_kg: 500, aprovado_kg: 400, area_ha: 3, observacoes: 'carga 2' }]);
    await s.salvarColheitas([{ id: a.id, campo_id: c.id, data: '2027-01-08', colhido_kg: 1200, aprovado_kg: null, area_ha: null, observacoes: null }]);
    let d = await s.carregar();
    expect(d.colheitas.map((x) => x.colhido_kg).sort()).toEqual([1200, 500]);
    const [de] = await s.importarCampos([{ ...planilha, area_mapa: 200 }]);
    expect(de.prod_real_sc_ha).toBe(58);
    await s.excluirColheita(a.id);
    await s.excluirCampo(c.id);
    d = await s.carregar();
    expect(d.colheitas).toHaveLength(0);
  });
  it('grava uma meta por cultivar (repetir atualiza) e aceita dados salvos por versão anterior', async () => {
    const s = new DemoStore(null, vazio());
    const base = { meta_sc200: 2500, pms_g: null, rend_ubs: null, meta_intern_sc: null, bb_ubs: null, bb_tolling: null, observacoes: null };
    const m1 = await s.salvarMeta({ ...base, cultivar: 'CULTIVAR T' });
    const m2 = await s.salvarMeta({ ...base, cultivar: 'cultivar  t', meta_sc200: 5000 });
    expect(m2.id).toBe(m1.id);
    expect((await s.carregar()).metas).toHaveLength(1);
    await s.excluirMeta(m1.id);
    expect((await s.carregar()).metas).toHaveLength(0);
    const antigo = { tecnicos: [], campos: [{ ...campo(), prod_real_sc_ha: undefined }], dessecacoes: [], programacoes: [], config: { params: CONFIG_PADRAO.params } } as unknown as Dados;
    const d = await new DemoStore({ getItem: () => JSON.stringify(antigo), setItem: () => {} }).carregar();
    expect([d.colheitas, d.metas, d.campos[0].prod_real_sc_ha, d.config.metas]).toEqual([[], [], null, CONFIG_PADRAO.metas]);
  });
  it('os dados de exemplo trazem histórico de técnicos, volumes e uma cultivar em alerta', async () => {
    const d = await new DemoStore(null).carregar();
    const g = agruparColheitas(d.colheitas);
    const reais = new Map(d.campos.map((c) => [c.id, realCampo(c, g.get(c.id) ?? [], d.config.params)]));
    const r = resumirMetas(d.campos, reais, d.metas, d.config.params, d.config.metas);
    expect(d.colheitas.length).toBeGreaterThan(10);
    expect(r.intern).toBeGreaterThan(0);
    expect(r.alertas.length).toBeGreaterThan(0);
    expect(r.linhas.some((l) => l.situacao === 'no_caminho')).toBe(true);
    const primeiro = d.programacoes.filter((p) => p.campo_id === d.campos[0].id);
    expect(new Set(primeiro.map((p) => p.tecnico_id)).size).toBeGreaterThan(1);
  });
});

describe('Supabase sem as migrações mais novas', () => {
  // cliente de mentira: responde como o PostgREST quando a tabela ou a coluna ainda não existe
  function falso(tabelas: Record<string, unknown[]>, colunasCampos: string[] = ['prod_real_sc_ha', 'descarte']) {
    const consulta = (t: string) => {
      let sel = '*';
      const resp = () => {
        if (!(t in tabelas)) return { data: null, error: { message: `Could not find the table 'public.${t}' in the schema cache` } };
        if (sel !== '*' && !colunasCampos.includes(sel)) return { data: null, error: { message: `column ${t}.${sel} does not exist` } };
        return { data: tabelas[t], error: null };
      };
      const q: Record<string, unknown> = {};
      for (const m of ['order', 'eq', 'in']) q[m] = () => q;
      q.select = (c: string) => ((sel = c), q);
      q.range = async () => resp();
      q.maybeSingle = async () => ({ data: { dados: {} }, error: null });
      q.update = () => ({ in: () => ({ select: async () => ({ data: null, error: { message: "Could not find the 'descarte' column of 'campos' in the schema cache" } }) }) });
      return q;
    };
    return { rpc: async () => ({ data: true, error: null }), from: consulta } as never;
  }
  const { prod_real_sc_ha: _p, descarte: _d, descarte_motivo: _m, descarte_data: _t, encerramento_obs: _o, ...campoAntigo } = campo();
  const base = { tecnicos: [tec], dessecacoes: [], programacoes: [prog()] };

  it('sem a 0002 e a 0003: carrega o resto do sistema e diz quais arquivos rodar', async () => {
    const d = await new SupabaseStore(falso({ ...base, campos: [campoAntigo] }, [])).carregar();
    expect(d.faltaMigracao).toEqual([MIGRACAO_0002, MIGRACAO_0003]);
    expect([d.campos.length, d.programacoes.length, d.colheitas.length, d.metas.length]).toEqual([1, 1, 0, 0]);
    expect([d.campos[0].prod_real_sc_ha, d.campos[0].descarte, d.campos[0].descarte_motivo]).toEqual([null, null, null]);
    expect(d.config.metas).toEqual(CONFIG_PADRAO.metas);
  });
  it('só sem a 0003 (descarte): avisa só dela, mesmo sem nenhum campo cadastrado', async () => {
    const tudo = { ...base, colheitas_diarias: [], metas_cultivar: [] };
    expect((await new SupabaseStore(falso({ ...tudo, campos: [{ ...campoAntigo, prod_real_sc_ha: null }] }, ['prod_real_sc_ha'])).carregar()).faltaMigracao).toEqual([MIGRACAO_0003]);
    expect((await new SupabaseStore(falso({ ...tudo, campos: [] }, ['prod_real_sc_ha'])).carregar()).faltaMigracao).toEqual([MIGRACAO_0003]);
  });
  it('com o banco atualizado não mostra o aviso', async () => {
    const d = await new SupabaseStore(falso({ tecnicos: [], campos: [campo()], dessecacoes: [], programacoes: [], colheitas_diarias: [], metas_cultivar: [] })).carregar();
    expect(d.faltaMigracao).toEqual([]);
  });
  it('sem nenhuma tabela continua explicando o que rodar; gravar em coluna nova também', async () => {
    await expect(new SupabaseStore(falso({})).carregar()).rejects.toThrow(SEM_TABELAS);
    await expect(new SupabaseStore(falso({})).atualizarCampos(['c1'], { descarte: 'total' })).rejects.toThrow(/0003_descarte\.sql/);
  });
});

describe('descarte de campos', () => {
  const vol = (sc: number, area_ha: number | null = null): ColheitaDia => ({ id: 'v' + sc, campo_id: 'c1', data: '2027-01-08', colhido_kg: sc * 60, aprovado_kg: null, area_ha, observacoes: null });

  it('descartado sem colher: situação própria, sem alerta e sem nada disponível para colher', () => {
    const c = campo({ descarte: 'total', descarte_motivo: 'clima', descarte_data: '2026-11-14' });
    expect(resumoCampo(c, [dess()], '2026-11-15').situacao).toBe('descartado');
    expect(encerrado(c)).toBe(true);
    expect(gerarAlertas([c], [dess()], [], [tec], '2026-11-15')).toHaveLength(0);
    const r = realCampo(c, [], P);
    // o campo inteiro: 156 ha × 65 sc/ha × 70% = 7.098 sc que deixaram de vir
    expect([r.areaRestante, r.scRestante, r.areaDescartada]).toEqual([0, 0, 156]);
    expect(r.scDescartado).toBeCloseTo(7098, 9);
  });
  it('descarte parcial sem área lançada: projeta o descartado pelo volume internalizado', () => {
    // previsto 7.098 sc; entraram 5.323,5 sc (3/4) → ficou para trás 1/4: 39 ha e 1.774,5 sc
    const c = campo({ colheita_inicio: '2027-01-08', colheita_fim: '2027-01-10', descarte: 'parcial', descarte_motivo: 'qualidade', descarte_data: '2027-01-10' });
    const r = realCampo(c, [vol(5323.5)], P);
    expect(r.descarteEstimado).toBe(true);
    expect(r.areaDescartada).toBeCloseTo(39, 9);
    expect(r.scDescartado).toBeCloseTo(1774.5, 9);
    expect(r.previstoSc - r.internSc).toBeCloseTo(r.scDescartado, 9);
    expect(r.areaRestante).toBe(0);
    expect(resumoCampo(c, [], '2027-01-12').situacao).toBe('colhido');
    // entregou mais que o previsto: nada foi descartado
    expect(realCampo(c, [vol(8000)], P).scDescartado).toBe(0);
  });
  it('descarte parcial com área colhida lançada: usa a área que sobrou', () => {
    const c = campo({ colheita_inicio: '2027-01-08', colheita_fim: '2027-01-10', descarte: 'parcial' });
    const r = realCampo(c, [vol(5000, 120)], P);
    expect([r.descarteEstimado, r.areaDescartada]).toEqual([false, 36]);
    expect(r.scDescartado).toBeCloseTo(36 * 45.5, 9);
  });
  it('sem descarte nada é abatido além do que já foi colhido', () => {
    const r = realCampo(campo({ colheita_inicio: '2027-01-08', colheita_fim: '2027-01-10' }), [vol(3000)], P);
    expect([r.areaDescartada, r.scDescartado, r.areaRestante]).toEqual([0, 0, 0]);
  });
  it('o volume descartado sai do disponível das metas e da projeção de internalização', () => {
    const a = campo({ id: 'a', chave: 'A|S1', num_campo: 'A' });
    const b = campo({ id: 'b', chave: 'B|S1', num_campo: 'B' });
    const meta: MetaCultivar = { id: 'm', cultivar: 'CULTIVAR T', meta_sc200: null, pms_g: null, rend_ubs: null, meta_intern_sc: 10000, bb_ubs: null, bb_tolling: null, observacoes: null };
    const disp = (campos: Campo[]) => resumirMetas(campos, new Map(campos.map((c) => [c.id, realCampo(c, [], P)])), [meta], P, CONFIG_PADRAO.metas).linhas[0];
    expect(disp([a, b]).scDisp).toBeCloseTo(14196, 9);
    expect(disp([a, b]).situacao).toBe('no_caminho');
    const descartado = { ...b, descarte: 'total' as const };
    expect(disp([a, descartado]).scDisp).toBeCloseTo(7098, 9);
    expect(disp([a, descartado]).situacao).toBe('alerta');
    // projeção: o descartado direto sai; no parcial só entra a área colhida
    expect(projetar([a, descartado], new Map(), P).unidades.map((u) => u.campo.id)).toEqual(['a']);
    const parcial = { ...b, colheita_inicio: '2027-01-08', colheita_fim: '2027-01-09', descarte: 'parcial' as const };
    const proj = projetar([parcial], new Map(), P, new Map([['b', 56]]));
    expect(proj.unidades[0].area).toBe(100);
    expect(proj.total).toBeCloseTo(100 * 65 * 0.7, 6);
  });
  it('reimportar a planilha preserva o descarte', async () => {
    const s = new DemoStore(null, { tecnicos: [], campos: [], dessecacoes: [], programacoes: [], colheitas: [], metas: [], config: structuredClone(CONFIG_PADRAO) });
    const { id: _i, ...planilha } = campo();
    const [c] = await s.importarCampos([planilha]);
    expect(c.descarte).toBeNull();
    await s.atualizarCampos([c.id], { descarte: 'total', descarte_motivo: 'negativa_colheita', descarte_data: '2026-11-14', encerramento_obs: 'produtor desistiu' });
    const [de] = await s.importarCampos([{ ...planilha, area_mapa: 200 }]);
    expect([de.descarte, de.descarte_motivo, de.descarte_data, de.encerramento_obs]).toEqual(['total', 'negativa_colheita', '2026-11-14', 'produtor desistiu']);
  });
});

describe('ranking de cooperados', () => {
  let n = 0;
  const c = (id: string, cliente: string, area: number, p: Partial<Campo> = {}) =>
    campo({ id, chave: id + '|S1', num_campo: id, cliente, area_mapa: area, colheita_inicio: '2027-01-08', colheita_fim: '2027-01-10', ...p });
  const vol = (campo_id: string, sc: number, aprov: number | null = null, area_ha: number | null = null): ColheitaDia =>
    ({ id: 'r' + ++n, campo_id, data: '2027-01-08', colhido_kg: sc * 60, aprovado_kg: aprov == null ? null : aprov * 60, area_ha, observacoes: null });
  const rank = (campos: Campo[], colheitas: ColheitaDia[]) => {
    const g = agruparColheitas(colheitas);
    return rankear(campos, new Map(campos.map((x) => [x.id, realCampo(x, g.get(x.id) ?? [], P)])), new Map(campos.map((x) => [x.id, resumoCampo(x, [], '2027-01-15')])));
  };

  it('ordena pelo volume internalizado e mostra que quem entregou mais pode ter aproveitado menos', () => {
    // potencial = área × 65 sc/ha × 70% de aproveitamento (os dois da aba Internalização)
    // GRANDE: 1.000 ha → 45.500 sc, internalizou 26.000 (57,1%); PEQUENO: 100 ha → 4.550 sc, internalizou 4.550 (100%)
    const R = rank([c('g1', 'GRANDE', 600), c('g2', ' grande ', 400), c('p1', 'PEQUENO', 100)], [vol('g1', 20000), vol('g2', 8000, 6000), vol('p1', 4550)]);
    expect(R.cooperados.map((g) => [g.posicao, g.nome, g.campos.length])).toEqual([[1, 'GRANDE', 2], [2, 'PEQUENO', 1]]);
    const [grande, pequeno] = R.cooperados;
    expect([grande.colhidoSc, grande.internSc]).toEqual([28000, 26000]);
    expect(grande.potContaSc).toBeCloseTo(45500, 6);
    expect(grande.aprovPct).toBeCloseTo((26000 / 45500) * 100, 9);
    expect(pequeno.potContaSc).toBeCloseTo(4550, 6);
    expect(pequeno.aprovPct).toBeCloseTo(100, 9);
    expect(grande.participacao).toBeCloseTo((26000 / 30550) * 100, 9);
    expect([R.internSc, R.colhidoSc, R.comEntrega]).toEqual([30550, 32550, 2]);
    expect(R.aprovPct).toBeCloseTo((30550 / 50050) * 100, 9);
    // campo a campo, do que mais entregou para o que menos entregou
    expect(grande.campos.map((x) => [x.campo.id, Math.round(x.potencialSc), x.internSc])).toEqual([['g1', 27300, 20000], ['g2', 18200, 6000]]);
    // ajuste por campo na Internalização (sc/ha e aproveitamento) também vale para o potencial do ranking
    const aj = rank([c('a', 'AJUSTADO', 100, { ov_sc_ha: 80, ov_aprov: 50 })], [vol('a', 4000)]).cooperados[0];
    expect([aj.potContaSc, aj.aprovPct]).toEqual([4000, 100]);
  });
  it('campo ainda por colher não pesa; em colheita pesa só a área colhida; descartado sem colher pesa inteiro', () => {
    const R = rank([
      c('a', 'JOÃO', 100, { colheita_inicio: null, colheita_fim: null }),
      c('b', 'JOÃO', 200, { colheita_fim: null }),
      c('d', 'JOÃO', 50, { colheita_inicio: null, colheita_fim: null, descarte: 'total', descarte_motivo: 'clima' }),
      c('e', 'MARIA', 80, { colheita_inicio: null, colheita_fim: null }),
    ], [vol('b', 3250, null, 100)]);
    const joao = R.cooperados[0];
    expect([joao.nAColher, joao.nEmColheita, joao.nDescartados, joao.nColhidos]).toEqual([1, 1, 1, 0]);
    // potencial na conta: (100 ha colhidos + 50 ha descartados) × 65 × 70% = 6.825 (os 100 ha por colher e o resto do campo b ficam fora)
    expect(joao.potContaSc).toBeCloseTo(6825, 6);
    expect(joao.potencialSc).toBeCloseTo(350 * 45.5, 6);
    expect(joao.aprovPct).toBeCloseTo((3250 / 6825) * 100, 9);
    expect(joao.campos.find((x) => x.campo.id === 'd')!.aprovPct).toBe(0);
    expect(joao.campos.find((x) => x.campo.id === 'a')!.aprovPct).toBeNull();
    const maria = R.cooperados[1];
    expect([maria.posicao, maria.aprovPct, maria.potContaSc]).toEqual([null, null, 0]);
    expect(R.motivos).toEqual([{ motivo: 'Clima', campos: 1, area: 50, sc: 50 * 45.5 }]);
  });
  it('a produtividade do produtor e os campos inativos não entram no ranking', () => {
    const base = [c('a', 'JOÃO', 100), c('x', 'JOÃO', 500, { ativo: false })];
    const sem = rank(base, [vol('a', 3000), vol('x', 9000)]).cooperados[0];
    const com = rank([{ ...base[0], prod_real_sc_ha: 30 }, base[1]], [vol('a', 3000), vol('x', 9000)]).cooperados[0];
    expect([sem.internSc, Math.round(sem.potContaSc), sem.campos.length]).toEqual([3000, 4550, 1]);
    expect([com.internSc, com.potContaSc, com.aprovPct]).toEqual([sem.internSc, sem.potContaSc, sem.aprovPct]);
  });
  it('relatório de colheita e descartes: datas, descarte direto, motivo, observações e volume descartado', () => {
    const R = rank([
      c('a', 'JOÃO', 156, { descarte: 'parcial', descarte_motivo: 'qualidade', descarte_data: '2027-01-10', encerramento_obs: 'talhão 3 ficou' }),
      c('d', 'JOÃO', 50, { colheita_inicio: null, colheita_fim: null, descarte: 'total', descarte_motivo: 'moega_indisponivel', descarte_data: '2027-01-05' }),
      c('n', 'MARIA', 100),
    ], [vol('a', 5323.5), vol('n', 4000)]);
    const linhas = relatorioColheita(R.cooperados.flatMap((g) => g.campos));
    const cab = linhas[0] as string[];
    const de = (id: string, col: string) => linhas.find((l) => l[1] === id)![cab.indexOf(col)];
    expect(cab).toEqual(expect.arrayContaining(['Início da colheita', 'Fim da colheita', 'Descartado direto (sem colher)', 'Motivo do descarte', 'Observações', 'Volume descartado (sc)']));
    expect([de('a', 'Início da colheita'), de('a', 'Fim da colheita'), de('a', 'Descartado direto (sem colher)'), de('a', 'Motivo do descarte'), de('a', 'Observações')])
      .toEqual(['08/01/2027', '10/01/2027', 'Não', 'Qualidade', 'talhão 3 ficou']);
    expect([de('a', 'Área descartada (ha)'), de('a', 'Volume descartado (sc)'), de('a', 'Como o descarte foi calculado')]).toEqual([39, 1775, 'projetado pelo volume internalizado']);
    expect([de('d', 'Início da colheita'), de('d', 'Fim da colheita'), de('d', 'Descartado direto (sem colher)'), de('d', 'Motivo do descarte'), de('d', 'Situação'), de('d', 'Data do descarte')])
      .toEqual([null, null, 'Sim', 'Moega indisponível', 'Descartado', '05/01/2027']);
    expect([de('n', 'Descartado direto (sem colher)'), de('n', 'Tipo de descarte'), de('n', 'Volume descartado (sc)'), de('n', 'Aprovado e internalizado (sc)')]).toEqual(['Não', null, null, 4000]);
  });
  it('os dados de exemplo trazem um descarte direto e um parcial', async () => {
    const d = await new DemoStore(null).carregar();
    expect(d.campos.filter((x) => x.descarte === 'total')).toHaveLength(1);
    expect(d.campos.filter((x) => x.descarte === 'parcial')).toHaveLength(1);
    const g = agruparColheitas(d.colheitas);
    const reais = new Map(d.campos.map((x) => [x.id, realCampo(x, g.get(x.id) ?? [], d.config.params)]));
    const R = rankear(d.campos, reais, new Map(d.campos.map((x) => [x.id, resumoCampo(x, [], '2026-11-14')])));
    expect(R.comEntrega).toBeGreaterThan(3);
    expect(R.motivos.map((m) => m.motivo).sort()).toEqual(['Clima', 'Qualidade']);
    expect(R.motivos.every((m) => m.sc > 0)).toBe(true);
  });
});

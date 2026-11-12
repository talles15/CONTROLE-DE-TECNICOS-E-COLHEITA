import { describe, expect, it } from 'vitest';
import { dataProvavel, difDias, dn, iso, somaDias } from './dates';
import { faixaDe, haversine, posicoes, rotulosFaixas, volumePorFaixa } from './geo';
import { chaveCultivar, metaInternDe, resumirMetas } from './metas';
import { inicioColheita, projetar, sacosCampo } from './projecao';
import { agruparColheitas, paraKg, realCampo } from './realizado';
import { gerarAlertas, resumoCampo } from './status';
import { DemoStore, SEM_TABELAS, SupabaseStore } from './store';
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

describe('Supabase sem a migração 0002', () => {
  // cliente de mentira: responde como o PostgREST quando a tabela ou a coluna ainda não existe
  function falso(tabelas: Record<string, unknown[]>) {
    const consulta = (t: string) => {
      const resp = () =>
        t in tabelas
          ? { data: tabelas[t], error: null }
          : { data: null, error: { message: `Could not find the table 'public.${t}' in the schema cache` } };
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'order', 'eq', 'in']) q[m] = () => q;
      q.range = async () => resp();
      q.maybeSingle = async () => ({ data: { dados: {} }, error: null });
      q.update = () => ({ in: () => ({ select: async () => ({ data: null, error: { message: "Could not find the 'prod_real_sc_ha' column of 'campos' in the schema cache" } }) }) });
      return q;
    };
    return { rpc: async () => ({ data: true, error: null }), from: consulta } as never;
  }
  const { prod_real_sc_ha: _p, ...campoAntigo } = campo();

  it('carrega o resto do sistema e avisa que falta atualizar o banco', async () => {
    const d = await new SupabaseStore(falso({ tecnicos: [tec], campos: [campoAntigo], dessecacoes: [], programacoes: [prog()] })).carregar();
    expect(d.faltaMigracao).toBe(true);
    expect([d.campos.length, d.programacoes.length, d.colheitas.length, d.metas.length]).toEqual([1, 1, 0, 0]);
    expect(d.campos[0].prod_real_sc_ha).toBeNull();
    expect(d.config.metas).toEqual(CONFIG_PADRAO.metas);
  });
  it('com o banco atualizado não mostra o aviso', async () => {
    const d = await new SupabaseStore(falso({ tecnicos: [], campos: [campo()], dessecacoes: [], programacoes: [], colheitas_diarias: [], metas_cultivar: [] })).carregar();
    expect(d.faltaMigracao).toBe(false);
  });
  it('sem nenhuma tabela continua explicando o que rodar; gravar na coluna nova também', async () => {
    await expect(new SupabaseStore(falso({})).carregar()).rejects.toThrow(SEM_TABELAS);
    await expect(new SupabaseStore(falso({})).atualizarCampos(['c1'], { prod_real_sc_ha: 60 })).rejects.toThrow(/0002_colheita_real_e_metas\.sql/);
  });
});

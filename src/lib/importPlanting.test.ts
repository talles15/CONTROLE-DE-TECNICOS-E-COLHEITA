import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { chaveCampo, compararImportacao, converterLinhas, dataPlanilha, grausDecimais, lerPlanting } from './importPlanting';
import { CONTROLE_PADRAO, type Campo } from './types';
import { lerAbaXlsx, type Celula } from './xlsx';

// Planilha de teste com dados inventados, no mesmo formato da aba "Base Planting".
const CAB = ['Emissão', 'Número do pedido', 'Nº do campo', 'Cliente', 'Cidade', 'Estado', 'Propriedade', 'CPF/CNPJ', 'Inscrição Estadual',
  'Produto', 'Peneira', 'Data de Plantio', 'Ciclo', 'Data colheita', 'Área Projetada', 'Área Real', 'ÁREA MAPA', 'Talhão',
  'Categoria plantada', 'Categoria a colher', 'Expectativa produção sc 200 mil', 'Toneladas MAPA', 'Latitude', 'Longitude', 'Chave (IE|Produto)', 'AÇÃO'];
const linha = (o: Record<string, Celula>): Celula[] => CAB.map((c) => o[c] ?? null);
const base = { Cliente: 'CLIENTE UM', Cidade: 'RIO VERDE', Estado: 'GO', Propriedade: 'FAZENDA A', 'CPF/CNPJ': 12345678901, 'Inscrição Estadual': '11.222.333-4',
  Produto: 'CULT X', Ciclo: 110, 'Chave (IE|Produto)': '11.222.333-4|CULTX', 'AÇÃO': 'INSCRITO' };
// 46285 = 20/09/2026 · 46395 = 08/01/2027 (nº serial do Excel)
const LINHAS: Celula[][] = [
  ['', '', 'PLANTING — TESTE'],
  CAB,
  linha({ ...base, 'Nº do campo': 'T10', 'Número do pedido': 111, Peneira: 'P1', 'Data de Plantio': 46285, 'Data colheita': 46395, 'Área Projetada': 100, 'Área Real': 98, 'ÁREA MAPA': 100,
    Talhão: 'T.1 ; T.2', 'Categoria plantada': 'C2', 'Categoria a colher': 'S1', 'Expectativa produção sc 200 mil': 6000, 'Toneladas MAPA': 480, Latitude: 172000.5, Longitude: 510000.5 }),
  linha({ ...base, 'Nº do campo': 'T10', 'Número do pedido': 112, Peneira: 'P2', 'Data de Plantio': 46287, 'Data colheita': 46397, 'Área Projetada': 50, 'Área Real': 51, 'ÁREA MAPA': 50.5,
    Talhão: 'T.2 ; T.3', 'Categoria plantada': 'S1', 'Categoria a colher': 'S1', 'Expectativa produção sc 200 mil': 3030, 'Toneladas MAPA': 242.4 }),
  linha({ ...base, 'Nº do campo': 'T10', 'Número do pedido': 113, Peneira: 'P1', 'Área Projetada': 30, 'ÁREA MAPA': 30, 'Categoria plantada': 'C1', 'Categoria a colher': 'C2', 'Expectativa produção sc 200 mil': 1800 }),
  linha({ ...base, 'Nº do campo': 'Não SIGEF', Cliente: 'CLIENTE DOIS', 'ÁREA MAPA': 40, 'Categoria a colher': 'S1', Latitude: '17°15\'30.6"S', Longitude: '51°10\'20.4"W' }),
  linha({ ...base, 'Nº do campo': 'Não SIGEF', Cliente: 'CLIENTE TRÊS', 'ÁREA MAPA': 60, 'Categoria a colher': 'S1' }),
  [],
];

describe('importação da Base Planting', () => {
  const r = converterLinhas(LINHAS);
  const por = (ch: string) => r.campos.find((c) => c.chave === ch)!;

  it('acha o cabeçalho na 2ª linha e conta as linhas com dados', () => {
    expect(r.totalLinhas).toBe(5);
  });
  it('nunca lê CPF/CNPJ, Inscrição Estadual nem a chave com IE', () => {
    expect(r.colunasIgnoradas).toEqual(['CPF/CNPJ', 'Inscrição Estadual', 'Chave (IE|Produto)']);
    const tudo = JSON.stringify(r.campos);
    expect(tudo).not.toContain('12345678901');
    expect(tudo).not.toContain('11.222.333-4');
    expect(Object.keys(r.campos[0]).some((k) => /cpf|cnpj|inscricao|ie$/i.test(k))).toBe(false);
  });
  it('une linhas do mesmo campo e só separa quando a categoria a colher muda', () => {
    expect(r.campos.map((c) => c.chave)).toEqual(['T10|S1', 'T10|C2', 'NÃO SIGEF|cliente dois|cult x|S1', 'NÃO SIGEF|cliente tres|cult x|S1']);
    const s1 = por('T10|S1');
    expect(s1.linhas).toHaveLength(2);
    expect(s1.area_mapa).toBe(150.5);
    expect(s1.area_projetada).toBe(150);
    expect(s1.expectativa_sc).toBe(9030);
    expect(s1.toneladas_mapa).toBe(722.4);
    expect(s1.peneira).toBe('P1/P2');
    expect(s1.talhao).toBe('T.1 ; T.2 ; T.3');
    expect(s1.categoria_plantada).toBe('C2/S1');
    expect(por('T10|C2').area_mapa).toBe(30);
  });
  it('usa a data mais cedo e converte o nº serial do Excel', () => {
    const s1 = por('T10|S1');
    expect(s1.data_plantio).toBe('2026-09-20');
    expect(s1.data_colheita_prevista).toBe('2027-01-08');
    expect(por('T10|C2').data_colheita_prevista).toBeNull();
  });
  it('converte coordenadas compactadas e em texto para graus decimais', () => {
    const s1 = por('T10|S1');
    expect(s1.latitude).toBeCloseTo(-(17 + 20 / 60 + 0.5 / 3600), 5);
    expect(s1.longitude).toBeCloseTo(-(51 + 0 / 60 + 0.5 / 3600), 5);
    const ns = por('NÃO SIGEF|cliente dois|cult x|S1');
    expect(ns.latitude).toBeCloseTo(-17.2585, 5);
    expect(ns.longitude).toBeCloseTo(-51.172333, 5);
    expect(grausDecimais(-17.494824, 'lat')).toBe(-17.494824);
    expect(grausDecimais(176199.9, 'lat')).toBeNull(); // segundos ≥ 60
    expect(grausDecimais('#DIV/0!', 'lat')).toBeNull();
  });
  it('trata datas em texto e valores inválidos', () => {
    expect(dataPlanilha('20/09/2026')).toBe('2026-09-20');
    expect(dataPlanilha('2026-09-20T00:00:00')).toBe('2026-09-20');
    expect(dataPlanilha('23/09/2026/01/04/2026')).toBeNull();
    expect(dataPlanilha(5)).toBeNull();
  });
  it('gera a mesma chave no cadastro manual', () => {
    expect(chaveCampo({ num_campo: ' t10 ', categoria_colher: 's1', cliente: null, produto: null })).toBe('T10|S1');
  });
  it('compara com o que já existe (novos, atualizados, ausentes)', () => {
    const existente = (chave: string, ativo = true): Campo => ({ ...CONTROLE_PADRAO, ...por('T10|S1'), chave, id: chave, ativo });
    const c = compararImportacao(r.campos, [existente('T10|S1'), existente('VELHO|S1'), existente('INATIVO|S1', false)]);
    expect(c.atualizados.map((x) => x.chave)).toEqual(['T10|S1']);
    expect(c.novos).toHaveLength(3);
    expect(c.ausentes.map((x) => x.chave)).toEqual(['VELHO|S1']);
  });
  it('explica quando a planilha não tem a coluna do campo', () => {
    expect(() => converterLinhas([['A', 'B'], [1, 2]])).toThrow(/Nº do campo/);
  });
});

describe('leitor de .xlsx', () => {
  // monta um .xlsx mínimo com duas abas; só a "Base Planting" deve ser aberta
  const compart = ['Nº do campo', 'Cliente', 'ÁREA MAPA', 'Categoria a colher', 'T20', 'Fulano & Cia', 'S2', 'CPF/CNPJ'];
  const si = compart.map((s) => `<si><t>${s.replace(/&/g, '&amp;')}</t></si>`).join('');
  const folha =
    '<worksheet><sheetData>' +
    '<row r="2"><c r="B2" t="s"><v>0</v></c><c r="C2" t="s"><v>1</v></c><c r="D2" t="s"><v>2</v></c><c r="E2" t="s"><v>3</v></c><c r="F2" t="s"><v>7</v></c></row>' +
    '<row r="3"><c r="B3" t="s"><v>4</v></c><c r="C3" t="s"><v>5</v></c><c r="D3"><v>120.5</v></c><c r="E3" t="s"><v>6</v></c><c r="F3"><v>99988877766</v></c></row>' +
    '<row r="4"><c r="B4" t="inlineStr"><is><t>T21</t></is></c><c r="C4" s="3"/><c r="D4" t="e"><v>#DIV/0!</v></c><c r="E4" t="str"><f>A1</f><v>S1</v></c></row>' +
    '</sheetData></worksheet>';
  const arq = zipSync({
    'xl/workbook.xml': strToU8('<workbook xmlns:r="x"><sheets><sheet name="Outra" sheetId="1" r:id="rId1"/><sheet name="Base Planting" sheetId="2" r:id="rId2"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="t" Target="worksheets/sheet2.xml"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8(`<sst>${si}</sst>`),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>'),
    'xl/worksheets/sheet2.xml': strToU8(folha),
  });

  it('abre a aba pedida e lê texto, número, fórmula e erro', () => {
    const aba = lerAbaXlsx(arq, 'base planting');
    expect(aba.nome).toBe('Base Planting');
    expect(aba.abas).toEqual(['Outra', 'Base Planting']);
    expect(aba.linhas[1]).toEqual([null, 'Nº do campo', 'Cliente', 'ÁREA MAPA', 'Categoria a colher', 'CPF/CNPJ']);
    expect(aba.linhas[2]).toEqual([null, 'T20', 'Fulano & Cia', 120.5, 'S2', 99988877766]);
    expect(aba.linhas[3]).toEqual([null, 'T21', null, null, 'S1']);
  });
  it('importa do arquivo sem levar o CPF', () => {
    const r = lerPlanting(arq);
    expect(r.campos.map((c) => [c.chave, c.area_mapa, c.cliente])).toEqual([['T20|S2', 120.5, 'Fulano & Cia'], ['T21|S1', 0, null]]);
    expect(JSON.stringify(r.campos)).not.toContain('99988877766');
  });
  it('recusa arquivo que não é .xlsx', () => {
    expect(() => lerAbaXlsx(strToU8('isto não é uma planilha'), 'Base Planting')).toThrow(/xlsx/);
  });
});

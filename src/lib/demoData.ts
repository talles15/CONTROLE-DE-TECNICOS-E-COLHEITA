// Dados FICTÍCIOS para o modo demonstração. Nenhum nome, fazenda ou número daqui é real.
import { dataProvavel, hoje as hojeIso, somaDias } from './dates';
import { CONFIG_PADRAO, CONTROLE_PADRAO, type Campo, type Dados, type Dessecacao, type Programacao, type Tecnico } from './types';

function prng(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CIDADES = ['RIO VERDE', 'MONTIVIDIU', 'JATAI', 'CAIAPONIA', 'PARAUNA', 'MINEIROS'];
const CULTIVARES: [string, string, string, number][] = [
  ['DEMO 67 IPRO', 'OBTENTOR A', 'IPRO', 110],
  ['DEMO 70 I2X', 'OBTENTOR B', 'I2X', 112],
  ['DEMO 74 CE', 'OBTENTOR B', 'CE', 116],
  ['DEMO 78 I2X', 'OBTENTOR A', 'I2X', 120],
  ['DEMO 80 IPRO', 'OBTENTOR C', 'IPRO', 120],
];
const DISTANCIAS = [4, 8, 9, 14, 18, 26, 33, 41, 47, 58, 66, 74, 83, 95, 112, 128, 150, 176, 195, 215, 240, 262];

export function dadosDemo(hoje: string = hojeIso()): Dados {
  const r = prng(20262027);
  const ubs = CONFIG_PADRAO.ubs;
  const id = (p: string, i: number) => `${p}-demo-${String(i).padStart(3, '0')}`;

  const tecnicos: Tecnico[] = [
    ['Técnico Demo Ana', '(64) 99999-0001', 'RIO VERDE', 'Técnica de campo', '#2a78d6'],
    ['Técnico Demo Bruno', '(64) 99999-0002', 'MONTIVIDIU', 'Técnico de campo', '#eb6834'],
    ['Técnico Demo Carla', '(64) 99999-0003', 'JATAI', 'Amostradora', '#1a9a6c'],
    ['Técnico Demo Diego', '(64) 99999-0004', 'CAIAPONIA', 'Técnico de campo', '#8a5cd6'],
  ].map(([nome, telefone, cidade_base, funcao, cor], i) => ({
    id: id('tec', i + 1), nome, telefone, cidade_base, funcao, cor, ativo: true, observacoes: null,
  }));

  const campos: Campo[] = [];
  const dessecacoes: Dessecacao[] = [];
  const programacoes: Programacao[] = [];
  const N = 36;
  for (let i = 0; i < N; i++) {
    const [produto, obtentor, biotec, ciclo] = CULTIVARES[i % CULTIVARES.length];
    const dist = DISTANCIAS[i % DISTANCIAS.length] * (0.85 + r() * 0.3);
    const ang = r() * Math.PI * 2;
    const semCoord = i % 12 === 11;
    const lat = ubs.lat + (dist / 111.2) * Math.cos(ang);
    const lng = ubs.lng + (dist / (111.2 * Math.cos((ubs.lat * Math.PI) / 180))) * Math.sin(ang);
    const area = Math.round(60 + r() * 520);
    // colheita prevista espalhada de 12 dias atrás até 45 dias à frente
    const colheita = somaDias(hoje, -12 + Math.round((i / N) * 57));
    const cat = i % 3 === 0 ? 'S2' : 'S1';
    const num = `X${String(i + 1).padStart(2, '0')}`;
    const c: Campo = {
      ...CONTROLE_PADRAO,
      id: id('campo', i + 1),
      chave: `${num}|${cat}`,
      num_campo: num,
      cliente: `Produtor Demonstração ${String((i % 9) + 1).padStart(2, '0')}`,
      propriedade: `Fazenda Exemplo ${String((i % 14) + 1).padStart(2, '0')}`,
      cidade: CIDADES[i % CIDADES.length],
      uf: 'GO',
      produto, obtentor, biotec,
      peneira: i % 2 ? 'P2' : 'P1',
      categoria_plantada: cat === 'S2' ? 'S1' : 'C2',
      categoria_colher: cat,
      tipo_contrato: ['Cooperado', 'Engordo', 'Proforme'][i % 3],
      vendedor: `Vendedor Demo ${(i % 3) + 1}`,
      uso_semente: 'Multi-Comercial',
      proprio_terceiro: i % 4 === 0 ? 'Terceiro' : 'Próprio',
      acao: 'INSCRITO',
      autorizacao: null,
      contrato: null,
      talhao: `T.${(i % 7) + 1}`,
      data_plantio: somaDias(colheita, -ciclo),
      ciclo,
      data_colheita_prevista: colheita,
      data_floracao: somaDias(colheita, -ciclo + 45),
      area_mapa: area,
      area_projetada: area,
      area_real: Math.round(area * (0.97 + r() * 0.06)),
      expectativa_sc: area * 60,
      toneladas_mapa: area * 4.8,
      latitude: semCoord ? null : Math.round(lat * 1e6) / 1e6,
      longitude: semCoord ? null : Math.round(lng * 1e6) / 1e6,
      linhas: [],
    };
    const dess = (data: string, dias: number | null, areaHa: number | null) =>
      dessecacoes.push({
        id: id('dess', dessecacoes.length + 1), campo_id: c.id, data, area_ha: areaHa,
        dias_para_colheita: dias, data_provavel_colheita: dataProvavel(data, dias), observacoes: null,
      });
    const prog = (data: string, t: number, atividade: Programacao['atividade'], observacoes: string | null = null) =>
      programacoes.push({
        id: id('prog', programacoes.length + 1), data, tecnico_id: tecnicos[t % tecnicos.length].id, campo_id: c.id,
        atividade, status: 'planejado', observacoes,
      });

    if (i < 3) {
      // já colhidos
      dess(somaDias(hoje, -16 + i), 6, area);
      c.colheita_inicio = somaDias(hoje, -10 + i);
      c.colheita_fim = somaDias(hoje, -7 + i);
    } else if (i < 7) {
      // em colheita
      dess(somaDias(hoje, -8 + (i - 3)), 5, area);
      c.colheita_inicio = somaDias(hoje, -2 + (i % 2));
      prog(hoje, i, 'colheita_pre');
      if (i < 5) prog(somaDias(hoje, 1), i, 'colheita_pre', 'Continuar no mesmo talhão');
    } else if (i < 9) {
      // colheita provável HOJE
      dess(somaDias(hoje, -5), 5, area);
      prog(hoje, i, 'colheita_pre');
    } else if (i < 12) {
      // colheita provável AMANHÃ → gera o aviso de véspera
      dess(somaDias(hoje, -4), 5, i === 10 ? Math.round(area / 2) : area);
      if (i === 9) prog(hoje, i, 'coleta_pre', 'Pegar pré-colheita antes das 10h');
    } else if (i < 16) {
      // colheita provável nos próximos dias
      dess(somaDias(hoje, -2 + (i - 12)), 6, area);
    } else if (i === 16) {
      // dessecado sem data provável informada
      dess(somaDias(hoje, -1), null, null);
    } else if (i === 17) {
      // atrasado: data provável passou e a colheita não começou
      dess(somaDias(hoje, -9), 6, area);
    }
    campos.push(c);
  }
  return { tecnicos, campos, dessecacoes, programacoes, config: JSON.parse(JSON.stringify(CONFIG_PADRAO)) };
}

export function dadosVazios(): Dados {
  return { tecnicos: [], campos: [], dessecacoes: [], programacoes: [], config: JSON.parse(JSON.stringify(CONFIG_PADRAO)) };
}

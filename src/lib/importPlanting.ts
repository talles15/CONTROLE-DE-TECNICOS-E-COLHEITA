// Leitura da aba "Base Planting" e conversão em campos do sistema.
//
// Regras:
//  - Só entram as colunas da lista COLUNAS. CPF/CNPJ, Inscrição Estadual e a coluna
//    "Chave (IE|Produto)" nunca são lidas, portanto não chegam ao banco nem ao repositório.
//  - Linhas com o mesmo nº de campo viram um único campo (áreas somadas). Só ficam
//    separadas quando a categoria a colher for diferente.
import { iso } from './dates';
import type { Campo, CampoPlanilha, LinhaOrigem } from './types';
import { lerAbaXlsx, type Celula } from './xlsx';

export const ABA_PADRAO = 'Base Planting';

const norm = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** cabeçalho normalizado → nome interno */
const COLUNAS: Record<string, string> = {
  'numero do pedido': 'pedido',
  'codigo produto': 'codigo_produto',
  'contrato agroforce': 'contrato',
  'n do campo': 'num_campo',
  'no do campo': 'num_campo',
  'numero do campo': 'num_campo',
  cliente: 'cliente',
  'tipo de contrato': 'tipo_contrato',
  cidade: 'cidade',
  estado: 'uf',
  propriedade: 'propriedade',
  vendedor: 'vendedor',
  'uso semente': 'uso_semente',
  obtentor: 'obtentor',
  biotec: 'biotec',
  produto: 'produto',
  peneira: 'peneira',
  tratamento: 'tratamento',
  'data de plantio': 'data_plantio',
  ciclo: 'ciclo',
  'data colheita': 'data_colheita',
  'data floracao': 'data_floracao',
  'area projetada': 'area_projetada',
  'area real': 'area_real',
  'area mapa': 'area_mapa',
  talhao: 'talhao',
  'categoria plantada': 'categoria_plantada',
  'categoria a colher': 'categoria_colher',
  'expectativa producao sc 200 mil': 'expectativa_sc',
  'toneladas mapa': 'toneladas_mapa',
  latitude: 'latitude',
  longitude: 'longitude',
  autorizacao: 'autorizacao',
  'proprio terceiro': 'proprio_terceiro',
  acao: 'acao',
};

/** Cabeçalhos com dado sensível: sempre descartados. */
const SENSIVEL = /\b(cpf|cnpj|inscricao estadual|ie)\b/;

export interface ResultadoImportacao {
  aba: string;
  totalLinhas: number;
  campos: CampoPlanilha[];
  colunasIgnoradas: string[];
  avisos: string[];
}

const txt = (v: Celula | undefined): string | null => {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
};
const numero = (v: Celula | undefined): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const s = v.trim();
    const x = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
    return Number.isFinite(x) ? x : 0;
  }
  return 0;
};

/** Converte nº serial do Excel, texto dd/mm/aaaa ou aaaa-mm-dd em data ISO. */
export function dataPlanilha(v: Celula | undefined): string | null {
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null; // fora de 1954–2119: não é data
    return iso(Math.floor(v) - 25569);
  }
  if (typeof v === 'string') {
    const s = v.trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

/**
 * Converte coordenada em graus decimais. Aceita:
 *  - graus/minutos/segundos "compactados" como número (173000.5 = 17°30'00.5");
 *  - texto 17°30'00.5"S;
 *  - graus decimais (-17.494824).
 * Sem indicação de hemisfério, assume Sul/Oeste (Brasil).
 */
export function grausDecimais(v: Celula | undefined, eixo: 'lat' | 'lng'): number | null {
  if (v == null || v === '') return null;
  const limite = eixo === 'lat' ? 90 : 180;
  let n: number | null = null;
  let hemisferio: string | null = null;
  if (typeof v === 'string') {
    const s = v.trim();
    const m = /^(-?\d+(?:[.,]\d+)?)\s*[°ºo]\s*(?:(\d+(?:[.,]\d+)?)\s*['’′]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:"|”|″|'')?\s*)?([NSLEWO])?$/i.exec(s);
    if (m) {
      const f = (x?: string) => (x ? parseFloat(x.replace(',', '.')) : 0);
      const g = f(m[1]);
      const dec = Math.abs(g) + f(m[2]) / 60 + f(m[3]) / 3600;
      hemisferio = m[4] ? m[4].toUpperCase() : g < 0 ? 'NEG' : null;
      if (dec > limite) return null;
      return hemisferio === 'N' || hemisferio === 'E' || hemisferio === 'L' ? dec : -dec;
    }
    const x = Number(s.replace(',', '.'));
    if (!Number.isFinite(x)) return null;
    n = x;
  } else if (typeof v === 'number') n = v;
  if (n == null || !Number.isFinite(n) || n === 0) return null;
  const a = Math.abs(n);
  if (a <= limite) return -a; // já em graus decimais
  const g = Math.floor(a / 10000);
  const mi = Math.floor((a % 10000) / 100);
  const se = a % 100;
  if (mi >= 60 || se >= 60 || g > limite) return null;
  return -(g + mi / 60 + se / 3600);
}

const semNumero = (c: string): boolean => c === '' || /sigef|^-+$|^s\/?n$/i.test(c);

/** Chave de agrupamento: nº do campo + categoria a colher. */
export function chaveCampo(l: { num_campo: string; categoria_colher: string | null; cliente: string | null; produto: string | null }): string {
  const campo = l.num_campo.trim().toUpperCase();
  const cat = (l.categoria_colher ?? '').trim().toUpperCase();
  // campos sem número (ex.: "Não SIGEF") não podem ser unidos entre clientes/cultivares diferentes
  if (semNumero(campo)) return [campo || 'SEM Nº', norm(l.cliente), norm(l.produto), cat].join('|');
  return `${campo}|${cat}`;
}

function juntar(vals: (string | null)[], sep: string): string | null {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const v of vals) {
    if (!v) continue;
    const k = norm(v);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(v);
  }
  return out.length ? out.join(sep) : null;
}
const menor = (vals: (string | null)[]): string | null => {
  const v = vals.filter((x): x is string => !!x).sort();
  return v.length ? v[0] : null;
};
const arred = (n: number, casas = 2): number => {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
};

interface LinhaBruta {
  [k: string]: string | number | null;
}

export function converterLinhas(linhas: Celula[][], aba = ABA_PADRAO): ResultadoImportacao {
  // cabeçalho = primeira linha (entre as 15 primeiras) que tem a coluna do nº do campo
  let hi = -1;
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    if ((linhas[i] ?? []).some((c) => COLUNAS[norm(c)] === 'num_campo')) {
      hi = i;
      break;
    }
  }
  if (hi < 0) {
    throw new Error(
      `Não encontrei a coluna "Nº do campo" na aba "${aba}". Confira se a planilha segue o modelo da Base Planting.`,
    );
  }
  const mapa = new Map<number, string>();
  const colunasIgnoradas: string[] = [];
  (linhas[hi] ?? []).forEach((c, j) => {
    const n = norm(c);
    if (!n) return;
    if (SENSIVEL.test(n)) {
      colunasIgnoradas.push(String(c).trim());
      return;
    }
    const campo = COLUNAS[n];
    if (campo && ![...mapa.values()].includes(campo)) mapa.set(j, campo);
  });

  const brutas: LinhaBruta[] = [];
  for (let i = hi + 1; i < linhas.length; i++) {
    const l = linhas[i] ?? [];
    const o: Record<string, Celula> = {};
    for (const [j, campo] of mapa) o[campo] = l[j] ?? null;
    const num = txt(o.num_campo);
    if (!num && !txt(o.cliente) && !txt(o.produto)) continue; // linha vazia
    brutas.push({
      num_campo: num ?? '',
      cliente: txt(o.cliente),
      propriedade: txt(o.propriedade),
      cidade: txt(o.cidade),
      uf: txt(o.uf),
      produto: txt(o.produto),
      obtentor: txt(o.obtentor),
      biotec: txt(o.biotec),
      peneira: txt(o.peneira),
      categoria_plantada: txt(o.categoria_plantada),
      categoria_colher: txt(o.categoria_colher),
      tipo_contrato: txt(o.tipo_contrato),
      vendedor: txt(o.vendedor),
      uso_semente: txt(o.uso_semente),
      proprio_terceiro: txt(o.proprio_terceiro),
      acao: txt(o.acao),
      autorizacao: txt(o.autorizacao),
      contrato: txt(o.contrato),
      talhao: txt(o.talhao),
      tratamento: txt(o.tratamento),
      pedido: txt(o.pedido),
      codigo_produto: txt(o.codigo_produto),
      data_plantio: dataPlanilha(o.data_plantio),
      data_colheita: dataPlanilha(o.data_colheita),
      data_floracao: dataPlanilha(o.data_floracao),
      ciclo: typeof o.ciclo === 'number' && o.ciclo > 0 ? Math.round(o.ciclo) : null,
      area_mapa: numero(o.area_mapa),
      area_projetada: numero(o.area_projetada),
      area_real: numero(o.area_real),
      expectativa_sc: numero(o.expectativa_sc),
      toneladas_mapa: numero(o.toneladas_mapa),
      latitude: grausDecimais(o.latitude, 'lat'),
      longitude: grausDecimais(o.longitude, 'lng'),
    });
  }

  const grupos = new Map<string, LinhaBruta[]>();
  for (const b of brutas) {
    const k = chaveCampo({
      num_campo: String(b.num_campo),
      categoria_colher: b.categoria_colher as string | null,
      cliente: b.cliente as string | null,
      produto: b.produto as string | null,
    });
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(b);
  }

  const s = (g: LinhaBruta[], c: string) => g.map((x) => x[c] as string | null);
  const soma = (g: LinhaBruta[], c: string) => arred(g.reduce((t, x) => t + ((x[c] as number) || 0), 0), 4);
  const campos: CampoPlanilha[] = [];
  for (const [chave, g] of grupos) {
    const comCoord = g.find((x) => x.latitude != null && x.longitude != null);
    const comCiclo = g.find((x) => x.ciclo != null);
    const origem: LinhaOrigem[] = g.map((x) => ({
      pedido: x.pedido as string | null,
      codigo_produto: x.codigo_produto as string | null,
      peneira: x.peneira as string | null,
      talhao: x.talhao as string | null,
      propriedade: x.propriedade as string | null,
      categoria_plantada: x.categoria_plantada as string | null,
      tratamento: x.tratamento as string | null,
      data_plantio: x.data_plantio as string | null,
      data_colheita: x.data_colheita as string | null,
      area_mapa: arred((x.area_mapa as number) || 0, 4),
      area_projetada: arred((x.area_projetada as number) || 0, 4),
      area_real: arred((x.area_real as number) || 0, 4),
      expectativa_sc: arred((x.expectativa_sc as number) || 0, 4),
    }));
    campos.push({
      chave,
      num_campo: String(g[0].num_campo) || 'Sem nº',
      cliente: juntar(s(g, 'cliente'), ' / '),
      propriedade: juntar(s(g, 'propriedade'), ' / '),
      cidade: juntar(s(g, 'cidade'), ' / '),
      uf: juntar(s(g, 'uf'), '/'),
      produto: juntar(s(g, 'produto'), ' / '),
      obtentor: juntar(s(g, 'obtentor'), ' / '),
      biotec: juntar(s(g, 'biotec'), '/'),
      peneira: juntar(s(g, 'peneira').flatMap((p) => (p ? p.split('/') : [])), '/'),
      categoria_plantada: juntar(s(g, 'categoria_plantada'), '/'),
      categoria_colher: juntar(s(g, 'categoria_colher'), '/'),
      tipo_contrato: juntar(s(g, 'tipo_contrato'), ' / '),
      vendedor: juntar(s(g, 'vendedor'), ' / '),
      uso_semente: juntar(s(g, 'uso_semente'), ' / '),
      proprio_terceiro: juntar(s(g, 'proprio_terceiro').flatMap((p) => (p ? p.split('/') : [])), '/'),
      acao: juntar(s(g, 'acao'), ' / '),
      autorizacao: juntar(s(g, 'autorizacao'), ' / '),
      contrato: juntar(s(g, 'contrato'), ' / '),
      talhao: juntar(s(g, 'talhao').flatMap((t) => (t ? t.split(/\s*;\s*/) : [])), ' ; '),
      data_plantio: menor(s(g, 'data_plantio')),
      ciclo: comCiclo ? (comCiclo.ciclo as number) : null,
      data_colheita_prevista: menor(s(g, 'data_colheita')),
      data_floracao: menor(s(g, 'data_floracao')),
      area_mapa: soma(g, 'area_mapa'),
      area_projetada: soma(g, 'area_projetada'),
      area_real: soma(g, 'area_real'),
      expectativa_sc: soma(g, 'expectativa_sc'),
      toneladas_mapa: soma(g, 'toneladas_mapa'),
      latitude: comCoord ? arred(comCoord.latitude as number, 6) : null,
      longitude: comCoord ? arred(comCoord.longitude as number, 6) : null,
      linhas: origem,
    });
  }

  const avisos: string[] = [];
  const semData = campos.filter((c) => !c.data_colheita_prevista).length;
  const semCoord = campos.filter((c) => c.latitude == null).length;
  if (semData) avisos.push(`${semData} campo(s) sem data de plantio/colheita na planilha.`);
  if (semCoord) avisos.push(`${semCoord} campo(s) sem coordenada (não aparecem no mapa até serem preenchidos).`);
  return { aba, totalLinhas: brutas.length, campos, colunasIgnoradas, avisos };
}

export function lerPlanting(arquivo: Uint8Array): ResultadoImportacao {
  const aba = lerAbaXlsx(arquivo, ABA_PADRAO);
  return converterLinhas(aba.linhas, aba.nome);
}

export interface Comparacao {
  novos: CampoPlanilha[];
  atualizados: CampoPlanilha[];
  ausentes: Campo[];
}
/** Compara o arquivo com o que já está cadastrado (para a prévia da importação). */
export function compararImportacao(arquivo: CampoPlanilha[], existentes: Campo[]): Comparacao {
  const porChave = new Map(existentes.map((c) => [c.chave, c]));
  const noArquivo = new Set(arquivo.map((c) => c.chave));
  return {
    novos: arquivo.filter((c) => !porChave.has(c.chave)),
    atualizados: arquivo.filter((c) => porChave.has(c.chave)),
    ausentes: existentes.filter((c) => c.ativo && !noArquivo.has(c.chave)),
  };
}

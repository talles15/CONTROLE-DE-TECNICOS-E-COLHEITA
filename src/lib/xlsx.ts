// Leitor mínimo de .xlsx: abre apenas a aba pedida, sem carregar o resto do arquivo.
// (A planilha de planting tem abas auxiliares com mais de 1 milhão de linhas.)
import { unzipSync, strFromU8 } from 'fflate';

export type Celula = string | number | boolean | null;
export interface Aba {
  nome: string;
  abas: string[];
  linhas: Celula[][];
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function texto(s: string): string {
  return s
    .replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) =>
      e[0] === '#'
        ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
        : ENT[e],
    )
    .replace(/_x000D_/g, '');
}
const attr = (tag: string, nome: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${nome}="([^"]*)"`).exec(tag);
  return m ? texto(m[1]) : null;
};
function textosT(xml: string): string {
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += texto(m[1]);
  return out;
}
function colIdx(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/**
 * Lê uma aba do arquivo. Usa `preferida` quando existir (comparação sem diferenciar
 * maiúsculas/minúsculas); caso contrário, a primeira aba.
 */
export function lerAbaXlsx(arquivo: Uint8Array, preferida: string): Aba {
  let base: Record<string, Uint8Array>;
  try {
    base = unzipSync(arquivo, {
      filter: (f) =>
        f.name === 'xl/workbook.xml' || f.name === 'xl/_rels/workbook.xml.rels' || f.name === 'xl/sharedStrings.xml',
    });
  } catch {
    throw new Error('Arquivo inválido: envie uma planilha no formato .xlsx.');
  }
  if (!base['xl/workbook.xml']) throw new Error('Arquivo inválido: não é uma planilha .xlsx.');
  const wb = strFromU8(base['xl/workbook.xml']);
  const rels = strFromU8(base['xl/_rels/workbook.xml.rels'] ?? new Uint8Array());

  const abas: { nome: string; rid: string }[] = [];
  for (const m of wb.matchAll(/<sheet\s([^>]*?)\/?>/g)) {
    const nome = attr(m[1], 'name');
    const rid = attr(m[1], 'r:id');
    if (nome && rid) abas.push({ nome, rid });
  }
  if (!abas.length) throw new Error('A planilha não tem nenhuma aba.');
  const alvo = abas.find((a) => a.nome.trim().toLowerCase() === preferida.trim().toLowerCase()) ?? abas[0];

  let caminho = '';
  for (const m of rels.matchAll(/<Relationship\s([^>]*?)\/?>/g)) {
    if (attr(m[1], 'Id') === alvo.rid) {
      const t = attr(m[1], 'Target') ?? '';
      caminho = t.startsWith('/') ? t.slice(1) : 'xl/' + t;
    }
  }
  if (!caminho) throw new Error(`Não foi possível localizar a aba "${alvo.nome}" no arquivo.`);

  const folha = unzipSync(arquivo, { filter: (f) => f.name === caminho })[caminho];
  if (!folha) throw new Error(`Não foi possível abrir a aba "${alvo.nome}".`);

  const compart: string[] = [];
  if (base['xl/sharedStrings.xml']) {
    const ss = strFromU8(base['xl/sharedStrings.xml']);
    for (const m of ss.matchAll(/<si\/>|<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) {
      // ignora guias fonéticos (rPh)
      compart.push(m[1] ? textosT(m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '')) : '');
    }
  }

  const xml = strFromU8(folha);
  const linhas: Celula[][] = [];
  const reLinha = /<row\s([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let lm: RegExpExecArray | null;
  let seq = 0;
  while ((lm = reLinha.exec(xml))) {
    const r = attr(lm[1], 'r');
    const idx = r ? parseInt(r, 10) - 1 : seq;
    seq = idx + 1;
    const linha: Celula[] = [];
    const corpo = lm[2] ?? '';
    const reCel = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    let cseq = 0;
    while ((cm = reCel.exec(corpo))) {
      const ref = attr(cm[1], 'r');
      const ci = ref ? colIdx(ref) : cseq;
      cseq = ci + 1;
      const tipo = attr(cm[1], 't');
      const dentro = cm[2] ?? '';
      const vm = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(dentro);
      let v: Celula = null;
      if (tipo === 'inlineStr') v = textosT(dentro);
      else if (vm) {
        const bruto = texto(vm[1]);
        if (tipo === 's') v = compart[parseInt(bruto, 10)] ?? '';
        else if (tipo === 'str') v = bruto;
        else if (tipo === 'b') v = bruto === '1';
        else if (tipo === 'e') v = null; // erro de fórmula (#DIV/0!, #N/D…)
        else {
          const n = Number(bruto);
          v = Number.isFinite(n) ? n : bruto;
        }
      }
      if (v === '') v = null;
      while (linha.length < ci) linha.push(null);
      linha[ci] = v;
    }
    linhas[idx] = linha;
  }
  for (let i = 0; i < linhas.length; i++) if (!linhas[i]) linhas[i] = [];
  return { nome: alvo.nome, abas: abas.map((a) => a.nome), linhas };
}

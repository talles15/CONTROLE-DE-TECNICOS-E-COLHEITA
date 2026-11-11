import type { Campo } from './types';

const R_TERRA_KM = 6371.0088;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distância em linha reta (km) entre dois pontos em graus decimais. */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Índice da faixa (0 = até a 1ª distância). Retorna faixas.length quando passa da última. */
export function faixaDe(distKm: number, faixas: number[]): number {
  for (let i = 0; i < faixas.length; i++) if (distKm <= faixas[i]) return i;
  return faixas.length;
}

export function rotulosFaixas(faixas: number[], acumulado: boolean): string[] {
  const r = faixas.map((f, i) => (acumulado || i === 0 ? `até ${f} km` : `${faixas[i - 1]}–${f} km`));
  r.push(acumulado ? 'todas as distâncias' : `acima de ${faixas[faixas.length - 1]} km`);
  return r;
}

export interface Posicao {
  lat: number;
  lng: number;
  /** true quando a posição foi estimada pela média dos campos do mesmo município */
  aprox: boolean;
}

/** Posição de cada campo. Sem coordenada: opcionalmente a média do município. */
export function posicoes(campos: Campo[], aproximar: boolean): Map<string, Posicao> {
  const out = new Map<string, Posicao>();
  const porCidade = new Map<string, { lat: number; lng: number; n: number }>();
  const k = (c: Campo) => `${c.cidade ?? ''}|${c.uf ?? ''}`.toUpperCase();
  for (const c of campos) {
    if (c.latitude == null || c.longitude == null) continue;
    out.set(c.id, { lat: c.latitude, lng: c.longitude, aprox: false });
    const m = porCidade.get(k(c)) ?? { lat: 0, lng: 0, n: 0 };
    m.lat += c.latitude;
    m.lng += c.longitude;
    m.n++;
    porCidade.set(k(c), m);
  }
  if (aproximar) {
    for (const c of campos) {
      if (out.has(c.id) || !c.cidade) continue;
      const m = porCidade.get(k(c));
      if (m) out.set(c.id, { lat: m.lat / m.n, lng: m.lng / m.n, aprox: true });
    }
  }
  return out;
}

export interface ItemVolume {
  grupo: string;
  /** índice da faixa, ou null quando o campo não tem posição */
  faixa: number | null;
  valor: number;
}
export interface LinhaVolume {
  grupo: string;
  /** uma posição por faixa + 1 (acima da última) */
  faixas: number[];
  semCoord: number;
  total: number;
}

/** Soma o volume por grupo (cultivar) e faixa de distância. */
export function volumePorFaixa(itens: ItemVolume[], nFaixas: number, acumulado: boolean): { linhas: LinhaVolume[]; total: LinhaVolume } {
  const mapa = new Map<string, LinhaVolume>();
  const novo = (grupo: string): LinhaVolume => ({ grupo, faixas: new Array(nFaixas + 1).fill(0), semCoord: 0, total: 0 });
  const total = novo('TOTAL');
  for (const it of itens) {
    if (!it.valor) continue;
    let l = mapa.get(it.grupo);
    if (!l) mapa.set(it.grupo, (l = novo(it.grupo)));
    for (const alvo of [l, total]) {
      if (it.faixa == null) alvo.semCoord += it.valor;
      else alvo.faixas[it.faixa] += it.valor;
      alvo.total += it.valor;
    }
  }
  const linhas = [...mapa.values()].sort((a, b) => b.total - a.total);
  if (acumulado) {
    for (const l of [...linhas, total]) {
      let acc = 0;
      l.faixas = l.faixas.map((v) => (acc += v));
    }
  }
  return { linhas, total };
}

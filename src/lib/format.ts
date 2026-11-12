const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const nf2f = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const n0 = (v: number): string => nf0.format(v);
export const n1 = (v: number): string => nf1.format(v);
export const n2 = (v: number): string => nf2.format(v);
/** sempre com 2 casas, como nos painéis de acompanhamento */
export const n2f = (v: number): string => nf2f.format(v);

export function num(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const x = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : null;
}

export const semAcento = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function baixar(nome: string, conteudo: string, tipo = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function csv(linhas: (string | number | null | undefined)[][]): string {
  const cel = (v: string | number | null | undefined) => {
    if (v == null) return '';
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + linhas.map((l) => l.map(cel).join(';')).join('\r\n');
}

export async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

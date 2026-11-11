import { useEffect, useState } from 'react';

export type Aba = 'calendario' | 'campos' | 'programacao' | 'internalizacao' | 'mapa' | 'tecnicos' | 'importar';
export const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'calendario', rotulo: 'Calendário' },
  { id: 'campos', rotulo: 'Campos' },
  { id: 'programacao', rotulo: 'Programação' },
  { id: 'internalizacao', rotulo: 'Internalização' },
  { id: 'mapa', rotulo: 'Mapa' },
  { id: 'tecnicos', rotulo: 'Técnicos' },
  { id: 'importar', rotulo: 'Importar campos' },
];

export interface Rota {
  aba: Aba;
  params: Record<string, string>;
}

function ler(): Rota {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [caminho, busca = ''] = h.split('?');
  const aba = ABAS.find((a) => a.id === caminho)?.id ?? 'calendario';
  return { aba, params: Object.fromEntries(new URLSearchParams(busca)) };
}

export function ir(aba: Aba, params: Record<string, string | undefined> = {}): void {
  const limpo = Object.entries(params).filter((e): e is [string, string] => !!e[1]);
  const q = new URLSearchParams(limpo).toString();
  window.location.hash = `#/${aba}${q ? '?' + q : ''}`;
}

export function useRota(): Rota {
  const [rota, setRota] = useState<Rota>(ler);
  useEffect(() => {
    const f = () => setRota(ler());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return rota;
}

/** Abre a ficha do campo por cima da aba atual. */
export function abrirFicha(id: string): void {
  const r = ler();
  ir(r.aba, { ...r.params, ficha: id });
}

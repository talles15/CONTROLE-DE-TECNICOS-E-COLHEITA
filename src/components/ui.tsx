import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { semAcento } from '../lib/format';
import { SITUACOES, type Situacao } from '../lib/status';
import type { Campo, Tecnico } from '../lib/types';

export function Modal({ titulo, onFechar, children, sub }: { titulo: ReactNode; sub?: ReactNode; onFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', f);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', f);
      document.body.style.overflow = '';
    };
  }, [onFechar]);
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h2>{titulo}</h2>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <button className="btn" onClick={onFechar}>Fechar</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Sit({ s }: { s: Situacao }) {
  return (
    <span className="sit">
      <i style={{ background: SITUACOES[s].cor }} />
      {SITUACOES[s].rotulo}
    </span>
  );
}

export function TecChip({ t, extra }: { t: Tecnico; extra?: string }) {
  return (
    <span className="tec-chip">
      <i style={{ background: t.cor }} />
      {t.nome}
      {extra ? ` · ${extra}` : ''}
    </span>
  );
}

export const descCampo = (c: Campo): string =>
  [c.cliente, c.propriedade, [c.cidade, c.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ');

export const ordCampo = (a: Campo, b: Campo): number =>
  a.num_campo.localeCompare(b.num_campo, 'pt', { numeric: true }) || (a.categoria_colher ?? '').localeCompare(b.categoria_colher ?? '');

/** Caixa de busca para escolher um campo. Com `varios`, a lista fica aberta para escolher um campo atrás do outro. */
export function SeletorCampo({ campos, valor, onEscolher, placeholder, varios }: {
  campos: Campo[];
  valor: string | null;
  onEscolher: (id: string | null) => void;
  placeholder?: string;
  varios?: boolean;
}) {
  const atual = campos.find((c) => c.id === valor) ?? null;
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // composedPath: a opção clicada pode sair da lista (seleção de vários) antes deste aviso chegar
    const f = (e: MouseEvent) => ref.current && !e.composedPath().includes(ref.current) && setAberto(false);
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, []);
  const opcoes = useMemo(() => {
    const q = semAcento(texto.trim());
    const base = [...campos].sort(ordCampo);
    const f = q
      ? base.filter((c) => semAcento([c.num_campo, c.cliente, c.propriedade, c.cidade, c.produto].filter(Boolean).join(' ')).includes(q))
      : base;
    return f.slice(0, 60);
  }, [campos, texto]);
  return (
    <div className="sel-campo" ref={ref}>
      <input
        className="inp"
        placeholder={placeholder ?? 'Buscar campo, cliente, fazenda…'}
        value={aberto ? texto : atual ? `${atual.num_campo} — ${descCampo(atual)}` : texto}
        onFocus={() => { setAberto(true); setTexto(''); }}
        onClick={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onKeyDown={(e) => e.key === 'Escape' && setAberto(false)}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); if (valor) onEscolher(null); }}
        aria-label="Campo"
      />
      {aberto && (
        <div className="lista">
          {opcoes.length === 0 && <div className="empty">Nenhum campo encontrado.</div>}
          {opcoes.map((c) => (
            <button type="button" key={c.id} className={'op' + (c.id === valor ? ' at' : '')}
              onMouseDown={(e) => { e.preventDefault(); onEscolher(c.id); setAberto(!!varios); setTexto(''); }}>
              <b>{c.num_campo}</b> · {c.categoria_colher ?? '—'} · {c.produto ?? '—'}
              <small>{descCampo(c)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Filtros multi-seleção (mesmo comportamento do HTML de previsão). */
export type Filtros = Record<string, Set<string> | null>;
export const DIMENSOES: [keyof Campo & string, string][] = [
  ['acao', 'Ação (SIGEF)'],
  ['categoria_colher', 'Categoria a colher'],
  ['obtentor', 'Obtentor'],
  ['produto', 'Cultivar'],
  ['cidade', 'Cidade'],
  ['proprio_terceiro', 'Próprio/Terceiro'],
  ['tipo_contrato', 'Tipo de contrato'],
];
export const valorDim = (c: Campo, k: string): string => String((c as unknown as Record<string, unknown>)[k] ?? '') || '(vazio)';
export const passa = (c: Campo, f: Filtros): boolean => {
  for (const k in f) {
    const s = f[k];
    if (s && !s.has(valorDim(c, k))) return false;
  }
  return true;
};

export function useFiltros(chaveLs: string): [Filtros, (f: Filtros) => void] {
  const [f, setF] = useState<Filtros>(() => {
    const ini: Filtros = {};
    try {
      const salvo = JSON.parse(localStorage.getItem(chaveLs) ?? 'null') as Record<string, string[] | null> | null;
      if (salvo) for (const k in salvo) ini[k] = salvo[k] ? new Set(salvo[k]) : null;
    } catch {
      /* sem filtros salvos */
    }
    return ini;
  });
  const set = (n: Filtros) => {
    setF(n);
    try {
      const o: Record<string, string[] | null> = {};
      for (const k in n) o[k] = n[k] ? [...n[k]!] : null;
      localStorage.setItem(chaveLs, JSON.stringify(o));
    } catch {
      /* armazenamento indisponível */
    }
  };
  return [f, set];
}

export function BarraFiltros({ campos, filtros, onMudar }: { campos: Campo[]; filtros: Filtros; onMudar: (f: Filtros) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = (e: MouseEvent) => {
      box.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((d) => {
        if (!d.contains(e.target as Node)) d.open = false;
      });
    };
    document.addEventListener('click', f);
    return () => document.removeEventListener('click', f);
  }, []);
  return (
    <div className="filters" ref={box}>
      {DIMENSOES.map(([k, rotulo]) => {
        const cont = new Map<string, number>();
        for (const c of campos) cont.set(valorDim(c, k), (cont.get(valorDim(c, k)) ?? 0) + 1);
        const vals = [...cont.keys()].sort((a, b) => a.localeCompare(b, 'pt'));
        const sel = filtros[k] ?? null;
        const txt = !sel ? 'Todos' : sel.size === 0 ? 'Nenhum' : sel.size === 1 ? [...sel][0] : `${sel.size} selec.`;
        const mudar = (novo: Set<string> | null) =>
          onMudar({ ...filtros, [k]: novo && novo.size === vals.length ? null : novo });
        return (
          <details className="dd" key={k}>
            <summary>{rotulo}: <b>{txt}</b></summary>
            <div className="menu">
              <label className="all">
                <input type="checkbox" checked={!sel} onChange={(e) => mudar(e.target.checked ? null : new Set())} /> Todos
              </label>
              {vals.map((v) => (
                <label key={v}>
                  <input type="checkbox" checked={!sel || sel.has(v)}
                    onChange={(e) => {
                      const n = new Set(sel ?? vals);
                      if (e.target.checked) n.add(v);
                      else n.delete(v);
                      mudar(n);
                    }} />
                  {v} <span className="muted">({cont.get(v)})</span>
                </label>
              ))}
            </div>
          </details>
        );
      })}
      {Object.values(filtros).some(Boolean) && <button className="btn" onClick={() => onMudar({})}>Limpar filtros</button>}
    </div>
  );
}

/** Campo editável da tabela: grava ao sair da célula (ou Enter). */
export function CelulaEd({ tipo, valor, placeholder, onGravar, rotulo }: { tipo: 'date' | 'number'; valor: string | number | null; placeholder?: string; onGravar: (v: string) => void; rotulo: string }) {
  const base = valor == null ? '' : String(valor);
  const [v, setV] = useState(base);
  useEffect(() => setV(base), [base]);
  return (
    <input className={'ed' + (base ? ' set' : '')} type={tipo} value={v} placeholder={placeholder} aria-label={rotulo} step={tipo === 'number' ? 'any' : undefined} min={tipo === 'number' ? 0 : undefined}
      onChange={(e) => { setV(e.target.value); if (tipo === 'date') onGravar(e.target.value); }}
      onBlur={() => tipo === 'number' && v !== base && onGravar(v)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
  );
}

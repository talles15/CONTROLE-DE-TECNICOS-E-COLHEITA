import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { hoje as hojeIso } from './dates';
import { resumirMetas, type ResumoMetas } from './metas';
import { agruparColheitas, realCampo, type RealCampo } from './realizado';
import { gerarAlertas, resumoCampo, type Alerta, type Resumo } from './status';
import type { NovaColheita, NovaDessecacao, NovaMeta, NovaProgramacao, NovoTecnico, Store } from './store';
import { CONFIG_PADRAO, type Campo, type CampoPlanilha, type Config, type Dados, type Dessecacao, type MetaCultivar, type Programacao, type Tecnico } from './types';

export interface Aviso {
  id: number;
  texto: string;
  tipo: 'ok' | 'erro';
}

interface Ctx {
  store: Store;
  dados: Dados;
  hoje: string;
  campoPorId: Map<string, Campo>;
  tecnicoPorId: Map<string, Tecnico>;
  dessPorCampo: Map<string, Dessecacao[]>;
  resumos: Map<string, Resumo>;
  provaveis: Map<string, string | null>;
  /** colheita real de cada campo: volume lançado, aproveitamento e o que falta colher */
  reais: Map<string, RealCampo>;
  /** metas por cultivar × internalizado × o que ainda há para colher */
  resumoMetas: ResumoMetas;
  alertas: Alerta[];
  avisar: (texto: string, tipo?: Aviso['tipo']) => void;
  recarregar: () => Promise<void>;
  salvarTecnico: (t: NovoTecnico) => Promise<Tecnico | null>;
  excluirTecnico: (id: string) => Promise<boolean>;
  importarCampos: (cs: CampoPlanilha[]) => Promise<Campo[] | null>;
  atualizarCampos: (ids: string[], patch: Partial<Campo>, msg?: string) => Promise<boolean>;
  excluirCampo: (id: string) => Promise<boolean>;
  salvarDessecacoes: (ds: NovaDessecacao[]) => Promise<boolean>;
  excluirDessecacao: (id: string) => Promise<boolean>;
  salvarProgramacoes: (ps: NovaProgramacao[], msg?: string) => Promise<boolean>;
  atualizarProgramacao: (id: string, patch: Partial<Programacao>, msg?: string) => Promise<boolean>;
  excluirProgramacao: (id: string) => Promise<boolean>;
  salvarColheitas: (cs: NovaColheita[], msg?: string) => Promise<boolean>;
  excluirColheita: (id: string) => Promise<boolean>;
  salvarMeta: (m: NovaMeta, msg?: string) => Promise<MetaCultivar | null>;
  excluirMeta: (id: string) => Promise<boolean>;
  salvarConfig: (c: Config) => void;
}

const Contexto = createContext<Ctx | null>(null);

export function useDados(): Ctx {
  const c = useContext(Contexto);
  if (!c) throw new Error('useDados fora do provedor');
  return c;
}

const troca = <T extends { id: string }>(lista: T[], novos: T[]): T[] => {
  const m = new Map(novos.map((n) => [n.id, n]));
  const out = lista.map((x) => m.get(x.id) ?? x);
  const ids = new Set(lista.map((x) => x.id));
  for (const n of novos) if (!ids.has(n.id)) out.push(n);
  return out;
};

export function ProvedorDados({ store, children, onSair }: { store: Store; children: ReactNode; onSair?: () => void }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [hoje, setHoje] = useState(hojeIso());
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const seq = useRef(0);
  const cfgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = useCallback((texto: string, tipo: Aviso['tipo'] = 'ok') => {
    const id = ++seq.current;
    setAvisos((a) => [...a.slice(-3), { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'erro' ? 7000 : 3200);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      setDados(await store.carregar());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, [store]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  // vira o dia sozinho quando a aba volta a ficar visível
  useEffect(() => {
    const f = () => setHoje(hojeIso());
    window.addEventListener('focus', f);
    document.addEventListener('visibilitychange', f);
    const t = setInterval(f, 60000);
    return () => {
      window.removeEventListener('focus', f);
      document.removeEventListener('visibilitychange', f);
      clearInterval(t);
    };
  }, []);

  const tentar = useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | null> => {
      try {
        const r = await fn();
        if (ok) avisar(ok);
        return r;
      } catch (e) {
        avisar(e instanceof Error ? e.message : String(e), 'erro');
        return null;
      }
    },
    [avisar],
  );

  const derivados = useMemo(() => {
    const d = dados ?? { tecnicos: [], campos: [], dessecacoes: [], programacoes: [], colheitas: [], metas: [], config: CONFIG_PADRAO };
    const campoPorId = new Map(d.campos.map((c) => [c.id, c]));
    const tecnicoPorId = new Map(d.tecnicos.map((t) => [t.id, t]));
    const dessPorCampo = new Map<string, Dessecacao[]>();
    for (const x of d.dessecacoes) {
      if (!dessPorCampo.has(x.campo_id)) dessPorCampo.set(x.campo_id, []);
      dessPorCampo.get(x.campo_id)!.push(x);
    }
    const resumos = new Map<string, Resumo>();
    const provaveis = new Map<string, string | null>();
    for (const c of d.campos) {
      const r = resumoCampo(c, dessPorCampo.get(c.id) ?? [], hoje);
      resumos.set(c.id, r);
      provaveis.set(c.id, r.provavel);
    }
    const lanc = agruparColheitas(d.colheitas);
    const reais = new Map(d.campos.map((c) => [c.id, realCampo(c, lanc.get(c.id) ?? [], d.config.params)]));
    const resumoMetas = resumirMetas(d.campos, reais, d.metas, d.config.params, d.config.metas);
    return { campoPorId, tecnicoPorId, dessPorCampo, resumos, provaveis, reais, resumoMetas };
  }, [dados, hoje]);

  const alertas = useMemo(
    () =>
      dados
        ? gerarAlertas(dados.campos, dados.dessecacoes, dados.programacoes, dados.tecnicos, hoje, dados.config.avisoDias)
        : [],
    [dados, hoje],
  );

  if (erro && !dados) {
    return (
      <div className="tela-centro">
        <div className="card" style={{ maxWidth: 520 }}>
          <h2>Não foi possível carregar os dados</h2>
          <p className="sub">{erro}</p>
          <div className="btns" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => void recarregar()}>Tentar de novo</button>
            {onSair && <button className="btn" onClick={onSair}>Sair</button>}
          </div>
        </div>
      </div>
    );
  }
  if (!dados) return <div className="tela-centro"><div className="muted">Carregando…</div></div>;

  const mut = (f: (d: Dados) => Dados) => setDados((d) => (d ? f(d) : d));

  const ctx: Ctx = {
    store, dados, hoje, ...derivados, alertas, avisar, recarregar,
    salvarTecnico: async (t) => {
      const r = await tentar(() => store.salvarTecnico(t), 'Técnico salvo.');
      if (r) mut((d) => ({ ...d, tecnicos: troca(d.tecnicos, [r]).sort((a, b) => a.nome.localeCompare(b.nome, 'pt')) }));
      return r;
    },
    excluirTecnico: async (id) => {
      const r = await tentar(async () => (await store.excluirTecnico(id), true), 'Técnico excluído.');
      if (r) mut((d) => ({ ...d, tecnicos: d.tecnicos.filter((t) => t.id !== id), programacoes: d.programacoes.filter((p) => p.tecnico_id !== id) }));
      return !!r;
    },
    importarCampos: async (cs) => {
      // planilha sem coordenada não apaga a que foi preenchida aqui no sistema
      const atuais = new Map(dados.campos.map((c) => [c.chave, c]));
      const comCoord = cs.map((c) => {
        const a = atuais.get(c.chave);
        return c.latitude == null && a?.latitude != null && a.longitude != null ? { ...c, latitude: a.latitude, longitude: a.longitude } : c;
      });
      const r = await tentar(() => store.importarCampos(comCoord));
      if (r) mut((d) => ({ ...d, campos: troca(d.campos, r) }));
      return r;
    },
    atualizarCampos: async (ids, patch, msg) => {
      const r = await tentar(() => store.atualizarCampos(ids, patch), msg);
      if (r) mut((d) => ({ ...d, campos: troca(d.campos, r) }));
      return !!r;
    },
    excluirCampo: async (id) => {
      const r = await tentar(async () => (await store.excluirCampo(id), true), 'Campo excluído.');
      if (r) {
        mut((d) => ({
          ...d,
          campos: d.campos.filter((c) => c.id !== id),
          dessecacoes: d.dessecacoes.filter((x) => x.campo_id !== id),
          programacoes: d.programacoes.filter((x) => x.campo_id !== id),
          colheitas: d.colheitas.filter((x) => x.campo_id !== id),
        }));
      }
      return !!r;
    },
    salvarDessecacoes: async (ds) => {
      const r = await tentar(() => store.salvarDessecacoes(ds), 'Dessecação registrada.');
      if (r) mut((d) => ({ ...d, dessecacoes: troca(d.dessecacoes, r) }));
      return !!r;
    },
    excluirDessecacao: async (id) => {
      const r = await tentar(async () => (await store.excluirDessecacao(id), true), 'Dessecação excluída.');
      if (r) mut((d) => ({ ...d, dessecacoes: d.dessecacoes.filter((x) => x.id !== id) }));
      return !!r;
    },
    salvarProgramacoes: async (ps, msg = 'Programação salva.') => {
      const r = await tentar(() => store.salvarProgramacoes(ps), msg);
      if (r) mut((d) => ({ ...d, programacoes: troca(d.programacoes, r) }));
      return !!r;
    },
    atualizarProgramacao: async (id, patch, msg) => {
      const r = await tentar(() => store.atualizarProgramacao(id, patch), msg);
      if (r) mut((d) => ({ ...d, programacoes: troca(d.programacoes, [r]) }));
      return !!r;
    },
    excluirProgramacao: async (id) => {
      const r = await tentar(async () => (await store.excluirProgramacao(id), true), 'Programação removida.');
      if (r) mut((d) => ({ ...d, programacoes: d.programacoes.filter((x) => x.id !== id) }));
      return !!r;
    },
    salvarColheitas: async (cs, msg = 'Volume colhido lançado.') => {
      const r = await tentar(() => store.salvarColheitas(cs), msg);
      if (r) mut((d) => ({ ...d, colheitas: troca(d.colheitas, r) }));
      return !!r;
    },
    excluirColheita: async (id) => {
      const r = await tentar(async () => (await store.excluirColheita(id), true), 'Lançamento excluído.');
      if (r) mut((d) => ({ ...d, colheitas: d.colheitas.filter((x) => x.id !== id) }));
      return !!r;
    },
    salvarMeta: async (m, msg = 'Meta salva.') => {
      const r = await tentar(() => store.salvarMeta(m), msg);
      if (r) mut((d) => ({ ...d, metas: troca(d.metas, [r]) }));
      return r;
    },
    excluirMeta: async (id) => {
      const r = await tentar(async () => (await store.excluirMeta(id), true), 'Meta excluída.');
      if (r) mut((d) => ({ ...d, metas: d.metas.filter((x) => x.id !== id) }));
      return !!r;
    },
    // parâmetros mudam a cada tecla: atualiza a tela na hora e grava com pequeno atraso
    salvarConfig: (c) => {
      mut((d) => ({ ...d, config: c }));
      if (cfgTimer.current) clearTimeout(cfgTimer.current);
      cfgTimer.current = setTimeout(() => void tentar(() => store.salvarConfig(c)), 600);
    },
  };

  return (
    <Contexto.Provider value={ctx}>
      {children}
      <div className="avisos" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={'aviso ' + a.tipo}>{a.texto}</div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

// Camada de dados. Duas implementações com a mesma interface:
//  - Supabase (produção): tabelas dos arquivos em supabase/migrations/;
//  - demonstração: dados fictícios guardados no navegador (localStorage).
import type { SupabaseClient } from '@supabase/supabase-js';
import { dataProvavel } from './dates';
import { dadosDemo } from './demoData';
import { chaveCultivar } from './metas';
import {
  CONFIG_PADRAO, CONTROLE_PADRAO,
  type Campo, type CampoPlanilha, type ColheitaDia, type Config, type Dados, type Dessecacao, type MetaCultivar, type Programacao,
  type Tecnico,
} from './types';

export type NovoTecnico = Omit<Tecnico, 'id' | 'created_at'> & { id?: string };
export type NovaDessecacao = Pick<Dessecacao, 'campo_id' | 'data' | 'area_ha' | 'dias_para_colheita' | 'observacoes'> & { id?: string };
export type NovaProgramacao = Pick<Programacao, 'data' | 'tecnico_id' | 'campo_id' | 'atividade' | 'observacoes'> & {
  status?: Programacao['status'];
};
export type NovaColheita = Pick<ColheitaDia, 'campo_id' | 'data' | 'colhido_kg' | 'aprovado_kg' | 'area_ha' | 'observacoes'> & { id?: string };
export type NovaMeta = Omit<MetaCultivar, 'id' | 'created_at'>;

export interface Store {
  modo: 'supabase' | 'demo';
  carregar(): Promise<Dados>;
  salvarTecnico(t: NovoTecnico): Promise<Tecnico>;
  excluirTecnico(id: string): Promise<void>;
  /** grava os campos da planilha pela chave, preservando o controle operacional */
  importarCampos(cs: CampoPlanilha[]): Promise<Campo[]>;
  atualizarCampos(ids: string[], patch: Partial<Campo>): Promise<Campo[]>;
  excluirCampo(id: string): Promise<void>;
  salvarDessecacoes(ds: NovaDessecacao[]): Promise<Dessecacao[]>;
  excluirDessecacao(id: string): Promise<void>;
  /** grava por (data, técnico, campo): repetir a mesma combinação atualiza */
  salvarProgramacoes(ps: NovaProgramacao[]): Promise<Programacao[]>;
  atualizarProgramacao(id: string, patch: Partial<Programacao>): Promise<Programacao>;
  excluirProgramacao(id: string): Promise<void>;
  /** lançamentos de volume colhido: sem id cria, com id corrige */
  salvarColheitas(cs: NovaColheita[]): Promise<ColheitaDia[]>;
  excluirColheita(id: string): Promise<void>;
  /** grava a meta pelo nome da cultivar: repetir a mesma cultivar atualiza */
  salvarMeta(m: NovaMeta): Promise<MetaCultivar>;
  excluirMeta(id: string): Promise<void>;
  salvarConfig(c: Config): Promise<void>;
}

export function mesclarConfig(bruto: unknown): Config {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Partial<Config>;
  const faixas = Array.isArray(b.faixas)
    ? [...new Set(b.faixas.map(Number).filter((n) => Number.isFinite(n) && n > 0))].sort((x, y) => x - y)
    : [];
  return {
    params: { ...CONFIG_PADRAO.params, ...(b.params ?? {}) },
    ubs: { ...CONFIG_PADRAO.ubs, ...(b.ubs ?? {}) },
    faixas: faixas.length ? faixas : CONFIG_PADRAO.faixas,
    avisoDias: Number.isFinite(b.avisoDias) && (b.avisoDias as number) >= 1 ? Math.round(b.avisoDias as number) : CONFIG_PADRAO.avisoDias,
    metas: { ...CONFIG_PADRAO.metas, ...(b.metas ?? {}) },
  };
}

/** Colunas que a importação pode gravar. O controle operacional (dessecação, colheita, ajustes) nunca é sobrescrito. */
const COLUNAS_PLANILHA: (keyof CampoPlanilha)[] = [
  'chave', 'num_campo', 'cliente', 'propriedade', 'cidade', 'uf', 'produto', 'obtentor', 'biotec', 'peneira', 'categoria_plantada',
  'categoria_colher', 'tipo_contrato', 'vendedor', 'uso_semente', 'proprio_terceiro', 'acao', 'autorizacao', 'contrato', 'talhao',
  'data_plantio', 'ciclo', 'data_colheita_prevista', 'data_floracao', 'area_mapa', 'area_projetada', 'area_real', 'expectativa_sc',
  'toneladas_mapa', 'latitude', 'longitude', 'linhas',
];
export function soPlanilha(c: CampoPlanilha): CampoPlanilha {
  const o: Record<string, unknown> = {};
  for (const k of COLUNAS_PLANILHA) o[k] = c[k];
  return o as unknown as CampoPlanilha;
}

const lotes = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/* ------------------------------------------------------------------ Supabase */
export class SupabaseStore implements Store {
  modo = 'supabase' as const;
  constructor(private sb: SupabaseClient) {}

  private async todos<T>(tabela: string, ordem: string): Promise<T[]> {
    const out: T[] = [];
    const passo = 1000;
    for (let de = 0; ; de += passo) {
      const { data, error } = await this.sb.from(tabela).select('*').order(ordem).order('id').range(de, de + passo - 1);
      if (error) throw new Error(erroPt(error.message));
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < passo) break;
    }
    return out;
  }

  async carregar(): Promise<Dados> {
    // o banco só mostra dados a e-mails da tabela usuarios_liberados; sem isso tudo viria vazio
    const lib = await this.sb.rpc('usuario_liberado');
    if (lib.error) throw new Error(erroPt(lib.error.message));
    if (lib.data !== true) {
      throw new Error(
        'Seu e-mail ainda não está liberado para usar o sistema. Peça ao administrador para incluí-lo na tabela "usuarios_liberados" do Supabase.',
      );
    }
    // as tabelas da migração 0002 podem ainda não existir: o resto do sistema continua funcionando
    let faltaMigracao = false;
    const opcional = async <T,>(tabela: string, ordem: string): Promise<T[]> => {
      try {
        return await this.todos<T>(tabela, ordem);
      } catch (e) {
        if (!(e instanceof Error) || e.message !== SEM_TABELAS) throw e;
        faltaMigracao = true;
        return [];
      }
    };
    const [tecnicos, campos, dessecacoes, programacoes, colheitas, metas, cfg] = await Promise.all([
      this.todos<Tecnico>('tecnicos', 'nome'),
      this.todos<Campo>('campos', 'num_campo'),
      this.todos<Dessecacao>('dessecacoes', 'data'),
      this.todos<Programacao>('programacoes', 'data'),
      opcional<ColheitaDia>('colheitas_diarias', 'data'),
      opcional<MetaCultivar>('metas_cultivar', 'cultivar'),
      this.sb.from('configuracoes').select('dados').eq('id', 1).maybeSingle(),
    ]);
    if (cfg.error) throw new Error(erroPt(cfg.error.message));
    if (campos.length && !('prod_real_sc_ha' in campos[0])) faltaMigracao = true;
    return {
      tecnicos, dessecacoes, programacoes, colheitas, metas, faltaMigracao,
      campos: campos.map((c) => ({ ...c, prod_real_sc_ha: c.prod_real_sc_ha ?? null })),
      config: mesclarConfig(cfg.data?.dados),
    };
  }

  async salvarTecnico(t: NovoTecnico): Promise<Tecnico> {
    const { id, ...resto } = t;
    const q = id ? this.sb.from('tecnicos').update(resto).eq('id', id) : this.sb.from('tecnicos').insert(resto);
    const { data, error } = await q.select().single();
    if (error) throw new Error(erroPt(error.message));
    return data as Tecnico;
  }
  async excluirTecnico(id: string): Promise<void> {
    const { error } = await this.sb.from('tecnicos').delete().eq('id', id);
    if (error) throw new Error(erroPt(error.message));
  }

  async importarCampos(cs: CampoPlanilha[]): Promise<Campo[]> {
    const out: Campo[] = [];
    for (const lote of lotes(cs.map(soPlanilha), 200)) {
      const { data, error } = await this.sb.from('campos').upsert(lote, { onConflict: 'chave' }).select();
      if (error) throw new Error(erroPt(error.message));
      out.push(...((data ?? []) as Campo[]));
    }
    return out;
  }
  async atualizarCampos(ids: string[], patch: Partial<Campo>): Promise<Campo[]> {
    const out: Campo[] = [];
    for (const lote of lotes(ids, 200)) {
      const { data, error } = await this.sb.from('campos').update(patch).in('id', lote).select();
      if (error) throw new Error(erroPt(error.message));
      out.push(...((data ?? []) as Campo[]));
    }
    return out;
  }
  async excluirCampo(id: string): Promise<void> {
    const { error } = await this.sb.from('campos').delete().eq('id', id);
    if (error) throw new Error(erroPt(error.message));
  }

  async salvarDessecacoes(ds: NovaDessecacao[]): Promise<Dessecacao[]> {
    const novos = ds.filter((d) => !d.id).map(({ id: _i, ...r }) => r);
    const editados = ds.filter((d) => d.id);
    const out: Dessecacao[] = [];
    if (novos.length) {
      const { data, error } = await this.sb.from('dessecacoes').insert(novos).select();
      if (error) throw new Error(erroPt(error.message));
      out.push(...((data ?? []) as Dessecacao[]));
    }
    for (const { id, ...r } of editados) {
      const { data, error } = await this.sb.from('dessecacoes').update(r).eq('id', id!).select().single();
      if (error) throw new Error(erroPt(error.message));
      out.push(data as Dessecacao);
    }
    return out;
  }
  async excluirDessecacao(id: string): Promise<void> {
    const { error } = await this.sb.from('dessecacoes').delete().eq('id', id);
    if (error) throw new Error(erroPt(error.message));
  }

  async salvarProgramacoes(ps: NovaProgramacao[]): Promise<Programacao[]> {
    if (!ps.length) return [];
    const { data, error } = await this.sb
      .from('programacoes')
      .upsert(ps.map((p) => ({ status: 'planejado', ...p })), { onConflict: 'data,tecnico_id,campo_id' })
      .select();
    if (error) throw new Error(erroPt(error.message));
    return (data ?? []) as Programacao[];
  }
  async atualizarProgramacao(id: string, patch: Partial<Programacao>): Promise<Programacao> {
    const { data, error } = await this.sb.from('programacoes').update(patch).eq('id', id).select().single();
    if (error) throw new Error(erroPt(error.message));
    return data as Programacao;
  }
  async excluirProgramacao(id: string): Promise<void> {
    const { error } = await this.sb.from('programacoes').delete().eq('id', id);
    if (error) throw new Error(erroPt(error.message));
  }

  async salvarColheitas(cs: NovaColheita[]): Promise<ColheitaDia[]> {
    const novos = cs.filter((c) => !c.id).map(({ id: _i, ...r }) => r);
    const out: ColheitaDia[] = [];
    if (novos.length) {
      const { data, error } = await this.sb.from('colheitas_diarias').insert(novos).select();
      if (error) throw new Error(erroPt(error.message));
      out.push(...((data ?? []) as ColheitaDia[]));
    }
    for (const { id, ...r } of cs.filter((c) => c.id)) {
      const { data, error } = await this.sb.from('colheitas_diarias').update(r).eq('id', id!).select().single();
      if (error) throw new Error(erroPt(error.message));
      out.push(data as ColheitaDia);
    }
    return out;
  }
  async excluirColheita(id: string): Promise<void> {
    const { error } = await this.sb.from('colheitas_diarias').delete().eq('id', id);
    if (error) throw new Error(erroPt(error.message));
  }

  async salvarMeta(m: NovaMeta): Promise<MetaCultivar> {
    const { data, error } = await this.sb.from('metas_cultivar').upsert(m, { onConflict: 'cultivar' }).select().single();
    if (error) throw new Error(erroPt(error.message));
    return data as MetaCultivar;
  }
  async excluirMeta(id: string): Promise<void> {
    const { error } = await this.sb.from('metas_cultivar').delete().eq('id', id);
    if (error) throw new Error(erroPt(error.message));
  }

  async salvarConfig(c: Config): Promise<void> {
    const { error } = await this.sb.from('configuracoes').upsert({ id: 1, dados: c });
    if (error) throw new Error(erroPt(error.message));
  }
}

export const SEM_TABELAS =
  'O banco do Supabase está sem as tabelas mais recentes. No SQL Editor, rode os arquivos da pasta supabase/migrations (0001_schema.sql e 0002_colheita_real_e_metas.sql).';

function erroPt(msg: string): string {
  if (/relation .* does not exist|schema cache|could not find the function|column .* does not exist/i.test(msg)) return SEM_TABELAS;
  if (/row-level security|permission denied/i.test(msg)) return 'Sem permissão para gravar. Faça login novamente.';
  if (/duplicate key/i.test(msg)) return 'Já existe um registro igual (mesmo técnico, campo e dia).';
  if (/failed to fetch|network/i.test(msg)) return 'Sem conexão com o Supabase. Confira a internet e tente de novo.';
  return msg;
}

/* -------------------------------------------------------------- demonstração */
const CHAVE_LS = 'ctc_demo_v1';
const uid = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

export class DemoStore implements Store {
  modo = 'demo' as const;
  private d: Dados;

  constructor(private mem: Pick<Storage, 'getItem' | 'setItem'> | null, semente?: Dados) {
    let salvo: Dados | null = null;
    try {
      const s = mem?.getItem(CHAVE_LS);
      if (s) salvo = JSON.parse(s) as Dados;
    } catch {
      salvo = null;
    }
    this.d = completar(salvo ?? semente ?? dadosDemo());
    if (!salvo) this.gravar();
  }
  private gravar(): void {
    try {
      this.mem?.setItem(CHAVE_LS, JSON.stringify(this.d));
    } catch {
      /* armazenamento cheio ou bloqueado: segue só em memória */
    }
  }
  /** troca todos os dados (usado por "restaurar demonstração" e "começar vazio") */
  substituir(d: Dados): void {
    this.d = completar(d);
    this.gravar();
  }
  private copia<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
  }

  async carregar(): Promise<Dados> {
    return this.copia(this.d);
  }
  async salvarTecnico(t: NovoTecnico): Promise<Tecnico> {
    let reg: Tecnico;
    if (t.id) {
      const i = this.d.tecnicos.findIndex((x) => x.id === t.id);
      if (i < 0) throw new Error('Técnico não encontrado.');
      reg = this.d.tecnicos[i] = { ...this.d.tecnicos[i], ...t, id: t.id };
    } else {
      reg = { ...t, id: uid(), created_at: new Date().toISOString() };
      this.d.tecnicos.push(reg);
    }
    this.gravar();
    return this.copia(reg);
  }
  async excluirTecnico(id: string): Promise<void> {
    this.d.tecnicos = this.d.tecnicos.filter((t) => t.id !== id);
    this.d.programacoes = this.d.programacoes.filter((p) => p.tecnico_id !== id);
    this.gravar();
  }
  async importarCampos(cs: CampoPlanilha[]): Promise<Campo[]> {
    const out: Campo[] = [];
    for (const c of cs.map(soPlanilha)) {
      const i = this.d.campos.findIndex((x) => x.chave === c.chave);
      if (i >= 0) out.push((this.d.campos[i] = { ...this.d.campos[i], ...c }));
      else {
        const novo: Campo = { ...CONTROLE_PADRAO, ...c, id: uid() };
        this.d.campos.push(novo);
        out.push(novo);
      }
    }
    this.gravar();
    return this.copia(out);
  }
  async atualizarCampos(ids: string[], patch: Partial<Campo>): Promise<Campo[]> {
    const alvo = new Set(ids);
    const out: Campo[] = [];
    this.d.campos = this.d.campos.map((c) => {
      if (!alvo.has(c.id)) return c;
      const n = { ...c, ...patch, id: c.id };
      out.push(n);
      return n;
    });
    this.gravar();
    return this.copia(out);
  }
  async excluirCampo(id: string): Promise<void> {
    this.d.campos = this.d.campos.filter((c) => c.id !== id);
    this.d.dessecacoes = this.d.dessecacoes.filter((x) => x.campo_id !== id);
    this.d.programacoes = this.d.programacoes.filter((x) => x.campo_id !== id);
    this.d.colheitas = this.d.colheitas.filter((x) => x.campo_id !== id);
    this.gravar();
  }
  async salvarDessecacoes(ds: NovaDessecacao[]): Promise<Dessecacao[]> {
    const out: Dessecacao[] = [];
    for (const d of ds) {
      const calc = { ...d, data_provavel_colheita: dataProvavel(d.data, d.dias_para_colheita) };
      if (d.id) {
        const i = this.d.dessecacoes.findIndex((x) => x.id === d.id);
        if (i < 0) throw new Error('Dessecação não encontrada.');
        out.push((this.d.dessecacoes[i] = { ...this.d.dessecacoes[i], ...calc, id: d.id }));
      } else {
        const novo: Dessecacao = { ...calc, id: uid(), created_at: new Date().toISOString() };
        this.d.dessecacoes.push(novo);
        out.push(novo);
      }
    }
    this.gravar();
    return this.copia(out);
  }
  async excluirDessecacao(id: string): Promise<void> {
    this.d.dessecacoes = this.d.dessecacoes.filter((x) => x.id !== id);
    this.gravar();
  }
  async salvarProgramacoes(ps: NovaProgramacao[]): Promise<Programacao[]> {
    const out: Programacao[] = [];
    for (const p of ps) {
      const i = this.d.programacoes.findIndex(
        (x) => x.data === p.data && x.tecnico_id === p.tecnico_id && x.campo_id === p.campo_id,
      );
      if (i >= 0) out.push((this.d.programacoes[i] = { ...this.d.programacoes[i], ...p }));
      else {
        const novo: Programacao = { status: 'planejado', ...p, id: uid(), created_at: new Date().toISOString() };
        this.d.programacoes.push(novo);
        out.push(novo);
      }
    }
    this.gravar();
    return this.copia(out);
  }
  async atualizarProgramacao(id: string, patch: Partial<Programacao>): Promise<Programacao> {
    const i = this.d.programacoes.findIndex((x) => x.id === id);
    if (i < 0) throw new Error('Programação não encontrada.');
    const novo = { ...this.d.programacoes[i], ...patch, id };
    // mesma regra do banco: um técnico não pode ter o mesmo campo duas vezes no mesmo dia
    if (this.d.programacoes.some((x) => x.id !== id && x.data === novo.data && x.tecnico_id === novo.tecnico_id && x.campo_id === novo.campo_id)) {
      throw new Error('Já existe um registro igual (mesmo técnico, campo e dia).');
    }
    this.d.programacoes[i] = novo;
    this.gravar();
    return this.copia(this.d.programacoes[i]);
  }
  async excluirProgramacao(id: string): Promise<void> {
    this.d.programacoes = this.d.programacoes.filter((x) => x.id !== id);
    this.gravar();
  }
  async salvarColheitas(cs: NovaColheita[]): Promise<ColheitaDia[]> {
    const out: ColheitaDia[] = [];
    for (const c of cs) {
      if (c.id) {
        const i = this.d.colheitas.findIndex((x) => x.id === c.id);
        if (i < 0) throw new Error('Lançamento não encontrado.');
        out.push((this.d.colheitas[i] = { ...this.d.colheitas[i], ...c, id: c.id }));
      } else {
        const novo: ColheitaDia = { ...c, id: uid(), created_at: new Date().toISOString() };
        this.d.colheitas.push(novo);
        out.push(novo);
      }
    }
    this.gravar();
    return this.copia(out);
  }
  async excluirColheita(id: string): Promise<void> {
    this.d.colheitas = this.d.colheitas.filter((x) => x.id !== id);
    this.gravar();
  }
  async salvarMeta(m: NovaMeta): Promise<MetaCultivar> {
    const i = this.d.metas.findIndex((x) => chaveCultivar(x.cultivar) === chaveCultivar(m.cultivar));
    let reg: MetaCultivar;
    if (i >= 0) reg = this.d.metas[i] = { ...this.d.metas[i], ...m };
    else {
      reg = { ...m, id: uid(), created_at: new Date().toISOString() };
      this.d.metas.push(reg);
    }
    this.gravar();
    return this.copia(reg);
  }
  async excluirMeta(id: string): Promise<void> {
    this.d.metas = this.d.metas.filter((x) => x.id !== id);
    this.gravar();
  }
  async salvarConfig(c: Config): Promise<void> {
    this.d.config = mesclarConfig(c);
    this.gravar();
  }
}

/** Dados salvos por uma versão anterior não têm as listas e colunas novas. */
function completar(d: Dados): Dados {
  return {
    ...d,
    campos: (d.campos ?? []).map((c) => ({ ...c, prod_real_sc_ha: c.prod_real_sc_ha ?? null })),
    colheitas: d.colheitas ?? [],
    metas: d.metas ?? [],
    config: mesclarConfig(d.config),
  };
}

export type Atividade = 'colheita_pre' | 'coleta_pre';
export type StatusProg = 'planejado' | 'realizado' | 'cancelado';

export interface Tecnico {
  id: string;
  nome: string;
  telefone: string | null;
  cidade_base: string | null;
  funcao: string | null;
  cor: string;
  ativo: boolean;
  observacoes: string | null;
  created_at?: string;
}

/** Linha original da planilha que compõe um campo (sem CPF/CNPJ/IE). */
export interface LinhaOrigem {
  pedido: string | null;
  codigo_produto: string | null;
  peneira: string | null;
  talhao: string | null;
  propriedade: string | null;
  categoria_plantada: string | null;
  tratamento: string | null;
  data_plantio: string | null;
  data_colheita: string | null;
  area_mapa: number;
  area_projetada: number;
  area_real: number;
  expectativa_sc: number;
}

/** Colunas que vêm da planilha (são atualizadas a cada importação). */
export interface CampoPlanilha {
  chave: string;
  num_campo: string;
  cliente: string | null;
  propriedade: string | null;
  cidade: string | null;
  uf: string | null;
  produto: string | null;
  obtentor: string | null;
  biotec: string | null;
  peneira: string | null;
  categoria_plantada: string | null;
  categoria_colher: string | null;
  tipo_contrato: string | null;
  vendedor: string | null;
  uso_semente: string | null;
  proprio_terceiro: string | null;
  acao: string | null;
  autorizacao: string | null;
  contrato: string | null;
  talhao: string | null;
  data_plantio: string | null;
  ciclo: number | null;
  data_colheita_prevista: string | null;
  data_floracao: string | null;
  area_mapa: number;
  area_projetada: number;
  area_real: number;
  expectativa_sc: number;
  toneladas_mapa: number;
  latitude: number | null;
  longitude: number | null;
  linhas: LinhaOrigem[];
}

/** Colunas de controle operacional (preservadas ao reimportar). */
export interface CampoControle {
  colheita_inicio: string | null;
  colheita_fim: string | null;
  incluir_projecao: boolean;
  ov_inicio: string | null;
  ov_ha_dia: number | null;
  ov_sc_ha: number | null;
  ov_aprov: number | null;
  /** produtividade geral da área informada pelo produtor (sc/ha) */
  prod_real_sc_ha: number | null;
  ativo: boolean;
  observacoes: string | null;
}

export interface Campo extends CampoPlanilha, CampoControle {
  id: string;
}

export interface Dessecacao {
  id: string;
  campo_id: string;
  data: string;
  area_ha: number | null;
  dias_para_colheita: number | null;
  data_provavel_colheita: string | null;
  observacoes: string | null;
  created_at?: string;
}

export interface Programacao {
  id: string;
  data: string;
  tecnico_id: string;
  campo_id: string;
  atividade: Atividade;
  status: StatusProg;
  observacoes: string | null;
  created_at?: string;
}

/** Lançamento de volume colhido em um dia (pode haver mais de um por dia, ex.: por carga). */
export interface ColheitaDia {
  id: string;
  campo_id: string;
  data: string;
  /** volume colhido no dia e entregue na UBS (kg) */
  colhido_kg: number;
  /** volume aprovado e internalizado na UBS (kg); null = todo o volume colhido foi aprovado */
  aprovado_kg: number | null;
  /** área colhida no dia (ha), opcional */
  area_ha: number | null;
  observacoes: string | null;
  created_at?: string;
}

/** Meta de produção de uma cultivar (aba Metas). */
export interface MetaCultivar {
  id: string;
  cultivar: string;
  /** semente pronta planejada, em sacos de 200 mil sementes (big bags × sacos por big bag) */
  meta_sc200: number | null;
  /** peso de mil sementes (g); null = usa o padrão da aba */
  pms_g: number | null;
  /** rendimento do beneficiamento na UBS (%); null = usa o padrão da aba */
  rend_ubs: number | null;
  /** meta de internalização digitada à mão (sc 60 kg); quando preenchida, vale no lugar do cálculo */
  meta_intern_sc: number | null;
  /** big bags já prontos: beneficiados na UBS e em tolling */
  bb_ubs: number | null;
  bb_tolling: number | null;
  observacoes: string | null;
  created_at?: string;
}

export interface ParametrosMetas {
  /** sacos de 200 mil sementes em um big bag */
  sc200PorBB: number;
  /** peso de mil sementes padrão (g) */
  pms: number;
  /** rendimento padrão do beneficiamento: semente pronta ÷ matéria-prima internalizada (%) */
  rendUbs: number;
}

export type AreaBase = 'area_mapa' | 'area_projetada' | 'area_real';

export interface Parametros {
  haDia: number;
  scHa: number;
  aprov: number;
  kg: number;
  area: AreaBase;
  desloc: number;
  cap: number;
  pres: string;
  grupo: string;
}

export interface Config {
  params: Parametros;
  ubs: { nome: string; lat: number; lng: number };
  faixas: number[];
  avisoDias: number;
  metas: ParametrosMetas;
}

export const CONFIG_PADRAO: Config = {
  params: { haDia: 120, scHa: 65, aprov: 70, kg: 60, area: 'area_mapa', desloc: 0, cap: 0, pres: '', grupo: 'produto' },
  ubs: { nome: 'UBS Rio Verde', lat: -17.494824, lng: -51.600491 },
  faixas: [10, 20, 50, 100, 200, 300],
  avisoDias: 1,
  metas: { sc200PorBB: 25, pms: 180, rendUbs: 75 },
};

export const CONTROLE_PADRAO: CampoControle = {
  colheita_inicio: null,
  colheita_fim: null,
  incluir_projecao: true,
  ov_inicio: null,
  ov_ha_dia: null,
  ov_sc_ha: null,
  ov_aprov: null,
  prod_real_sc_ha: null,
  ativo: true,
  observacoes: null,
};

export const ATIVIDADES: Record<Atividade, { curto: string; longo: string }> = {
  colheita_pre: { curto: 'Colher + retirar pré-colheita', longo: 'COLHER E RETIRAR PRÉ-COLHEITA' },
  coleta_pre: { curto: 'Passar pegando pré-colheita', longo: 'PASSAR PEGANDO PRÉ-COLHEITA' },
};

export const STATUS_PROG: Record<StatusProg, string> = { planejado: 'Planejado', realizado: 'Concluído', cancelado: 'Cancelado' };

export interface Dados {
  tecnicos: Tecnico[];
  campos: Campo[];
  dessecacoes: Dessecacao[];
  programacoes: Programacao[];
  colheitas: ColheitaDia[];
  metas: MetaCultivar[];
  config: Config;
  /** true quando o banco ainda não recebeu supabase/migrations/0002 (volume colhido e metas ficam desligados) */
  faltaMigracao?: boolean;
}

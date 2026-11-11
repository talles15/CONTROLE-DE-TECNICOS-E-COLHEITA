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
}

export const CONFIG_PADRAO: Config = {
  params: { haDia: 120, scHa: 65, aprov: 70, kg: 60, area: 'area_mapa', desloc: 0, cap: 0, pres: '', grupo: 'produto' },
  ubs: { nome: 'UBS Rio Verde', lat: -17.494824, lng: -51.600491 },
  faixas: [10, 20, 50, 100, 200, 300],
  avisoDias: 1,
};

export const CONTROLE_PADRAO: CampoControle = {
  colheita_inicio: null,
  colheita_fim: null,
  incluir_projecao: true,
  ov_inicio: null,
  ov_ha_dia: null,
  ov_sc_ha: null,
  ov_aprov: null,
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
  config: Config;
}

-- Controle de Técnicos e Colheita — descarte de campos
-- Como usar: Supabase > SQL Editor > New query > colar este arquivo inteiro > Run.
-- Rode DEPOIS do 0001_schema.sql e do 0002_colheita_real_e_metas.sql.
-- Pode ser executado mais de uma vez sem perder dados.

-- Controle operacional: nenhuma destas colunas é sobrescrita ao reimportar a planilha.
alter table public.campos
  -- total = descartado sem colher nada (descarte direto) · parcial = colheu uma parte e o resto foi descartado
  add column if not exists descarte          text check (descarte is null or descarte in ('total', 'parcial')),
  -- qualidade · clima · negativa_colheita · moega_indisponivel
  add column if not exists descarte_motivo   text,
  add column if not exists descarte_data     date,
  -- observações do encerramento da colheita ou do descarte
  add column if not exists encerramento_obs  text;

-- faz a API enxergar as colunas novas na hora
notify pgrst, 'reload schema';

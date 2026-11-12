-- Controle de Técnicos e Colheita — volume colhido real e metas por cultivar
-- Como usar: Supabase > SQL Editor > New query > colar este arquivo inteiro > Run.
-- Rode DEPOIS do 0001_schema.sql. Pode ser executado mais de uma vez sem perder dados.

-- ------------------------------------------------- produtividade do produtor
-- Produtividade geral da área informada pelo produtor (sc/ha). Não é sobrescrita ao reimportar a planilha.
alter table public.campos add column if not exists prod_real_sc_ha numeric
  check (prod_real_sc_ha is null or prod_real_sc_ha >= 0);

-- ------------------------------------------------------- colheita dia a dia
-- Um lançamento por carga ou por dia. Os volumes ficam em kg.
create table if not exists public.colheitas_diarias (
  id           uuid primary key default gen_random_uuid(),
  campo_id     uuid not null references public.campos (id) on delete cascade,
  data         date not null,
  -- volume colhido no dia e entregue na UBS
  colhido_kg   numeric not null check (colhido_kg >= 0),
  -- volume aprovado e internalizado na UBS; vazio = todo o volume colhido foi aprovado
  aprovado_kg  numeric check (aprovado_kg is null or aprovado_kg >= 0),
  -- área colhida no dia (opcional)
  area_ha      numeric check (area_ha is null or area_ha >= 0),
  observacoes  text,
  created_at   timestamptz not null default now()
);
create index if not exists colheitas_diarias_campo_idx on public.colheitas_diarias (campo_id);
create index if not exists colheitas_diarias_data_idx on public.colheitas_diarias (data);

-- ---------------------------------------------------------- metas por cultivar
create table if not exists public.metas_cultivar (
  id              uuid primary key default gen_random_uuid(),
  -- mesmo nome da coluna "Produto" dos campos
  cultivar        text not null unique,
  -- semente pronta planejada, em sacos de 200 mil sementes (big bags × sacos por big bag)
  meta_sc200      numeric check (meta_sc200 is null or meta_sc200 >= 0),
  -- peso de mil sementes (g) e rendimento do beneficiamento (%); vazio = padrão da aba Metas
  pms_g           numeric check (pms_g is null or pms_g > 0),
  rend_ubs        numeric check (rend_ubs is null or (rend_ubs > 0 and rend_ubs <= 100)),
  -- meta de internalização digitada à mão (sc 60 kg); quando preenchida vale no lugar do cálculo
  meta_intern_sc  numeric check (meta_intern_sc is null or meta_intern_sc >= 0),
  -- big bags já prontos
  bb_ubs          numeric check (bb_ubs is null or bb_ubs >= 0),
  bb_tolling      numeric check (bb_tolling is null or bb_tolling >= 0),
  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists metas_cultivar_updated_at on public.metas_cultivar;
create trigger metas_cultivar_updated_at before update on public.metas_cultivar
  for each row execute function public.tocar_updated_at();

-- ------------------------------------------------------------- segurança
-- Mesma regra das outras tabelas: só quem está logado E tem o e-mail em usuarios_liberados.
do $$
declare t text;
begin
  foreach t in array array['colheitas_diarias', 'metas_cultivar'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "usuarios liberados" on public.%I', t);
    execute format(
      'create policy "usuarios liberados" on public.%I for all to authenticated
         using (public.usuario_liberado()) with check (public.usuario_liberado())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- faz a API enxergar as tabelas e a coluna novas na hora
notify pgrst, 'reload schema';

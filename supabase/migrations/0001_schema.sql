-- Controle de Técnicos e Colheita — esquema do banco (Supabase / PostgreSQL)
-- Como usar: Supabase > SQL Editor > New query > colar este arquivo inteiro > Run.
-- Pode ser executado mais de uma vez sem perder dados.
--
-- Observação: não existem colunas para CPF, CNPJ ou Inscrição Estadual.
-- Esses dados são descartados na leitura da planilha e nunca chegam ao banco.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- técnicos
create table if not exists public.tecnicos (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  telefone     text,
  cidade_base  text,
  funcao       text,
  cor          text not null default '#2a78d6',
  ativo        boolean not null default true,
  observacoes  text,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------ campos
-- Um registro por (nº do campo + categoria a colher).
create table if not exists public.campos (
  id                      uuid primary key default gen_random_uuid(),
  chave                   text not null unique,
  num_campo               text not null,
  cliente                 text,
  propriedade             text,
  cidade                  text,
  uf                      text,
  produto                 text,
  obtentor                text,
  biotec                  text,
  peneira                 text,
  categoria_plantada      text,
  categoria_colher        text,
  tipo_contrato           text,
  vendedor                text,
  uso_semente             text,
  proprio_terceiro        text,
  acao                    text,
  autorizacao             text,
  contrato                text,
  talhao                  text,
  data_plantio            date,
  ciclo                   integer,
  data_colheita_prevista  date,
  data_floracao           date,
  area_mapa               numeric not null default 0,
  area_projetada          numeric not null default 0,
  area_real               numeric not null default 0,
  expectativa_sc          numeric not null default 0,
  toneladas_mapa          numeric not null default 0,
  latitude                double precision,
  longitude               double precision,
  linhas                  jsonb not null default '[]'::jsonb,
  -- controle operacional (não é sobrescrito ao reimportar a planilha)
  colheita_inicio         date,
  colheita_fim            date,
  incluir_projecao        boolean not null default true,
  ov_inicio               date,
  ov_ha_dia               numeric,
  ov_sc_ha                numeric,
  ov_aprov                numeric,
  ativo                   boolean not null default true,
  observacoes             text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists campos_num_campo_idx on public.campos (num_campo);

-- ------------------------------------------------------------- dessecações
create table if not exists public.dessecacoes (
  id                      uuid primary key default gen_random_uuid(),
  campo_id                uuid not null references public.campos (id) on delete cascade,
  data                    date not null,
  area_ha                 numeric,
  dias_para_colheita      integer check (dias_para_colheita is null or dias_para_colheita between 0 and 120),
  -- data provável de colheita = data da dessecação + dias informados
  data_provavel_colheita  date generated always as (data + dias_para_colheita) stored,
  observacoes             text,
  created_at              timestamptz not null default now()
);
create index if not exists dessecacoes_campo_idx on public.dessecacoes (campo_id);
create index if not exists dessecacoes_provavel_idx on public.dessecacoes (data_provavel_colheita);

-- ------------------------------------------------------------ programações
create table if not exists public.programacoes (
  id           uuid primary key default gen_random_uuid(),
  data         date not null,
  tecnico_id   uuid not null references public.tecnicos (id) on delete cascade,
  campo_id     uuid not null references public.campos (id) on delete cascade,
  -- colheita_pre = colher e retirar pré-colheita · coleta_pre = passar pegando pré-colheita
  atividade    text not null default 'colheita_pre' check (atividade in ('colheita_pre', 'coleta_pre')),
  status       text not null default 'planejado' check (status in ('planejado', 'realizado', 'cancelado')),
  observacoes  text,
  created_at   timestamptz not null default now(),
  unique (data, tecnico_id, campo_id)
);
create index if not exists programacoes_data_idx on public.programacoes (data);

-- ----------------------------------------------------------- configurações
create table if not exists public.configuracoes (
  id      integer primary key default 1 check (id = 1),
  dados   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.configuracoes (id) values (1) on conflict (id) do nothing;

-- -------------------------------------------------- updated_at automático
create or replace function public.tocar_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists campos_updated_at on public.campos;
create trigger campos_updated_at before update on public.campos
  for each row execute function public.tocar_updated_at();

drop trigger if exists configuracoes_updated_at on public.configuracoes;
create trigger configuracoes_updated_at before update on public.configuracoes
  for each row execute function public.tocar_updated_at();

-- ------------------------------------------------------------- segurança
-- Quem pode usar o sistema: só quem está logado E tem o e-mail na tabela usuarios_liberados.
-- Assim, mesmo que o cadastro público do Supabase fique ligado por engano, um estranho
-- que crie uma conta não enxerga nada.
--
-- Na PRIMEIRA execução deste arquivo, todos os usuários já criados em Authentication > Users
-- são liberados automaticamente. Para liberar alguém depois: Table Editor > usuarios_liberados
-- > Insert row > e-mail (ou: insert into public.usuarios_liberados (email) values ('pessoa@empresa.com');).
do $$
begin
  if to_regclass('public.usuarios_liberados') is null then
    create table public.usuarios_liberados (
      email       text primary key,
      created_at  timestamptz not null default now()
    );
    if to_regclass('auth.users') is not null then
      execute 'insert into public.usuarios_liberados (email)
               select lower(trim(email)) from auth.users where email is not null
               on conflict do nothing';
    end if;
  end if;
end $$;
alter table public.usuarios_liberados enable row level security;
revoke all on public.usuarios_liberados from anon, authenticated;

create or replace function public.usuario_liberado() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.usuarios_liberados u
    where lower(trim(u.email)) = lower(trim(auth.jwt() ->> 'email'))
  );
$$;
revoke all on function public.usuario_liberado() from public, anon;
grant execute on function public.usuario_liberado() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['tecnicos', 'campos', 'dessecacoes', 'programacoes', 'configuracoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "usuarios logados" on public.%I', t);
    execute format('drop policy if exists "usuarios liberados" on public.%I', t);
    execute format(
      'create policy "usuarios liberados" on public.%I for all to authenticated
         using (public.usuario_liberado()) with check (public.usuario_liberado())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ============================================================
--  Lustre — Schéma Supabase (multi-tenant + Row Level Security)
--
--  À exécuter dans Supabase :
--    Dashboard → SQL Editor → coller ce fichier → Run.
--
--  Différence clé avec un backend maison : ici l'identité vient de
--  Supabase Auth. auth.uid() = l'utilisateur connecté (lu depuis son JWT).
--  Les politiques RLS autorisent une ligne si l'utilisateur est MEMBRE de
--  l'organisation à laquelle la ligne appartient. Aucune donnée ne peut
--  fuiter d'une organisation à l'autre, garanti par PostgreSQL.
-- ============================================================

create extension if not exists pgcrypto;

-- Rôles d'appartenance
do $$ begin
  if not exists (select 1 from pg_type where typname = 'member_role') then
    create type public.member_role as enum ('admin', 'member', 'reader');
  end if;
end $$;

-- ----- Tables ------------------------------------------------
create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role            public.member_role not null default 'member',
  created_at      timestamptz not null default now(),
  primary key (user_id, organization_id)
);

-- Tout l'état de l'app Lustre d'une organisation, en un blob JSON.
create table if not exists public.app_states (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  state           jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

-- Abonnement Stripe (écrit uniquement par l'Edge Function via service role).
create table if not exists public.subscriptions (
  organization_id        uuid primary key references public.organizations(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text not null default 'inactive',
  price_id               text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);

-- ----- Fonctions d'aide (SECURITY DEFINER pour éviter la récursion RLS) -
-- is_member : l'utilisateur courant appartient-il à cette organisation ?
create or replace function public.is_member(p_org uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists(
    select 1 from public.memberships
    where user_id = auth.uid() and organization_id = p_org
  );
$$;

-- has_role : l'utilisateur a-t-il AU MOINS ce rôle dans l'organisation ?
create or replace function public.has_role(p_org uuid, p_min public.member_role)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists(
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.organization_id = p_org
      and (case m.role  when 'admin' then 3 when 'member' then 2 else 1 end)
       >= (case p_min   when 'admin' then 3 when 'member' then 2 else 1 end)
  );
$$;

-- ----- RPC : créer une organisation + 1ʳᵉ appartenance (admin) ---------
create or replace function public.create_organization(p_name text)
returns public.organizations
language plpgsql security definer
set search_path = public
as $$
declare org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  insert into public.organizations(name) values (coalesce(nullif(trim(p_name), ''), 'Mon organisation'))
    returning * into org;
  insert into public.memberships(user_id, organization_id, role)
    values (auth.uid(), org.id, 'admin');
  return org;
end;
$$;

-- ----- RPC : sauvegarder l'état (verrouillage optimiste) ---------------
-- Renvoie le nouveau updated_at. Lève 'conflict' si la base a été modifiée
-- depuis le chargement du client (un autre membre a sauvegardé entre-temps).
create or replace function public.save_app_state(
  p_org uuid,
  p_state jsonb,
  p_expected timestamptz default null
)
returns timestamptz
language plpgsql security definer
set search_path = public
as $$
declare current_ts timestamptz; new_ts timestamptz;
begin
  if not public.has_role(p_org, 'member') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select updated_at into current_ts from public.app_states where organization_id = p_org;
  if p_expected is not null and current_ts is not null
     and current_ts > p_expected + interval '250 milliseconds' then
    raise exception 'conflict' using errcode = 'P0001';
  end if;
  insert into public.app_states(organization_id, state, updated_at)
       values (p_org, p_state, now())
  on conflict (organization_id) do update
       set state = excluded.state, updated_at = now()
  returning updated_at into new_ts;
  return new_ts;
end;
$$;

-- ============================================================
--  Row Level Security
-- ============================================================
alter table public.organizations enable row level security;
alter table public.memberships   enable row level security;
alter table public.app_states    enable row level security;
alter table public.subscriptions enable row level security;

-- Organisations : visibles par leurs membres ; modifiables par les admins.
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations
  for select using (public.is_member(id));
drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations
  for update using (public.has_role(id, 'admin'));
drop policy if exists org_delete on public.organizations;
create policy org_delete on public.organizations
  for delete using (public.has_role(id, 'admin'));
-- (création via la RPC create_organization)

-- Appartenances : visibles par les membres de l'org ; gérées par les admins.
drop policy if exists mem_select on public.memberships;
create policy mem_select on public.memberships
  for select using (public.is_member(organization_id));
drop policy if exists mem_insert on public.memberships;
create policy mem_insert on public.memberships
  for insert with check (public.has_role(organization_id, 'admin'));
drop policy if exists mem_update on public.memberships;
create policy mem_update on public.memberships
  for update using (public.has_role(organization_id, 'admin'));
drop policy if exists mem_delete on public.memberships;
create policy mem_delete on public.memberships
  for delete using (public.has_role(organization_id, 'admin'));

-- État : lecture par les membres ; écriture UNIQUEMENT via save_app_state.
drop policy if exists state_select on public.app_states;
create policy state_select on public.app_states
  for select using (public.is_member(organization_id));

-- Abonnements : lecture par les membres ; écriture par l'Edge Function
-- (service role, qui contourne la RLS) — aucune politique d'écriture ici.
drop policy if exists sub_select on public.subscriptions;
create policy sub_select on public.subscriptions
  for select using (public.is_member(organization_id));

-- ============================================================
--  001_init.sql — Schéma multi-tenant avec Row Level Security
-- ============================================================
--  Modèle de sécurité :
--   * Toutes les requêtes applicatives passent par le rôle "lustre_app",
--     qui n'est PAS super-utilisateur et n'a PAS l'attribut BYPASSRLS.
--   * Les tables de données métier (clients, subscriptions, …) portent une
--     colonne organization_id et une POLITIQUE RLS qui n'autorise QUE les
--     lignes de l'organisation active (variable de session app.current_org).
--   * Même un bug applicatif (un SELECT sans WHERE) ne peut pas fuiter les
--     données d'une autre organisation : la base elle-même refuse.
-- ============================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ----- Rôle applicatif (soumis à la RLS) --------------------
-- NB : mot de passe de DÉVELOPPEMENT. En production, changez-le
--      (ALTER ROLE lustre_app PASSWORD '...') et mettez-le dans .env.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'lustre_app') then
    create role lustre_app login password 'lustre_app_dev_pw';
  end if;
end$$;

-- ----- Organisations (locataires / tenants) -----------------
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ----- Utilisateurs (globaux : un user peut être dans N orgs) -
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  password_hash text not null,
  name          text,
  created_at    timestamptz not null default now()
);
-- Unicité de l'email insensible à la casse
create unique index if not exists users_email_lower_idx on users (lower(email));

-- ----- Rôles d'appartenance ---------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_role') then
    create type member_role as enum ('admin', 'member', 'reader');
  end if;
end$$;

create table if not exists memberships (
  user_id          uuid not null references users(id) on delete cascade,
  organization_id  uuid not null references organizations(id) on delete cascade,
  role             member_role not null default 'member',
  created_at       timestamptz not null default now(),
  primary key (user_id, organization_id)
);

-- ----- Sessions (auth par cookie httpOnly) ------------------
-- On stocke le HASH du jeton (pas le jeton brut) : une fuite de la base
-- ne donne pas de session utilisable. Chaque session porte aussi son
-- secret CSRF (pattern synchronizer token).
create table if not exists sessions (
  id              uuid primary key default gen_random_uuid(),
  token_hash      text not null unique,
  user_id         uuid not null references users(id) on delete cascade,
  current_org_id  uuid references organizations(id) on delete set null,
  csrf_secret     text not null,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id);

-- ============================================================
--  Tables de données MÉTIER (soumises à la RLS par tenant)
-- ============================================================

-- Exemple complet : clients de l'entreprise (démontre le patron RLS)
create table if not exists clients (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,
  email            text,
  phone            text,
  created_at       timestamptz not null default now()
);
create index if not exists clients_org_idx on clients(organization_id);

-- Abonnement Stripe : un par organisation
create table if not exists subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null unique references organizations(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text not null default 'inactive',
  price_id               text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);
create index if not exists subscriptions_org_idx on subscriptions(organization_id);

-- ----- Activation de la Row Level Security ------------------
alter table clients        enable row level security;
alter table clients        force  row level security;
alter table subscriptions  enable row level security;
alter table subscriptions  force  row level security;

-- Politiques : seules les lignes de l'organisation active sont visibles
-- ET insérables/modifiables (WITH CHECK empêche d'écrire dans une autre org).
-- nullif(current_setting('app.current_org', true), '') :
--   * variable jamais définie  → NULL
--   * variable réinitialisée   → '' → nullif → NULL
--   dans les deux cas la comparaison est NULL → aucune ligne (déni sûr),
--   et on évite l'erreur ''::uuid.
drop policy if exists clients_isolation on clients;
create policy clients_isolation on clients
  using      (organization_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (organization_id = nullif(current_setting('app.current_org', true), '')::uuid);

drop policy if exists subscriptions_isolation on subscriptions;
create policy subscriptions_isolation on subscriptions
  using      (organization_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (organization_id = nullif(current_setting('app.current_org', true), '')::uuid);

-- ----- Privilèges du rôle applicatif ------------------------
grant usage on schema public to lustre_app;
grant select, insert, update, delete on all tables in schema public to lustre_app;
alter default privileges in schema public
  grant select, insert, update, delete on tables to lustre_app;

-- ============================================================
--  003_app_states.sql
--  Stockage de l'état applicatif d'une organisation, isolé par la RLS.
--
--  Modèle pragmatique : une seule ligne par organisation contient
--  l'ensemble de l'état Lustre (clients, soumissions, contrats, etc.)
--  sous forme de JSONB. Plusieurs membres d'une même organisation
--  partagent et collaborent sur ce même état.
--
--  Verrouillage optimiste : updated_at. Le client envoie la valeur qu'il
--  a chargée ; si elle est antérieure à celle en base, on rejette pour
--  éviter d'écraser le travail d'un autre membre (renvoi 409).
-- ============================================================

create table if not exists app_states (
  organization_id uuid primary key references organizations(id) on delete cascade,
  state           jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

alter table app_states enable row level security;
alter table app_states force  row level security;

drop policy if exists app_states_isolation on app_states;
create policy app_states_isolation on app_states
  using      (organization_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (organization_id = nullif(current_setting('app.current_org', true), '')::uuid);

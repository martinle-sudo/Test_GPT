-- ============================================================
--  Lustre — Équipes : inviter des membres dans une organisation
--
--  Objectif : un ADMIN peut inviter des collègues par courriel. L'invité
--  rejoint UNIQUEMENT l'organisation pour laquelle il a été invité, et la
--  Row Level Security existante (001_schema.sql) garantit qu'il ne voit
--  QUE les données de cette entreprise — jamais celles d'une autre.
--
--  Sécurité (points clés) :
--   * Une invitation est liée à un courriel précis. Seul un utilisateur
--     CONNECTÉ dont le courriel correspond EXACTEMENT (et est CONFIRMÉ)
--     peut transformer l'invitation en adhésion. → claim_invitations().
--   * Inviter / retirer / lister exigent le rôle ADMIN (vérifié côté base).
--   * On ne peut jamais retirer le dernier admin (anti-verrouillage).
--   * Les fonctions SECURITY DEFINER fixent search_path = public (anti-
--     hijack du chemin de schéma).
--
--  ⚠️  PRODUCTION : active la confirmation de courriel dans Supabase
--      (Authentication → Providers → Email → « Confirm email » ON). Ainsi un
--      tiers ne peut pas s'inscrire avec le courriel d'autrui pour voler une
--      invitation. claim_invitations() exige déjà email_confirmed_at.
--
--  À exécuter dans Supabase : SQL Editor → coller → Run. Rejouable.
-- ============================================================

-- ----- Table des invitations en attente -----------------------
create table if not exists public.invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email           text not null check (email = lower(email)),
  role            public.member_role not null default 'member',
  invited_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (organization_id, email)
);
create index if not exists invitations_email_idx on public.invitations (email);

alter table public.invitations enable row level security;

-- Les admins de l'org voient et révoquent les invitations de LEUR org.
-- (L'insertion passe par la RPC invite_member, SECURITY DEFINER.)
drop policy if exists inv_select on public.invitations;
create policy inv_select on public.invitations
  for select using (public.has_role(organization_id, 'admin'));
drop policy if exists inv_delete on public.invitations;
create policy inv_delete on public.invitations
  for delete using (public.has_role(organization_id, 'admin'));

-- ----- RPC : inviter un membre (admin only) -------------------
-- Crée (ou met à jour) une invitation. Refuse si le courriel est déjà membre.
create or replace function public.invite_member(
  p_org uuid,
  p_email text,
  p_role public.member_role default 'member'
)
returns public.invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_inv   public.invitations;
begin
  if not public.has_role(p_org, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Courriel invalide' using errcode = '22023';
  end if;
  if p_role = 'admin' then
    -- On n'invite pas directement en admin via cette voie (prudence).
    p_role := 'member';
  end if;
  -- Déjà membre de cette organisation ?
  if exists (
    select 1 from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_org and lower(u.email) = v_email
  ) then
    raise exception 'Cette personne est déjà membre de l''organisation'
      using errcode = 'P0001';
  end if;

  insert into public.invitations (organization_id, email, role, invited_by)
       values (p_org, v_email, p_role, auth.uid())
  on conflict (organization_id, email)
       do update set role = excluded.role, invited_by = excluded.invited_by, created_at = now()
  returning * into v_inv;
  return v_inv;
end;
$$;

-- ----- RPC : réclamer ses invitations (tout utilisateur connecté) ----
-- Transforme en adhésions toutes les invitations adressées au courriel
-- (CONFIRMÉ) de l'utilisateur courant. Renvoie le nombre d'orgs rejointes.
create or replace function public.claim_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text;
  v_confirmed timestamptz;
  v_count     integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;
  select lower(email), email_confirmed_at
    into v_email, v_confirmed
    from auth.users where id = auth.uid();
  -- Sécurité : on n'accepte une invitation que pour un courriel CONFIRMÉ.
  if v_email is null or v_confirmed is null then
    return 0;
  end if;

  -- Crée les adhésions manquantes pour chaque invitation correspondante.
  insert into public.memberships (user_id, organization_id, role)
  select auth.uid(), i.organization_id, i.role
    from public.invitations i
   where i.email = v_email
  on conflict (user_id, organization_id) do nothing;

  -- Supprime les invitations réclamées et compte les orgs rejointes.
  with deleted as (
    delete from public.invitations i
     where i.email = v_email
     returning 1
  )
  select count(*) into v_count from deleted;

  return v_count;
end;
$$;

-- ----- RPC : lister les membres d'une org (membres de l'org) ----------
-- Renvoie chaque membre avec son courriel. Réservé aux membres de l'org
-- (un collègue peut voir l'équipe ; modifier exige le rôle admin).
create or replace function public.org_members(p_org uuid)
returns table (user_id uuid, email text, role public.member_role, joined_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.created_at
      from public.memberships m
      join auth.users u on u.id = m.user_id
     where m.organization_id = p_org
     order by m.created_at asc;
end;
$$;

-- ----- RPC : retirer un membre (admin only, anti-verrouillage) --------
create or replace function public.remove_member(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admins integer;
  v_target_role public.member_role;
begin
  if not public.has_role(p_org, 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select role into v_target_role
    from public.memberships
   where organization_id = p_org and user_id = p_user;
  if v_target_role is null then
    return; -- déjà absent
  end if;
  -- Ne jamais retirer le dernier admin (sinon org orpheline).
  if v_target_role = 'admin' then
    select count(*) into v_admins
      from public.memberships
     where organization_id = p_org and role = 'admin';
    if v_admins <= 1 then
      raise exception 'Impossible de retirer le dernier administrateur'
        using errcode = 'P0001';
    end if;
  end if;
  delete from public.memberships
   where organization_id = p_org and user_id = p_user;
end;
$$;

-- ----- RPC : nombre de sièges (membres) d'une org --------------------
-- Sert au calcul de facturation. Lisible par les membres de l'org.
create or replace function public.org_seat_count(p_org uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select case when public.is_member(p_org)
    then (select count(*)::int from public.memberships where organization_id = p_org)
    else 0 end;
$$;

-- Droits d'exécution
revoke all on function public.invite_member(uuid, text, public.member_role) from public;
revoke all on function public.claim_invitations() from public;
revoke all on function public.org_members(uuid) from public;
revoke all on function public.remove_member(uuid, uuid) from public;
revoke all on function public.org_seat_count(uuid) from public;
grant execute on function public.invite_member(uuid, text, public.member_role) to authenticated;
grant execute on function public.claim_invitations() to authenticated;
grant execute on function public.org_members(uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.org_seat_count(uuid) to authenticated;

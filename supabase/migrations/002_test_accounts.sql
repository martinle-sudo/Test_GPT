-- ============================================================
--  Lustre — Comptes de test (accès complet sans abonnement)
--
--  Pourquoi : on ne veut pas mettre la liste des courriels « privilégiés »
--  dans index.html (frontend public). On la garde côté Supabase, dans une
--  table protégée par RLS. Une RPC SECURITY DEFINER expose UNIQUEMENT un
--  booléen au navigateur (« est-ce que MON courriel est dans la liste ? »)
--  — jamais le contenu de la table.
--
--  À exécuter dans Supabase :
--    Dashboard → SQL Editor → coller ce fichier → Run.
--    Rejouable sans danger (create if not exists / create or replace).
--
--  GÉRER LA LISTE depuis le dashboard Supabase :
--    Table Editor → public.test_accounts → Insert row → email = '…'
--    OU SQL Editor :
--      insert into public.test_accounts (email) values ('moi@exemple.com');
--      delete from public.test_accounts where email = 'moi@exemple.com';
-- ============================================================

-- Table de la liste blanche. Email normalisé en minuscules par contrainte.
create table if not exists public.test_accounts (
  email      text primary key check (email = lower(email)),
  note       text,
  created_at timestamptz not null default now()
);

-- Verrou : aucune lecture/écriture directe depuis le client. La seule façon
-- d'apprendre quoi que ce soit sur cette table est la RPC ci-dessous, qui
-- ne révèle qu'un booléen pour SON PROPRE courriel.
alter table public.test_accounts enable row level security;
-- Pas de policy → personne (rôle anon/authenticated) ne peut lire ni écrire.
-- Seul le service_role (Edge Functions, Studio) y a accès.

-- RPC : « le compte connecté est-il un compte de test ? ». Renvoie un bool.
-- SECURITY DEFINER : s'exécute avec les droits du propriétaire (qui peut
-- lire la table), donc la requête voit la table même si l'appelant non.
create or replace function public.is_test_account()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.test_accounts ta
      join auth.users u on lower(u.email) = ta.email
     where u.id = auth.uid()
  );
$$;

-- Accessible par tout utilisateur connecté ; refusé aux non-authentifiés.
revoke all on function public.is_test_account() from public;
grant execute on function public.is_test_account() to authenticated;

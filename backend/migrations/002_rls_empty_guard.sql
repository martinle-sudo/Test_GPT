-- ============================================================
--  002_rls_empty_guard.sql
--  Durcit les politiques RLS contre la chaîne vide.
--  Un GUC personnalisé (app.current_org) déjà utilisé puis réinitialisé
--  revient à '' (et non NULL) dans la session ; ''::uuid lève une erreur.
--  On enveloppe donc avec nullif(..., '') pour transformer '' en NULL
--  → déni par défaut propre, sans erreur.
-- ============================================================

drop policy if exists clients_isolation on clients;
create policy clients_isolation on clients
  using      (organization_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (organization_id = nullif(current_setting('app.current_org', true), '')::uuid);

drop policy if exists subscriptions_isolation on subscriptions;
create policy subscriptions_isolation on subscriptions
  using      (organization_id = nullif(current_setting('app.current_org', true), '')::uuid)
  with check (organization_id = nullif(current_setting('app.current_org', true), '')::uuid);

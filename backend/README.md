# Lustre — Backend SaaS (Phase 1 : fondations sécurisées)

Ce dossier `backend/` est le **cerveau central** qui transforme Lustre, jusqu'ici
une app navigateur, en une vraie plateforme SaaS multi-clients. Il fournit :

- 🔐 **Authentification robuste** — mots de passe hachés (Bcrypt), sessions par
  cookie `httpOnly`, protection CSRF, limiteur anti-force-brute.
- 🏢 **Multi-tenant strict** — chaque organisation (`organization_id`) est isolée
  par la **Row Level Security** de PostgreSQL. Même un bug dans le code ne peut
  pas faire fuiter les données d'un autre client : la base elle-même refuse.
- 👥 **Rôles** — `admin` > `member` > `reader`, vérifiés à chaque requête.
- 💳 **Facturation Stripe** — Checkout (abonnements) + webhooks signés pour
  synchroniser automatiquement le statut d'abonnement, dans un service dédié.

> **Important** : l'app Lustre actuelle (`../index.html`) n'est pas modifiée.
> Cette Phase 1 livre le backend sécurisé et testé. La Phase 2 (brancher
> l'interface Lustre sur cette API) viendra ensuite.

---

## Ce dont tu as besoin (une seule fois)

1. **Node.js 20+** et **PostgreSQL 14+** installés.
2. Démarrer PostgreSQL.

## Démarrage en 5 étapes

```bash
cd backend
npm install                     # 1. installer les dépendances

cp .env.example .env            # 2. créer ta configuration
#    → ouvre .env et ajuste si besoin (mots de passe, Stripe…)

#    3. créer les bases (dev + test) — adapte l'utilisateur si besoin
createdb lustre_dev
createdb lustre_test

npm run db:migrate              # 4. créer les tables + la sécurité
npm run dev                     # 5. démarrer l'API (http://localhost:4000)
```

Données de démo (optionnel) : `npm run db:seed`
→ crée `alice@demo.test` / `motdepasse123` et `bob@demo.test` / `motdepasse123`,
chacun dans sa propre organisation isolée.

## Lancer les tests

```bash
cp .env.test.example .env.test
npm test
```

Les tests **prouvent** la sécurité (ils tournent contre une vraie base) :
isolation multi-tenant, hachage Bcrypt, rôles, CSRF.

---

## Configurer Stripe (pour la facturation)

Le code est prêt ; il te reste à fournir TES clés (elles restent sur le serveur,
jamais dans le navigateur) :

1. Crée un compte sur [stripe.com](https://stripe.com) et un **produit
   d'abonnement** → tu obtiens un `price_id`.
2. Dans le dashboard Stripe → *Développeurs → Clés API* → copie la **clé secrète**.
3. *Développeurs → Webhooks* → ajoute un endpoint pointant vers
   `https://TON-DOMAINE/api/billing/webhook` → copie le **secret de signature**.
4. Remplis dans `.env` : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_ID`.

En local, pour tester les webhooks : `stripe listen --forward-to
localhost:4000/api/billing/webhook` (CLI Stripe).

---

## Carte des routes

| Méthode | Route | Rôle requis | Description |
|--------|-------|-------------|-------------|
| POST | `/api/auth/register` | — | Créer un compte + 1ʳᵉ organisation |
| POST | `/api/auth/login` | — | Se connecter |
| POST | `/api/auth/logout` | connecté | Se déconnecter |
| GET  | `/api/auth/me` | — | Session courante |
| GET  | `/api/auth/csrf` | — | Récupérer le jeton CSRF |
| POST | `/api/auth/switch-org` | connecté | Changer d'organisation active |
| GET  | `/api/orgs` | connecté | Mes organisations |
| POST | `/api/orgs` | connecté | Créer une organisation |
| GET  | `/api/orgs/members` | member | Membres de l'org active |
| POST | `/api/orgs/members` | **admin** | Inviter / changer le rôle d'un membre |
| DELETE | `/api/orgs/members/:id` | **admin** | Retirer un membre |
| GET/POST/PUT/DELETE | `/api/clients` | reader / member | Exemple de ressource isolée par tenant |
| GET | `/api/billing/status` | reader | Statut d'abonnement |
| POST | `/api/billing/checkout` | **admin** | Démarrer un abonnement Stripe |
| POST | `/api/billing/portal` | **admin** | Gérer / annuler l'abonnement |
| POST | `/api/billing/webhook` | Stripe (signé) | Synchro automatique des abonnements |

> Toutes les requêtes mutantes (POST/PUT/DELETE) exigent l'en-tête
> `X-CSRF-Token` (obtenu via `/api/auth/csrf` ou au login/register).

---

## Architecture (pourquoi c'est sûr)

```
src/
  config/env.js          Validation stricte de la configuration au boot
  db/
    pool.js              Connexion en tant que « lustre_app » (soumis à la RLS)
    withTenant.js        Fixe app.current_org → la RLS isole chaque requête
    runMigrations.js     Applique les fichiers SQL une fois chacun
  middleware/
    requestContext.js    Charge la session → req.user, req.membership (rôle)
    auth.js              requireAuth / requireOrg / requireRole
    csrf.js              Vérifie le jeton CSRF (comparaison à temps constant)
    security.js          En-têtes Helmet + limiteurs de débit
    errorHandler.js      Réponses d'erreur propres, sans fuite d'info
  modules/
    auth/                Inscription, connexion, sessions, cookies
    organizations/       Organisations + membres + rôles
    clients/             Exemple de CRUD isolé par tenant (patron à réutiliser)
    billing/             Stripe (service dédié + webhook signé)
migrations/              Schéma SQL + politiques Row Level Security
tests/                   Preuves : isolation, auth, rôles, CSRF
```

**Le principe clé** : le code métier (ex. `client.service.js`) ne filtre jamais
manuellement par organisation. Il appelle `withTenant(orgId, …)`, et c'est
PostgreSQL qui garantit l'isolation. Résultat : du code simple **et** impossible
à faire fuiter par accident.

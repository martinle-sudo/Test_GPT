# Lustre sur Supabase — guide pour Martin

Bonne nouvelle : avec Supabase, **plus besoin de serveur, ni de VPS, ni de
nginx**. Tu héberges juste le fichier `index.html` (même GitHub Pages
suffit), et Supabase s'occupe de la base de données, de l'authentification
et de la sécurité.

Ce guide est en 4 parties. Compte ~30 minutes la première fois.

---

## Partie 1 — Créer la base de données (5 min)

1. Va sur [supabase.com](https://supabase.com) → ton projet
   `oijvhagvmzvggxlzvsye`.
2. Menu de gauche → **SQL Editor** → **New query**.
3. Ouvre le fichier `supabase/migrations/001_schema.sql` de ce dépôt,
   copie **tout** son contenu, colle-le dans l'éditeur, clique **Run**.
4. Tu dois voir « Success ». C'est fait : tables, sécurité (RLS) et
   fonctions sont créées.

---

## Partie 2 — Brancher l'app (5 min)

1. Dans Supabase → **Project Settings** (roue dentée) → **API**.
2. Copie deux choses :
   - **Project URL** (déjà rempli pour toi dans le code)
   - **anon public** (une longue clé qui commence par `eyJ…`)
3. Ouvre `index.html`, trouve tout en haut du script (cherche
   `SUPABASE_ANON_KEY`) et colle la clé `anon` :
   ```js
   const SUPABASE_ANON_KEY = 'eyJhbGciOi...'; // ← ta clé ici
   ```
   > Cette clé est **publique**, c'est normal et sans danger : la sécurité
   > est assurée par la Row Level Security côté base.
4. Sauvegarde, et héberge `index.html` où tu veux (GitHub Pages, Netlify,
   ou même en double-cliquant le fichier pour tester en local).

### Réglage d'authentification (important au début)

Par défaut, Supabase exige une **confirmation par courriel** avant qu'un
utilisateur puisse se connecter. Pour tester rapidement sans config courriel :

- Supabase → **Authentication** → **Providers** → **Email** →
  désactive « Confirm email » → Save.

Plus tard, pour la production, tu pourras réactiver la confirmation et
configurer un expéditeur courriel (SMTP) dans Authentication → Emails.

---

## Partie 3 — Paiements Stripe (15 min)

Les paiements passent par trois petites fonctions (Edge Functions) déjà
écrites dans `supabase/functions/`. Il faut les déployer.

### a) Installer l'outil Supabase (une fois)

Sur ton Mac :
```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref oijvhagvmzvggxlzvsye
```

### b) Donner tes clés Stripe aux fonctions (secrets — restent côté serveur)

Crée d'abord sur [stripe.com](https://stripe.com) :
- un **produit** d'abonnement → tu obtiens un `price_id` ;
- ta **clé secrète** (`sk_live_…` ou `sk_test_…` pour tester).

Puis :
```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_xxx \
  STRIPE_PRICE_ID=price_xxx \
  APP_BASE_URL=https://l-adresse-de-ton-app
```

### c) Déployer les fonctions

```bash
supabase functions deploy stripe-checkout
supabase functions deploy stripe-portal
supabase functions deploy stripe-webhook --no-verify-jwt
```
> `--no-verify-jwt` sur le webhook : c'est Stripe qui l'appelle, pas un
> utilisateur connecté. Sa sécurité vient de la **signature Stripe**.

### d) Configurer le webhook Stripe

1. Stripe → **Développeurs → Webhooks** → **Add endpoint**.
2. URL :
   `https://oijvhagvmzvggxlzvsye.supabase.co/functions/v1/stripe-webhook`
3. Événements à écouter :
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copie le **Signing secret** (`whsec_…`) et donne-le aux fonctions :
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
   ```

---

## Partie 4 — C'est en ligne !

- Ouvre ton app → écran de connexion → crée un compte → tu as une
  organisation, et tes données sont sauvegardées dans Supabase, isolées
  des autres clients.
- Le bouton **S'abonner** lance Stripe Checkout ; après paiement, le badge
  passe à « Abonnement actif » automatiquement (via le webhook).

---

## Comment ça marche (en bref)

```
  Navigateur (index.html)
        │  appels directs, clé "anon" publique
        ▼
  Supabase
   ├── Postgres + Row Level Security  → isole chaque organisation
   ├── Auth (courriel/mot de passe)   → comptes, sessions JWT
   └── Edge Functions (Stripe)        → checkout, portail, webhooks
```

La **Row Level Security** garantit qu'un client ne peut jamais voir les
données d'un autre — c'est PostgreSQL lui-même qui refuse, pas du code
applicatif. (Voir les politiques dans `migrations/001_schema.sql`.)

## Mettre à jour la base plus tard

Quand j'ajoute une migration (`002_…sql`, etc.), tu la colles à son tour
dans le **SQL Editor** de Supabase et tu cliques Run. Les migrations sont
écrites pour être rejouables sans casser l'existant.

## Sauvegardes

Supabase fait des sauvegardes automatiques (quotidiennes sur les plans
payants). Tu peux aussi exporter à tout moment via **Database → Backups**.
Aucune manipulation serveur de ta part.

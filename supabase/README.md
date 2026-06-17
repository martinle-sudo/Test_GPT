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

> **Deux méthodes.** La méthode **A (navigateur)** ne demande RIEN à
> installer — recommandée si tu n'es pas développeur. La méthode **B
> (terminal)** est pour ceux qui ont déjà l'habitude de la ligne de commande.

### MÉTHODE A — Tout dans le navigateur (recommandée)

Tu n'as pas besoin de télécharger le projet ni d'installer quoi que ce soit.

**1) Créer les 3 fonctions**

Pour chacune des trois fonctions (`stripe-checkout`, `stripe-portal`,
`stripe-webhook`) :

1. Supabase → menu de gauche → **Edge Functions** → **Deploy a new function**
   → **Via Editor** (éditeur dans le navigateur).
2. **Nom** : exactement `stripe-checkout` (puis `stripe-portal`, puis
   `stripe-webhook`).
3. Ouvre le fichier correspondant sur GitHub
   (`supabase/functions/stripe-checkout/index.ts`), clique sur l'icône
   **Copy raw file**, et **colle tout** dans l'éditeur (remplace ce qu'il y a).
4. **Deploy**.
5. ⚠ Pour `stripe-webhook` UNIQUEMENT : dans les réglages de la fonction,
   **désactive « Verify JWT »** (c'est Stripe qui l'appelle, pas un
   utilisateur connecté ; sa sécurité vient de la signature Stripe).

**2) Enregistrer les secrets**

Supabase → **Edge Functions** → **Secrets** (ou *Project Settings → Edge
Functions → Secrets*). Ajoute ces clés une par une (bouton *Add new secret*) :

| Nom | Valeur |
|-----|--------|
| `STRIPE_SECRET_KEY` | ta clé secrète Stripe (`sk_test_…`) |
| `STRIPE_PRICE_ID` | l'identifiant de ton prix (`price_…`) |
| `APP_BASE_URL` | l'adresse de ton app (ex. `https://martinle-sudo.github.io/Test_GPT`) |
| `STRIPE_WEBHOOK_SECRET` | (tu l'ajouteras à l'étape webhook, plus bas) |

> `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont
> déjà fournis automatiquement aux fonctions — tu n'as pas à les ajouter.

Passe directement à **« Configurer le webhook Stripe »** plus bas.

---

### MÉTHODE B — En ligne de commande (alternative)

Cette méthode télécharge les fonctions depuis ton ordinateur. Il faut donc
d'abord récupérer le projet en local : sur la page GitHub du dépôt, bouton
vert **Code → Download ZIP**, décompresse, puis ouvre un terminal dans ce
dossier.

#### a) Installer l'outil Supabase (une fois)

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

## Partie 5 — Équipes (inviter des membres)

Un administrateur peut inviter des collègues. Chaque membre n'accède qu'aux
données de SON entreprise (garanti par la Row Level Security). Tarif :
**1ᵉʳ membre 19 $/mois, chaque membre suivant 5 $/mois**.

### a) Base de données

Dans **SQL Editor**, exécute `supabase/migrations/003_team.sql` (Run).
Crée la table des invitations et les fonctions sécurisées (inviter, rejoindre,
lister, retirer).

### b) Confirmation de courriel — IMPORTANT pour la sécurité

Active **Authentication → Providers → Email → « Confirm email » (ON)**.
Ainsi, un invité doit prouver qu'il possède bien le courriel avant de
rejoindre l'équipe (impossible d'usurper l'invitation de quelqu'un d'autre).
Le code refuse déjà de rattacher une invitation à un courriel non confirmé.

### c) Stripe — passer à un tarif « par siège » (gradué)

Aujourd'hui ton prix est un montant fixe. Il faut le remplacer par un prix
**gradué** (graduated) où la quantité = nombre de membres :

1. Stripe → **Catalogue de produits** → ton produit Lustre → **Ajouter un
   tarif**.
2. Type : **Récurrent**, mensuel. Modèle de tarification : **Par paliers
   (graduated / par tranches)**.
3. Configure 2 paliers :
   | Palier | Quantité | Prix |
   |--------|----------|------|
   | 1 | de **1 à 1** | **19 $** (par unité) |
   | 2 | **2 et plus** (∞) | **5 $** par unité |
   > En mode gradué, le 1ᵉʳ siège est facturé 19 $ et chaque siège suivant 5 $.
   > Exemple : 3 membres = 19 + 5 + 5 = **29 $/mois**.
4. Copie le nouvel **identifiant de prix** (`price_…`).
5. Mets à jour le secret : Supabase → Edge Functions → Secrets →
   `STRIPE_PRICE_ID` = le nouveau `price_…`.

### d) Déployer la nouvelle fonction de synchronisation des sièges

Une 4ᵉ Edge Function, `stripe-sync-seats`, ajuste automatiquement la quantité
facturée quand un membre rejoint ou quitte l'équipe.

- **Navigateur** : Edge Functions → Deploy a new function → nom exact
  `stripe-sync-seats` → colle `supabase/functions/stripe-sync-seats/index.ts`
  → Deploy. (Laisse « Verify JWT » activé — c'est un utilisateur connecté qui
  l'appelle.)
- **Terminal** : `supabase functions deploy stripe-sync-seats`

> Aucun nouveau secret : elle réutilise `STRIPE_SECRET_KEY` et les variables
> Supabase déjà fournies.

### e) Comment ça marche pour toi au quotidien

1. Dans l'app (en tant qu'admin), bloc compte en bas → **Gérer l'équipe**.
2. Entre le courriel du collègue → **Inviter**.
3. Le collègue crée un compte (ou se connecte) **avec ce courriel exact** →
   il rejoint automatiquement ton entreprise, et un siège (5 $/mois) s'ajoute
   à ta facture (au prorata).
4. **Retirer** un membre enlève son accès et le siège correspondant.

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

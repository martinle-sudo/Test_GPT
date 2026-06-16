# Lustre — Gestion d'entretien ménager (v3.13)

Application web pour gérer une entreprise d'entretien ménager. Fonctionne en
**deux modes** selon la configuration :

- **Mode SaaS (Supabase)** — comptes utilisateurs, organisations, données
  isolées par client via la Row Level Security PostgreSQL, abonnements Stripe.
  Voir [`supabase/README.md`](supabase/README.md) pour le déploiement.
- **Mode local** — sans configuration : tout est stocké dans le navigateur
  (localStorage), avec sauvegarde Google Drive optionnelle. Idéal pour tester
  ou un usage solo.

Le mode est détecté automatiquement au démarrage : si la clé Supabase est
renseignée dans `index.html`, c'est le mode SaaS ; sinon, le mode local.

## Modules

- **Tableau de bord** — pipeline actif, soumissions à relancer, factures en retard, heures de la semaine
- **Pipeline de vente** — kanban drag & drop (Leads → Contacté → Soumission → Négociation → Gagné/Perdu)
- **Services & tarifs** — catalogue de services avec prix calculés automatiquement à partir
  des salaires du comité paritaire (entretien léger/lourd) + charges sociales + marge.
  Ajout d'un service à une soumission ou facture en un clic, au prix de la marge du client.
- **Soumissions** — éditeur de lignes, taxes TPS/TVQ, **versions multiples** (v1 conservée), champ **fréquence** affiché sur le PDF, export PDF élégant
- **Contrats** — convertir une soumission acceptée en contrat (jours de la semaine, équipe, heure, dates) et **activer** : les quarts sont planifiés dans l'horaire automatiquement jusqu'à la date de fin. Modifier puis activer remplace uniquement les quarts futurs non complétés
- **Horaires** — vue semaine, équipes colorées, quarts assignés aux clients, duplication à la semaine suivante
- **Factures** — génération depuis une soumission acceptée, suivi payée/impayée/en retard (pas de comptabilité)
- **Clients** — registre partagé entre tous les modules

## Tarification (Services & tarifs)

Les prix ne sont pas saisis à la main : ils sont dérivés du coût réel.

```
coût horaire chargé = salaire comité paritaire × (1 + charges sociales %)
coût du service     = heures × coût horaire chargé + matériel
prix suggéré        = coût × (1 + marge %)
```

- Les **salaires** (entretien léger / lourd), le **% de charges** et la **marge par défaut**
  se règlent dans *Réglages → Base de prix*.
- Chaque **client** peut avoir sa propre **marge** (typiquement 30 % à 50 %) ; le prix d'un
  service s'ajuste automatiquement selon le client choisi dans la soumission.
- Le catalogue affiche, pour chaque service, le coût de revient, la marge et le **profit réel**
  (exprimé en % du prix de vente).

## Raccourcis & UX

- **Ctrl+K** (ou Cmd+K) : recherche rapide — clients, soumissions, factures, services et actions
- **Esc** : ferme la palette ou le modal ouvert ; **Entrée** dans un formulaire = bouton principal
- Les suppressions affichent un bouton **Annuler** (6 s) au lieu d'une confirmation bloquante
- Accessibilité : focus visible au clavier, ARIA sur les dialogues, respect de `prefers-reduced-motion`

## Export PDF

Le bouton « Exporter PDF » ouvre le dialogue d'impression du navigateur :
choisir « Enregistrer au format PDF » comme destination.

## Démarrage

**Mode local** : ouvrir `index.html` dans un navigateur. Des données de
démonstration sont chargées au premier lancement ; « Réglages → Réinitialiser
les données » permet de repartir à neuf.

**Mode SaaS** : suivre [`supabase/README.md`](supabase/README.md) (créer la
base, coller la clé `anon`, déployer les fonctions Stripe). L'app peut alors
être hébergée comme simple fichier statique (GitHub Pages, Netlify…).

## Architecture SaaS

```
  Navigateur (index.html)
        │  clé "anon" publique, appels directs
        ▼
  Supabase
   ├── Postgres + Row Level Security  → isole chaque organisation
   ├── Auth (courriel / mot de passe) → comptes, sessions
   └── Edge Functions (Stripe)        → checkout, portail, webhooks
```

- `supabase/migrations/` — schéma SQL + politiques de sécurité (RLS)
- `supabase/functions/` — fonctions Stripe (Deno)

---
Programmé par ML.

# Lustre — Gestion d'entretien ménager (v3.0)

Application web monofichier (`index.html`) pour gérer une entreprise d'entretien ménager.
Conçue pour un usage par le gestionnaire uniquement — aucun compte utilisateur,
toutes les données sont stockées localement dans le navigateur (localStorage).

## Modules

- **Tableau de bord** — pipeline actif, soumissions à relancer, factures en retard, heures de la semaine
- **Pipeline de vente** — kanban drag & drop (Leads → Contacté → Soumission → Négociation → Gagné/Perdu)
- **Soumissions** — éditeur de lignes, taxes TPS/TVQ, **versions multiples**, export PDF élégant
- **Horaires** — vue semaine, équipes colorées, quarts assignés aux clients, duplication à la semaine suivante
- **Factures** — génération depuis une soumission acceptée, suivi payée/impayée/en retard (pas de comptabilité)
- **Clients** — registre partagé entre tous les modules

## Export PDF

Le bouton « Exporter PDF » ouvre le dialogue d'impression du navigateur :
choisir « Enregistrer au format PDF » comme destination.

## Démarrage

Ouvrir `index.html` dans un navigateur. Des données de démonstration sont
chargées au premier lancement ; « Réglages → Réinitialiser les données »
permet de repartir à neuf.

---
Programmé par Claude Code (Anthropic).

# Déployer Lustre sur Dreamhost — guide pour Martin

Ce document est volontairement détaillé. Tu n'es pas développeur, alors je
te dis **quoi faire**, **quand**, et **pourquoi** — pas juste des commandes.

---

## 1. Choisir le bon plan Dreamhost

Lustre a maintenant deux composants :

1. Un **frontend** (le fichier `index.html`) — n'importe quel hébergement
   peut servir ça.
2. Un **backend Node.js + PostgreSQL** — c'est ça qui demande un plan
   particulier.

**Mon conseil ferme** : prends un **DreamCompute** ou un **DreamHost VPS**.

| Plan | Compatible ? | Pourquoi |
|------|--------------|----------|
| Shared Hosting | ❌ Non | Ne supporte ni Node.js durable, ni PostgreSQL. |
| DreamPress (WordPress) | ❌ Non | Spécifique WordPress, pas Node. |
| **DreamHost VPS** | ✅ Oui — recommandé | Linux complet, Node + Postgres installables, panneau de contrôle simple. |
| **DreamCompute** | ✅ Oui — le plus puissant | Serveur cloud à la carte, plus de contrôle. |

À partir de ~10 $/mois pour un petit VPS — largement suffisant au début.

> Si tu n'as **que** du Shared Hosting et que tu veux quand même démarrer
> sans changer de plan, on peut héberger le **backend ailleurs** (Railway,
> Render, Fly.io — tous ont un palier gratuit) et garder le frontend chez
> Dreamhost. Dis-le-moi et je te ferai un autre guide.

---

## 2. Une seule fois : préparer le serveur

Tu fais ces étapes une fois après avoir loué ton VPS. Connecte-toi en SSH
(Dreamhost te donne un utilisateur et un mot de passe ; ouvre le terminal
de ton Mac/Windows et tape `ssh ton_utilisateur@ton.serveur.com`).

### a) Installer Node.js, PostgreSQL et nginx

```bash
sudo apt update
sudo apt install -y curl ca-certificates gnupg postgresql nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Tu vérifies que tout est installé :

```bash
node --version    # doit afficher v20.x ou v22.x
psql --version    # PostgreSQL 14+ idéalement
nginx -v
```

### b) Créer la base de données et son rôle applicatif

```bash
sudo -u postgres psql
```

Tu es maintenant dans Postgres. Tape (un par un) :

```sql
CREATE DATABASE lustre;
ALTER USER postgres PASSWORD 'CHANGE-MOI-mot-de-passe-admin';
\q
```

Le rôle `lustre_app` (non-superuser, soumis à la RLS) sera créé
automatiquement par la migration.

### c) Récupérer le code

```bash
cd ~
git clone https://github.com/martinle-sudo/Test_GPT.git lustre
cd lustre/backend
npm install --omit=dev
```

### d) Configurer les variables d'environnement

```bash
cp .env.example .env
nano .env
```

Tu **dois** changer (au minimum) :

```
NODE_ENV=production
COOKIE_SECURE=true                 # OBLIGATOIRE en HTTPS
DATABASE_URL=postgres://lustre_app:UN-NOUVEAU-MOT-DE-PASSE@localhost:5432/lustre
DATABASE_ADMIN_URL=postgres://postgres:CHANGE-MOI-mot-de-passe-admin@localhost:5432/lustre
CORS_ORIGIN=https://app.tondomaine.com
APP_BASE_URL=https://app.tondomaine.com
STRIPE_SECRET_KEY=sk_live_XXXXXXXXX
STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXX
STRIPE_PRICE_ID=price_XXXXXXXXX
```

> Important : le mot de passe `lustre_app` dans `DATABASE_URL` doit
> correspondre à celui dans la migration. Soit tu changes la migration
> avant `npm run db:migrate`, soit tu changes le mot de passe après dans
> Postgres (`ALTER USER lustre_app PASSWORD '...';`).

### e) Appliquer les migrations

```bash
npm run db:migrate
```

Tu dois voir trois fichiers `.sql` appliqués.

### f) Démarrer l'application avec un gestionnaire (PM2)

PM2 est ce qui garde Node en route et le redémarre automatiquement si
quelque chose plante.

```bash
sudo npm install -g pm2
pm2 start src/server.js --name lustre
pm2 save
pm2 startup    # suit l'instruction qu'il affiche pour démarrer au boot
```

Tu testes :

```bash
curl http://localhost:4000/api/health
```

Tu dois voir `{"ok":true}`.

### g) Mettre nginx devant pour le HTTPS

Tu crées le fichier `/etc/nginx/sites-available/lustre` :

```nginx
server {
  listen 80;
  server_name app.tondomaine.com;

  location / {
    proxy_pass http://localhost:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Tu actives :

```bash
sudo ln -s /etc/nginx/sites-available/lustre /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Puis tu obtiens un certificat HTTPS gratuit avec Certbot :

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.tondomaine.com
```

Certbot modifie automatiquement la config nginx pour activer le HTTPS.

### h) Configurer Stripe en production

1. **stripe.com** → bascule en mode *Live* (pas Test).
2. **Produits** → crée ton produit Lustre + un prix → copie le `price_id`.
3. **Développeurs → Clés API** → copie ta `sk_live_...`.
4. **Développeurs → Webhooks** → ajoute un endpoint
   `https://app.tondomaine.com/api/billing/webhook` avec les événements :
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

   → copie le **signing secret** (`whsec_...`).
5. Remets ces trois valeurs dans le `.env` :
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_ID=price_...
   ```
6. Redémarre :
   ```bash
   pm2 restart lustre
   ```

---

## 3. Pour mettre à jour Lustre plus tard

Quand tu pousses une nouvelle version sur GitHub :

```bash
cd ~/lustre
git pull
cd backend
npm install --omit=dev
npm run db:migrate    # applique les nouvelles migrations s'il y en a
pm2 restart lustre
```

---

## 4. Sauvegardes (à ne pas négliger)

Ajoute ce script en *cron* pour sauvegarder Postgres chaque nuit :

```bash
crontab -e
```

Et ajoute la ligne :

```
0 3 * * * pg_dump -U postgres lustre | gzip > ~/backups/lustre-$(date +\%F).sql.gz
```

Et crée le dossier :

```bash
mkdir -p ~/backups
```

Pense aussi à télécharger ces sauvegardes de temps en temps sur ton Mac.

---

## 5. Si quelque chose ne marche pas

```bash
pm2 logs lustre               # voir les erreurs du backend
sudo tail -f /var/log/nginx/error.log
sudo systemctl status postgresql
```

Et si tu es bloqué, recopie le message d'erreur et envoie-le-moi : je
te dirai quoi faire.

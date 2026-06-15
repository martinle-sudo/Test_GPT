import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Le frontend est UN seul fichier (../../index.html à la racine du repo).
// En production sur le serveur de Martin, on sert le même fichier depuis
// le backend pour que tout vive sur la même origine (cookies + CSRF propres).
// __dirname = backend/src → on remonte 2 fois pour atteindre la racine.
const frontendDir = path.resolve(__dirname, '..', '..');
import {
  securityHeaders,
  globalLimiter,
} from './middleware/security.js';
import { requestContext } from './middleware/requestContext.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { stripeWebhook } from './modules/billing/billing.webhook.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { orgRouter } from './modules/organizations/org.routes.js';
import { clientRouter } from './modules/clients/client.routes.js';
import { billingRouter } from './modules/billing/billing.routes.js';
import { stateRouter } from './modules/state/state.routes.js';

// CORS minimal compatible cookies : on reflète l'origine autorisée et on
// permet l'envoi des cookies (credentials). Pas de wildcard avec credentials.
function cors(req, res, next) {
  const origin = req.get('origin');
  if (origin && origin === env.CORS_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, X-CSRF-Token',
    );
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // derrière un proxy/HTTPS en production

  app.use(securityHeaders);
  app.use(cors);

  // ⚠ Le webhook Stripe DOIT recevoir le corps brut (Buffer) pour la
  // vérification de signature → monté AVANT express.json().
  app.post(
    '/api/billing/webhook',
    express.raw({ type: 'application/json' }),
    stripeWebhook,
  );

  // À partir d'ici : parseurs standard. La limite 4 Mo couvre largement
  // l'état Lustre d'une organisation (soumissions, contrats, etc.) sans
  // laisser la porte ouverte à un abus.
  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());
  app.use(globalLimiter);
  app.use(requestContext);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter);
  app.use('/api/orgs', orgRouter);
  app.use('/api/clients', clientRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/state', stateRouter);

  // En production : on sert l'app statique (index.html) depuis la même
  // origine que l'API. Toute requête qui ne commence pas par /api/ et
  // qui n'est pas une asset connue retombe sur index.html (la nav se
  // fait côté client). En dev, on peut désactiver ça avec SERVE_STATIC=0.
  if (process.env.SERVE_STATIC !== '0') {
    app.get('/', (_req, res) => res.sendFile(path.join(frontendDir, 'index.html')));
    // Fichiers nommés à la racine (favicon, README éventuel) — pas de
    // listing de dossier, pas d'accès au backend.
    app.use(express.static(frontendDir, { index: false, dotfiles: 'ignore' }));
    // Fallback SPA : toute route non /api/ renvoie index.html.
    app.get(/^\/(?!api\/).*/, (_req, res) =>
      res.sendFile(path.join(frontendDir, 'index.html')),
    );
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

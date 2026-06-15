import express from 'express';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
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

  // À partir d'ici : parseurs standard.
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(globalLimiter);
  app.use(requestContext);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter);
  app.use('/api/orgs', orgRouter);
  app.use('/api/clients', clientRouter);
  app.use('/api/billing', billingRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

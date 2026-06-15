import { Router } from 'express';
import { csrfProtection } from '../../middleware/csrf.js';
import { requireAuth, requireOrg, requireRole } from '../../middleware/auth.js';
import * as ctrl from './billing.controller.js';

export const billingRouter = Router();

billingRouter.use(requireAuth, requireOrg);

// Voir l'état : un "reader" suffit.
billingRouter.get('/status', requireRole('reader'), ctrl.status);

// Démarrer ou gérer un abonnement : réservé aux ADMIN (c'est de l'argent)
// + protection CSRF.
billingRouter.post('/checkout', requireRole('admin'), csrfProtection, ctrl.checkout);
billingRouter.post('/portal', requireRole('admin'), csrfProtection, ctrl.portal);

import { Router } from 'express';
import { csrfProtection } from '../../middleware/csrf.js';
import { requireAuth, requireOrg, requireRole } from '../../middleware/auth.js';
import * as ctrl from './state.controller.js';

export const stateRouter = Router();

stateRouter.use(requireAuth, requireOrg);

// Lecture : un "reader" suffit.
stateRouter.get('/', requireRole('reader'), ctrl.get);

// Écriture : "member" minimum + CSRF (et limite de taille du JSON déjà
// imposée par express.json({ limit: '1mb' }) dans app.js).
stateRouter.put('/', requireRole('member'), csrfProtection, ctrl.put);

import { Router } from 'express';
import { csrfProtection } from '../../middleware/csrf.js';
import { requireAuth, requireOrg, requireRole } from '../../middleware/auth.js';
import * as ctrl from './client.controller.js';

export const clientRouter = Router();

// Toute la ressource est protégée : connecté + organisation active.
clientRouter.use(requireAuth, requireOrg);

// Lecture : un "reader" suffit.
clientRouter.get('/', requireRole('reader'), ctrl.list);

// Écriture : "member" minimum + CSRF.
clientRouter.post('/', requireRole('member'), csrfProtection, ctrl.create);
clientRouter.put('/:id', requireRole('member'), csrfProtection, ctrl.update);
clientRouter.delete('/:id', requireRole('member'), csrfProtection, ctrl.remove);

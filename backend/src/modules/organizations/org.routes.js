import { Router } from 'express';
import { csrfProtection } from '../../middleware/csrf.js';
import { requireAuth, requireOrg, requireRole } from '../../middleware/auth.js';
import * as ctrl from './org.controller.js';

export const orgRouter = Router();

// Toutes les routes exigent au minimum un utilisateur connecté.
orgRouter.use(requireAuth);

orgRouter.get('/', ctrl.myOrganizations);
orgRouter.post('/', csrfProtection, ctrl.createOrg);

// Gestion des membres : nécessite une organisation active.
orgRouter.get('/members', requireOrg, ctrl.members);
// Ajouter/retirer un membre : réservé aux ADMIN.
orgRouter.post('/members', requireOrg, requireRole('admin'), csrfProtection, ctrl.setMember);
orgRouter.delete('/members/:userId', requireOrg, requireRole('admin'), csrfProtection, ctrl.deleteMember);

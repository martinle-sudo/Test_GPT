import { Router } from 'express';
import { authLimiter } from '../../middleware/security.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { requireAuth } from '../../middleware/auth.js';
import * as ctrl from './auth.controller.js';

export const authRouter = Router();

// Inscription / connexion : limiteur strict anti-brute-force.
// (Pas de CSRF ici : l'utilisateur n'a pas encore de session/secret.)
authRouter.post('/register', authLimiter, ctrl.register);
authRouter.post('/login', authLimiter, ctrl.login);

// Lecture d'état : pas de mutation, pas de CSRF.
authRouter.get('/me', ctrl.me);
authRouter.get('/csrf', ctrl.csrf);

// Mutations sur une session existante : CSRF exigé.
authRouter.post('/logout', requireAuth, csrfProtection, ctrl.logout);
authRouter.post('/switch-org', requireAuth, csrfProtection, ctrl.switchOrg);

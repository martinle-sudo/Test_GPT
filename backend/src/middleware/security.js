import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// En-têtes de sécurité HTTP standard (anti-clickjacking, no-sniff, etc.).
export const securityHeaders = helmet();

// Limiteur global : amortit les abus / scans.
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez plus tard' },
});

// Limiteur strict sur l'authentification : freine le bourrage de
// mots de passe (brute force) sur /login et /register.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez dans quelques minutes' },
});

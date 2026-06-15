import crypto from 'node:crypto';
import { forbidden, unauthorized } from '../utils/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Comparaison à temps constant (évite les attaques temporelles).
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Protection CSRF — pattern "synchronizer token" :
//   * chaque session porte un secret CSRF (généré à la connexion) ;
//   * le frontend le récupère via GET /api/auth/csrf et le renvoie dans
//     l'en-tête X-CSRF-Token sur chaque requête mutante (POST/PUT/...).
// Un site tiers ne peut PAS lire ce secret (cookie httpOnly + même origine),
// donc ne peut pas forger de requête valide au nom de l'utilisateur.
export function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!req.session) return next(unauthorized());

  const provided = req.get('x-csrf-token');
  if (!provided || !safeEqual(provided, req.session.csrf_secret)) {
    return next(forbidden('Jeton CSRF manquant ou invalide'));
  }
  next();
}

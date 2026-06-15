import { unauthorized, forbidden } from '../utils/errors.js';

// Exige un utilisateur connecté.
export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

// Exige une organisation active (utilisateur connecté + tenant sélectionné).
export function requireOrg(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (!req.membership) return next(forbidden('Aucune organisation active'));
  next();
}

// Hiérarchie des rôles : admin > member > reader.
export const ROLE_RANK = { reader: 1, member: 2, admin: 3 };

// Exige au moins le rôle donné dans l'organisation active.
// Ex. requireRole('admin') pour la facturation, requireRole('member')
// pour modifier des données, requireRole('reader') pour lire.
export function requireRole(minRole) {
  const needed = ROLE_RANK[minRole];
  if (!needed) throw new Error(`Rôle inconnu : ${minRole}`);
  return (req, _res, next) => {
    if (!req.membership) return next(forbidden('Aucune organisation active'));
    const have = ROLE_RANK[req.membership.role] ?? 0;
    if (have >= needed) return next();
    return next(forbidden('Privilèges insuffisants'));
  };
}

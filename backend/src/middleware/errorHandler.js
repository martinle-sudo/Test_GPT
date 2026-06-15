import { AppError } from '../utils/errors.js';
import { isProd } from '../config/env.js';

// 404 pour toute route non trouvée.
export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Ressource introuvable' });
}

// Gestionnaire d'erreurs central : traduit les exceptions en JSON propre,
// sans jamais divulguer de détails internes en production.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res
      .status(err.status)
      .json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  // Erreurs portant un status + expose (ex. assertStripe → 503) : message sûr.
  if (err?.expose && Number.isInteger(err.status)) {
    return res.status(err.status).json({ error: err.message });
  }
  // Violation d'unicité PostgreSQL → 409 lisible.
  if (err?.code === '23505') {
    return res.status(409).json({ error: 'Cette ressource existe déjà' });
  }
  console.error('Erreur non gérée :', err);
  res.status(500).json({
    error: 'Erreur interne du serveur',
    ...(isProd ? {} : { debug: err.message }),
  });
}

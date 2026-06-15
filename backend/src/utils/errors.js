// Erreur applicative porteuse d'un code HTTP. Le gestionnaire d'erreurs
// central la traduit en réponse JSON propre.
export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
    this.expose = true; // message sûr à montrer au client
  }
}

export const badRequest = (msg, details) => new AppError(400, msg, details);
export const unauthorized = (msg = 'Authentification requise') => new AppError(401, msg);
export const forbidden = (msg = 'Accès refusé') => new AppError(403, msg);
export const notFound = (msg = 'Introuvable') => new AppError(404, msg);
export const conflict = (msg) => new AppError(409, msg);

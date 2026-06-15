// Enrobe un handler async pour que toute exception soit transmise à
// next() (et donc au gestionnaire d'erreurs central) au lieu de planter
// silencieusement la requête.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

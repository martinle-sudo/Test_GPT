import { badRequest } from './errors.js';

// Valide `data` contre un schéma zod. Lève une AppError 400 lisible si
// invalide, renvoie les données typées/nettoyées sinon.
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const flat = result.error.flatten();
    throw badRequest('Données invalides', flat.fieldErrors);
  }
  return result.data;
}

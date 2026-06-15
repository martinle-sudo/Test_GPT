import dotenv from 'dotenv';

// Exécuté une seule fois avant toute la suite de tests : charge la config
// de test et applique les migrations sur la base de test.
export default async function setup() {
  dotenv.config({ path: '.env.test' });
  const { runMigrations } = await import('../src/db/runMigrations.js');
  await runMigrations({ silent: true });
}

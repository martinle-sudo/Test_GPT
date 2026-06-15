import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Charge .env.test avant les tests (config DB de test).
    setupFiles: ['./tests/setup.env.js'],
    // Applique les migrations sur la base de test une fois au démarrage.
    globalSetup: ['./tests/globalSetup.js'],
    // Tests touchant la base : on évite l'exécution parallèle des fichiers
    // pour des résultats déterministes.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});

import { createApp } from './app.js';
import { env, stripeConfigured } from './config/env.js';
import { pool } from './db/pool.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`✓ Lustre API démarrée sur http://localhost:${env.PORT}`);
  console.log(`  Environnement : ${env.NODE_ENV}`);
  if (!stripeConfigured) {
    console.log('  ⚠ Stripe non configuré (routes de facturation désactivées)');
  }
});

// Arrêt propre : on ferme le serveur HTTP puis le pool PostgreSQL.
async function shutdown(signal) {
  console.log(`\n${signal} reçu, arrêt en cours…`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

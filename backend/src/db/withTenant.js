import { pool } from './pool.js';

/**
 * Exécute `fn` dans une transaction où la variable de session
 * `app.current_org` est fixée à l'organisation fournie. La Row Level
 * Security de PostgreSQL restreint alors AUTOMATIQUEMENT chaque requête
 * aux lignes de cette organisation — même un `select * from clients`
 * sans clause WHERE ne renverra que les données du bon tenant.
 *
 * set_config(..., true) => portée LOCALE à la transaction : aucune fuite
 * de contexte entre deux requêtes qui réutilisent la même connexion.
 *
 * @param {string} orgId  UUID de l'organisation active
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTenant(orgId, fn) {
  if (!orgId) {
    throw new Error('withTenant: organization id manquant (isolation impossible)');
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.current_org', $1, true)", [
      String(orgId),
    ]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

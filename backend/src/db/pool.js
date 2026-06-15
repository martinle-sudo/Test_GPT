import pg from 'pg';
import { env } from '../config/env.js';

// Pool de connexions applicatif : connecté en tant que "lustre_app"
// (rôle soumis à la Row Level Security). TOUTES les requêtes des
// utilisateurs passent par ici.
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('Erreur inattendue du pool PostgreSQL :', err);
});

// Requête simple hors contexte tenant (tables d'auth : users, sessions,
// memberships, organizations — non soumises à la RLS).
export function query(text, params) {
  return pool.query(text, params);
}

// Transaction générique (sans contexte tenant).
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
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

export async function closePool() {
  await pool.end();
}

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { pool, tx } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { conflict, unauthorized } from '../../utils/errors.js';

const BCRYPT_ROUNDS = 12;

// --- Mots de passe -----------------------------------------
export function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}
export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// --- Jetons de session --------------------------------------
// On génère un jeton aléatoire fort, on l'envoie au client dans un cookie
// httpOnly, et on ne stocke en base que son HASH (SHA-256). Ainsi une
// fuite de la table sessions ne donne aucun cookie réutilisable.
export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const normalizeEmail = (email) => String(email).trim().toLowerCase();

// --- Inscription : crée l'utilisateur ----------------------
export async function registerUser({ email, password, name }) {
  const normalized = normalizeEmail(email);
  const existing = await pool.query(
    'select 1 from users where lower(email) = $1',
    [normalized],
  );
  if (existing.rows.length) {
    throw conflict('Un compte existe déjà avec ce courriel');
  }
  const password_hash = await hashPassword(password);
  const { rows } = await pool.query(
    `insert into users (email, password_hash, name)
     values ($1, $2, $3)
     returning id, email, name, created_at`,
    [normalized, password_hash, name ?? null],
  );
  return rows[0];
}

// --- Connexion : vérifie les identifiants ------------------
export async function authenticate({ email, password }) {
  const normalized = normalizeEmail(email);
  const { rows } = await pool.query(
    'select id, email, name, password_hash from users where lower(email) = $1',
    [normalized],
  );
  const user = rows[0];
  // Comparaison effectuée même si l'utilisateur n'existe pas, pour éviter
  // de révéler l'existence d'un compte via le temps de réponse.
  const hash = user?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = await verifyPassword(password, hash);
  if (!user || !ok) {
    throw unauthorized('Courriel ou mot de passe incorrect');
  }
  return { id: user.id, email: user.email, name: user.name };
}

// --- Sessions ----------------------------------------------
export async function createSession(userId, { currentOrgId = null } = {}) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const csrfSecret = generateToken(24);
  const expires = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600 * 1000);
  const { rows } = await pool.query(
    `insert into sessions (token_hash, user_id, current_org_id, csrf_secret, expires_at)
     values ($1, $2, $3, $4, $5)
     returning id, csrf_secret, expires_at`,
    [tokenHash, userId, currentOrgId, csrfSecret, expires],
  );
  // Le jeton brut n'existe qu'ici : renvoyé au client, jamais re-stocké.
  return { token, session: rows[0] };
}

export async function destroySession(token) {
  if (!token) return;
  await pool.query('delete from sessions where token_hash = $1', [
    hashToken(token),
  ]);
}

export async function setSessionOrg(sessionId, orgId) {
  await pool.query(
    'update sessions set current_org_id = $2 where id = $1',
    [sessionId, orgId],
  );
}

// Crée une organisation et y rattache l'utilisateur comme admin, le tout
// dans une seule transaction (cohérence garantie).
export async function createOrganizationFor(userId, name) {
  return tx(async (client) => {
    const org = await client.query(
      'insert into organizations (name) values ($1) returning id, name, created_at',
      [name],
    );
    await client.query(
      `insert into memberships (user_id, organization_id, role)
       values ($1, $2, 'admin')`,
      [userId, org.rows[0].id],
    );
    return org.rows[0];
  });
}

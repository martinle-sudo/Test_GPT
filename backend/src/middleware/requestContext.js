import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { hashToken } from '../modules/auth/auth.service.js';

// Lit le cookie de session, charge l'utilisateur et son rôle dans
// l'organisation active, et les attache à req. Ne bloque jamais : si pas
// de session, req.user reste null (ce sont requireAuth/requireRole qui
// décident d'autoriser ou non).
export async function requestContext(req, res, next) {
  req.session = null;
  req.user = null;
  req.membership = null;
  try {
    const raw = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (!raw) return next();

    const { rows } = await pool.query(
      `select s.id, s.user_id, s.current_org_id, s.csrf_secret, s.expires_at,
              u.email, u.name as user_name
         from sessions s
         join users u on u.id = s.user_id
        where s.token_hash = $1 and s.expires_at > now()`,
      [hashToken(raw)],
    );
    if (!rows.length) return next();

    const s = rows[0];
    req.session = s;
    req.user = { id: s.user_id, email: s.email, name: s.user_name };

    if (s.current_org_id) {
      const m = await pool.query(
        'select role from memberships where user_id = $1 and organization_id = $2',
        [s.user_id, s.current_org_id],
      );
      if (m.rows.length) {
        req.membership = {
          organizationId: s.current_org_id,
          role: m.rows[0].role,
        };
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

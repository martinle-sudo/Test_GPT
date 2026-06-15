import { z } from 'zod';
import { validate } from '../../utils/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { setSessionCookie, clearSessionCookie } from './cookies.js';
import {
  registerUser,
  authenticate,
  createSession,
  destroySession,
  createOrganizationFor,
  setSessionOrg,
} from './auth.service.js';
import { env } from '../../config/env.js';

const credentialsSchema = z.object({
  email: z.string().email('Courriel invalide'),
  password: z.string().min(10, 'Le mot de passe doit faire au moins 10 caractères'),
  name: z.string().trim().min(1).max(120).optional(),
});

// POST /api/auth/register
// Crée le compte, une première organisation (l'utilisateur en devient
// admin), ouvre la session et pose le cookie.
export const register = asyncHandler(async (req, res) => {
  const data = validate(credentialsSchema, req.body);
  const user = await registerUser(data);
  const org = await createOrganizationFor(
    user.id,
    data.name ? `${data.name} — organisation` : 'Mon organisation',
  );
  const { token, session } = await createSession(user.id, {
    currentOrgId: org.id,
  });
  setSessionCookie(res, token, session.expires_at);
  res.status(201).json({
    user,
    organization: org,
    csrfToken: session.csrf_secret,
  });
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const data = validate(credentialsSchema.pick({ email: true, password: true }), req.body);
  const user = await authenticate(data);
  const { token, session } = await createSession(user.id);
  setSessionCookie(res, token, session.expires_at);
  res.json({ user, csrfToken: session.csrf_secret });
});

// POST /api/auth/logout
export const logout = asyncHandler(async (req, res) => {
  const raw = req.cookies?.[env.SESSION_COOKIE_NAME];
  await destroySession(raw);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/me — état de session courant (pour le frontend au boot).
export const me = asyncHandler(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({
    user: req.user,
    membership: req.membership,
    csrfToken: req.session?.csrf_secret ?? null,
  });
});

// GET /api/auth/csrf — fournit le jeton CSRF au frontend.
export const csrf = asyncHandler(async (req, res) => {
  if (!req.session) return res.json({ csrfToken: null });
  res.json({ csrfToken: req.session.csrf_secret });
});

// POST /api/auth/switch-org — change l'organisation active de la session.
const switchSchema = z.object({ organizationId: z.string().uuid() });
export const switchOrg = asyncHandler(async (req, res) => {
  const { organizationId } = validate(switchSchema, req.body);
  // On vérifie l'appartenance avant de basculer (sécurité).
  const { pool } = await import('../../db/pool.js');
  const m = await pool.query(
    'select role from memberships where user_id = $1 and organization_id = $2',
    [req.user.id, organizationId],
  );
  if (!m.rows.length) {
    return res.status(403).json({ error: 'Vous n\'appartenez pas à cette organisation' });
  }
  await setSessionOrg(req.session.id, organizationId);
  res.json({ organizationId, role: m.rows[0].role });
});

import { env } from '../../config/env.js';

// Options du cookie de session :
//   httpOnly  → inaccessible au JavaScript du navigateur (anti-vol XSS)
//   secure    → envoyé seulement en HTTPS (activer en production)
//   sameSite  → 'lax' bloque l'envoi cross-site (défense CSRF supplémentaire)
const baseCookie = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax',
  path: '/',
});

export function setSessionCookie(res, token, expiresAt) {
  res.cookie(env.SESSION_COOKIE_NAME, token, {
    ...baseCookie(),
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(env.SESSION_COOKIE_NAME, baseCookie());
}

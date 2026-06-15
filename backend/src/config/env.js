import 'dotenv/config';
import { z } from 'zod';

// Validation stricte de la configuration au démarrage : si une variable
// essentielle manque ou est mal formée, le serveur refuse de démarrer
// (mieux qu'un plantage obscur plus tard).
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL est requis'),
  DATABASE_ADMIN_URL: z.string().min(1).optional(),

  SESSION_COOKIE_NAME: z.string().default('lustre_sid'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(168),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  APP_BASE_URL: z.string().default('http://localhost:5173'),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Configuration invalide :');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

// Stripe est optionnel en dev : on prévient mais on ne bloque pas.
// On exige une vraie clé (pas un placeholder type "sk_test_xxx") avant
// de considérer Stripe « configuré » — sinon les routes facturation
// renvoient 503 avec un message clair plutôt qu'une erreur Stripe opaque.
function isRealStripeKey(k) {
  if (!k) return false;
  if (!/^(sk_test_|sk_live_)/.test(k)) return false;
  // Au-delà du préfixe : au moins 16 caractères, pas "xxx".
  const tail = k.replace(/^(sk_test_|sk_live_)/, '');
  return tail.length >= 16 && !/^x+$/i.test(tail);
}
export const stripeConfigured = Boolean(
  isRealStripeKey(env.STRIPE_SECRET_KEY) && env.STRIPE_WEBHOOK_SECRET,
);

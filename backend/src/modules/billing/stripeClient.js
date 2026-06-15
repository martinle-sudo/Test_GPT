import Stripe from 'stripe';
import { env, stripeConfigured } from '../../config/env.js';

// Client Stripe initialisé paresseusement. En développement, si les clés
// ne sont pas configurées, on expose `stripe = null` et les routes de
// facturation renvoient une erreur claire plutôt que de planter au boot.
export const stripe = stripeConfigured
  ? new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' })
  : null;

export function assertStripe() {
  if (!stripe) {
    const err = new Error(
      'Stripe non configuré : définissez STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET dans .env',
    );
    err.status = 503;
    err.expose = true;
    throw err;
  }
}

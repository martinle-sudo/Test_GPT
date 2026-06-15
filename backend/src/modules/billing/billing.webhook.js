import { env } from '../../config/env.js';
import { stripe } from './stripeClient.js';
import { handleStripeEvent } from './billing.service.js';

// Handler du webhook Stripe. Monté AVANT le parseur JSON global avec
// express.raw, car la vérification de signature exige le corps BRUT.
//
// Sécurité : on vérifie la signature `stripe-signature` avec le secret
// du webhook. Sans signature valide, on rejette (empêche un tiers de
// falsifier un événement « abonnement payé »).
export async function stripeWebhook(req, res) {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe non configuré' });
  }
  const signature = req.get('stripe-signature');
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, // Buffer brut (express.raw)
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error('Signature webhook invalide :', err.message);
    return res.status(400).json({ error: 'Signature invalide' });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    // On log mais on renvoie 200 si l'événement est valide : Stripe
    // réessaiera tant qu'on n'a pas accusé réception. On renvoie 500
    // uniquement si on veut un retry. Ici on tente, et en cas d'échec
    // de traitement on demande un retry (500) pour ne pas perdre l'info.
    console.error('Échec du traitement du webhook :', err);
    return res.status(500).json({ error: 'Traitement échoué' });
  }

  res.json({ received: true });
}

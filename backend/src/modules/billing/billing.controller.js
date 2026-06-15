import { asyncHandler } from '../../utils/asyncHandler.js';
import * as svc from './billing.service.js';

// Contrôleur volontairement MINCE : aucune logique Stripe ici, on délègue
// entièrement au service de facturation.

// POST /api/billing/checkout — démarre un abonnement.
export const checkout = asyncHandler(async (req, res) => {
  const { url } = await svc.createCheckoutSession({
    organizationId: req.membership.organizationId,
    email: req.user.email,
    priceId: req.body?.priceId,
  });
  res.json({ url });
});

// POST /api/billing/portal — gérer/annuler l'abonnement.
export const portal = asyncHandler(async (req, res) => {
  const { url } = await svc.createBillingPortalSession({
    organizationId: req.membership.organizationId,
  });
  res.json({ url });
});

// GET /api/billing/status — état d'abonnement de l'organisation active.
export const status = asyncHandler(async (req, res) => {
  res.json(await svc.getSubscriptionStatus(req.membership.organizationId));
});

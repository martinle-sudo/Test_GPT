import { pool } from '../../db/pool.js';
import { withTenant } from '../../db/withTenant.js';
import { env } from '../../config/env.js';
import { stripe, assertStripe } from './stripeClient.js';

// ============================================================
//  Logique métier de facturation — isolée du contrôleur HTTP.
//  Le contrôleur ne fait qu'appeler ces fonctions et renvoyer
//  le résultat ; toute la logique Stripe vit ici.
// ============================================================

// Récupère (ou crée) la ligne d'abonnement d'une organisation.
// IMPORTANT : passe par withTenant pour que la RLS autorise l'insertion
// (organization_id doit correspondre à app.current_org sinon WITH CHECK refuse).
function getOrCreateSubscriptionRow(organizationId) {
  return withTenant(organizationId, async (db) => {
    const existing = await db.query(
      'select * from subscriptions where organization_id = $1',
      [organizationId],
    );
    if (existing.rows.length) return existing.rows[0];
    const inserted = await db.query(
      `insert into subscriptions (organization_id, status)
       values ($1, 'inactive')
       returning *`,
      [organizationId],
    );
    return inserted.rows[0];
  });
}

// Garantit qu'un client Stripe existe pour l'organisation, et mémorise son id.
async function ensureStripeCustomer(organizationId, email) {
  const row = await getOrCreateSubscriptionRow(organizationId);
  if (row.stripe_customer_id) return row.stripe_customer_id;

  const customer = await stripe.customers.create({
    email,
    metadata: { organization_id: organizationId },
  });
  await withTenant(organizationId, (db) =>
    db.query(
      'update subscriptions set stripe_customer_id = $2, updated_at = now() where organization_id = $1',
      [organizationId, customer.id],
    ),
  );
  return customer.id;
}

// --- Stripe Checkout : crée une session d'abonnement --------
export async function createCheckoutSession({ organizationId, email, priceId }) {
  assertStripe();
  const customerId = await ensureStripeCustomer(organizationId, email);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId || env.STRIPE_PRICE_ID, quantity: 1 }],
    // On marque l'organisation pour la retrouver dans le webhook.
    subscription_data: { metadata: { organization_id: organizationId } },
    client_reference_id: organizationId,
    success_url: `${env.APP_BASE_URL}/billing?success=1`,
    cancel_url: `${env.APP_BASE_URL}/billing?canceled=1`,
  });
  return { url: session.url, id: session.id };
}

// --- Portail client Stripe (gérer/annuler l'abonnement) -----
export async function createBillingPortalSession({ organizationId }) {
  assertStripe();
  const row = await getOrCreateSubscriptionRow(organizationId);
  if (!row.stripe_customer_id) {
    const err = new Error('Aucun abonnement à gérer pour cette organisation');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  const portal = await stripe.billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${env.APP_BASE_URL}/billing`,
  });
  return { url: portal.url };
}

// --- État d'abonnement courant (pour le frontend) ----------
export async function getSubscriptionStatus(organizationId) {
  const row = await getOrCreateSubscriptionRow(organizationId);
  const active = ['active', 'trialing'].includes(row.status);
  return {
    status: row.status,
    active,
    priceId: row.price_id,
    currentPeriodEnd: row.current_period_end,
  };
}

// ============================================================
//  Synchronisation depuis les WEBHOOKS Stripe.
//  Source de vérité = Stripe ; on reflète son état dans notre base.
// ============================================================

function resolveOrganizationId(object) {
  return (
    object?.metadata?.organization_id ||
    object?.subscription_details?.metadata?.organization_id ||
    object?.client_reference_id ||
    null
  );
}

async function syncSubscriptionRecord(subscription, organizationId) {
  if (!organizationId) return;
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;
  // Le webhook tourne sans utilisateur connecté, mais on connaît l'org cible
  // (récupérée des metadata Stripe). On l'injecte explicitement comme
  // contexte tenant → la RLS autorise l'upsert.
  await withTenant(organizationId, (db) =>
    db.query(
      `insert into subscriptions
         (organization_id, stripe_customer_id, stripe_subscription_id, status, price_id, current_period_end, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (organization_id) do update set
         stripe_customer_id     = excluded.stripe_customer_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         status                 = excluded.status,
         price_id               = excluded.price_id,
         current_period_end     = excluded.current_period_end,
         updated_at             = now()`,
      [
        organizationId,
        subscription.customer,
        subscription.id,
        subscription.status,
        priceId,
        periodEnd,
      ],
    ),
  );
}

// Aiguille chaque type d'événement vers la bonne mise à jour.
// (Fonction pure de logique : testable sans serveur HTTP.)
export async function handleStripeEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const organizationId = resolveOrganizationId(session);
      if (session.subscription && organizationId) {
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription,
        );
        await syncSubscriptionRecord(subscription, organizationId);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const organizationId = resolveOrganizationId(subscription);
      await syncSubscriptionRecord(subscription, organizationId);
      break;
    }
    default:
      // Événements non gérés : ignorés volontairement (no-op).
      break;
  }
}

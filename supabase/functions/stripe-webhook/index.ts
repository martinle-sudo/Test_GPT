// ============================================================
//  Edge Function : stripe-webhook
//  Reçoit les événements Stripe (signés) et synchronise le statut
//  d'abonnement dans la table subscriptions.
//
//  Cette fonction NE doit PAS exiger de JWT (Stripe appelle directement).
//  → à déployer avec : supabase functions deploy stripe-webhook --no-verify-jwt
//
//  La signature Stripe est vérifiée avec STRIPE_WEBHOOK_SECRET : sans elle,
//  un tiers ne peut pas falsifier un événement « abonnement payé ».
//
//  Écriture via SERVICE ROLE (contourne la RLS — légitime ici car la source
//  de vérité est Stripe, pas un utilisateur connecté).
// ============================================================
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

function orgIdFrom(obj: Record<string, unknown>): string | null {
  const md = (obj?.metadata ?? {}) as Record<string, string>;
  return (
    md.organization_id ??
    (obj?.client_reference_id as string) ??
    null
  );
}

async function syncSubscription(subscription: Stripe.Subscription, organizationId: string | null) {
  if (!organizationId) return;
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;
  await admin.from('subscriptions').upsert(
    {
      organization_id: organizationId,
      stripe_customer_id: subscription.customer as string,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      price_id: priceId,
      current_period_end: periodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' },
  );
}

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    return new Response(`Signature invalide : ${(err as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = orgIdFrom(session as unknown as Record<string, unknown>);
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await syncSubscription(sub, orgId);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(sub, orgIdFrom(sub as unknown as Record<string, unknown>));
        break;
      }
      default:
        break; // événements non gérés : ignorés
    }
  } catch (err) {
    console.error('Échec du traitement :', err);
    return new Response('Erreur de traitement', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

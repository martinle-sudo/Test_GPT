// ============================================================
//  Edge Function : stripe-checkout
//  Crée une session Stripe Checkout (abonnement) pour l'organisation.
//
//  Sécurité :
//   * L'appel est authentifié (JWT de l'utilisateur transmis par
//     supabase.functions.invoke).
//   * On vérifie que l'utilisateur est ADMIN de l'organisation via la RPC
//     has_role (la RLS s'applique avec son identité).
//   * La clé secrète Stripe vit dans les secrets Supabase, jamais exposée.
//
//  Secrets requis (supabase secrets set ...) :
//   STRIPE_SECRET_KEY, STRIPE_PRICE_ID, APP_BASE_URL
// ============================================================
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    // Client "utilisateur" : hérite du JWT → la RLS et auth.uid() s'appliquent.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    // Client "service" : contourne la RLS pour écrire la ligne subscriptions.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return json({ error: 'Non authentifié' }, 401);
    }

    const { organizationId } = await req.json();
    if (!organizationId) return json({ error: 'organizationId requis' }, 400);

    // Vérifie le rôle admin via la fonction SQL (RLS appliquée à l'utilisateur).
    const { data: isAdmin, error: roleErr } = await supabase.rpc('has_role', {
      p_org: organizationId,
      p_min: 'admin',
    });
    if (roleErr) return json({ error: roleErr.message }, 400);
    if (!isAdmin) return json({ error: 'Réservé aux administrateurs' }, 403);

    // Réutilise (ou crée) le client Stripe de l'organisation.
    const { data: sub } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', organizationId)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { organization_id: organizationId },
      });
      customerId = customer.id;
      await admin.from('subscriptions').upsert(
        { organization_id: organizationId, stripe_customer_id: customerId, status: 'inactive' },
        { onConflict: 'organization_id' },
      );
    }

    const baseUrl = Deno.env.get('APP_BASE_URL') ?? '';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: Deno.env.get('STRIPE_PRICE_ID'), quantity: 1 }],
      subscription_data: { metadata: { organization_id: organizationId } },
      client_reference_id: organizationId,
      success_url: `${baseUrl}/?billing=success`,
      cancel_url: `${baseUrl}/?billing=cancel`,
    });

    return json({ url: session.url });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================
//  Edge Function : stripe-portal
//  Ouvre le portail client Stripe (gérer / annuler l'abonnement).
//  Réservé aux administrateurs de l'organisation.
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return json({ error: 'Non authentifié' }, 401);

    const { organizationId } = await req.json();
    if (!organizationId) return json({ error: 'organizationId requis' }, 400);

    const { data: isAdmin } = await supabase.rpc('has_role', {
      p_org: organizationId,
      p_min: 'admin',
    });
    if (!isAdmin) return json({ error: 'Réservé aux administrateurs' }, 403);

    const { data: sub } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (!sub?.stripe_customer_id) {
      return json({ error: 'Aucun abonnement à gérer' }, 400);
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${Deno.env.get('APP_BASE_URL') ?? ''}/`,
    });
    return json({ url: portal.url });
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

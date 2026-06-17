// ============================================================
//  Edge Function : stripe-sync-seats
//  Aligne la quantité de l'abonnement Stripe sur le nombre RÉEL de membres
//  de l'organisation (1 siège par membre). Facturation graduée : le 1ᵉʳ
//  siège à 19$, chaque siège suivant à 5$ (configuré dans le prix Stripe).
//
//  Appelée :
//   * quand un invité rejoint l'organisation (claim) → +1 siège ;
//   * quand un admin retire un membre → −1 siège.
//
//  Sécurité :
//   * L'appelant doit être MEMBRE de l'organisation (RPC is_member sous son
//     JWT). La fonction ne fait que refléter la réalité (nb d'adhésions) dans
//     Stripe — elle ne peut pas être détournée pour toucher une autre org.
//   * La quantité provient de la base (source de vérité), pas du client.
//
//  Secrets requis : STRIPE_SECRET_KEY (+ ceux déjà fournis par Supabase).
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
    // Client "utilisateur" : la RLS et auth.uid() s'appliquent (vérif. membre).
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    // Client "service" : lit le compte de sièges + la ligne subscriptions.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return json({ error: 'Non authentifié' }, 401);

    const { organizationId } = await req.json();
    if (!organizationId) return json({ error: 'organizationId requis' }, 400);

    // L'appelant doit appartenir à l'organisation.
    const { data: isMember, error: memErr } = await supabase.rpc('is_member', {
      p_org: organizationId,
    });
    if (memErr) return json({ error: memErr.message }, 400);
    if (!isMember) return json({ error: 'Accès refusé' }, 403);

    // Nombre réel de membres = nombre de sièges à facturer (minimum 1).
    const { count, error: cntErr } = await admin
      .from('memberships')
      .select('user_id', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
    if (cntErr) return json({ error: cntErr.message }, 400);
    const seats = Math.max(count ?? 1, 1);

    // Abonnement Stripe de l'organisation.
    const { data: sub } = await admin
      .from('subscriptions')
      .select('stripe_subscription_id, status')
      .eq('organization_id', organizationId)
      .maybeSingle();

    // Pas d'abonnement actif → rien à facturer (les membres restent en démo
    // tant que l'admin ne s'est pas abonné). On ne fait rien, sans erreur.
    if (!sub?.stripe_subscription_id || !['active', 'trialing', 'past_due'].includes(sub.status)) {
      return json({ seats, synced: false });
    }

    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const item = stripeSub.items.data[0];
    if (!item) return json({ seats, synced: false });

    if (item.quantity !== seats) {
      await stripe.subscriptions.update(stripeSub.id, {
        items: [{ id: item.id, quantity: seats }],
        proration_behavior: 'create_prorations',
      });
    }
    return json({ seats, synced: true });
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

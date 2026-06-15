// En-têtes CORS partagés par les Edge Functions.
// L'app appelle ces fonctions depuis le navigateur (supabase.functions.invoke),
// donc on autorise l'origine et les en-têtes nécessaires.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

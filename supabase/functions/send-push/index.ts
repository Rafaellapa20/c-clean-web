// Supabase Edge Function — envia push notification a um funcionário
// Deploy: npx supabase functions deploy send-push
//
// Variáveis de ambiente necessárias (Supabase Dashboard → Settings → Edge Functions):
//   VAPID_PRIVATE_KEY   — chave privada VAPID (gerada com: npx web-push generate-vapid-keys)
//   VAPID_PUBLIC_KEY    — igual ao VITE_VAPID_PUBLIC_KEY da app
//   VAPID_SUBJECT       — mailto:teu@email.com

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import webpush from 'npm:web-push'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { p_worker_id, p_title, p_body } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    )

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('worker_id', p_worker_id)

    if (error) throw error
    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Sem subscricao push para este funcionario' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT'),
      Deno.env.get('VAPID_PUBLIC_KEY'),
      Deno.env.get('VAPID_PRIVATE_KEY'),
    )

    const payload = JSON.stringify({ title: p_title, body: p_body })

    await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
      ),
    )

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

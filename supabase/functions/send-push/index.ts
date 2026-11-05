import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Build a signed VAPID JWT
async function buildVapidJWT(audience: string, vapidPrivateKeyB64: string): Promise<string> {
  const header = { alg: 'ES256', typ: 'JWT' }
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'mailto:admin@cclean.app',
  }
  const enc = (s: string) => btoa(unescape(encodeURIComponent(JSON.stringify(s)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const signingInput = `${enc(header as unknown as string)}.${enc(payload as unknown as string)}`

  const rawPriv = Uint8Array.from(atob(vapidPrivateKeyB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8',
    // Wrap 32-byte raw key into minimal PKCS8 DER for P-256
    buildPKCS8(rawPriv),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])

  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return `${signingInput}.${sigB64}`
}

function buildPKCS8(rawKey: Uint8Array): ArrayBuffer {
  // PKCS8 wrapper for P-256 EC private key (no public key included)
  const header = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, // SEQUENCE, version
    0x30, 0x13, // AlgorithmIdentifier SEQUENCE
      0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // ecPublicKey OID
      0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // P-256 OID
    0x04, 0x27, // privateKey OCTET STRING
      0x30, 0x25, 0x02, 0x01, 0x01, // ECPrivateKey SEQUENCE, version
      0x04, 0x20, // key OCTET STRING
  ])
  const der = new Uint8Array(header.length + rawKey.length)
  der.set(header)
  der.set(rawKey, header.length)
  return der.buffer
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { worker_id, title, body } = await req.json() as { worker_id: string; title: string; body: string }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: worker } = await supabase
      .from('workers')
      .select('push_subscription')
      .eq('id', worker_id)
      .single()

    if (!worker?.push_subscription) {
      return new Response(JSON.stringify({ ok: false, reason: 'no_subscription' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const sub = worker.push_subscription as { endpoint: string; keys: { p256dh: string; auth: string } }
    const audience = new URL(sub.endpoint).origin
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!

    const jwt = await buildVapidJWT(audience, vapidPrivate)
    const notification = JSON.stringify({ title, body })

    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `vapid t=${jwt},k=${vapidPublic}`,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aesgcm',
        'TTL': '86400',
      },
      body: await encryptPayload(notification, sub.keys.p256dh, sub.keys.auth),
    })

    return new Response(JSON.stringify({ ok: res.ok, status: res.status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// AES-GCM encryption for Web Push payload
async function encryptPayload(payload: string, p256dhB64: string, authB64: string): Promise<Uint8Array> {
  const decode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  const receiverPublicKey = decode(p256dhB64)
  const authSecret = decode(authB64)

  const serverKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'])
  const serverPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeyPair.publicKey))

  const receiverKey = await crypto.subtle.importKey('raw', receiverPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const sharedBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverKey }, serverKeyPair.privateKey, 256)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hkdf = async (ikm: ArrayBuffer, saltArr: Uint8Array, info: Uint8Array, len: number) => {
    const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: saltArr, info }, key, len * 8))
  }

  const authInfo = new TextEncoder().encode('Content-Encoding: auth\0')
  const prk = await hkdf(sharedBits, authSecret, concat(authInfo, new Uint8Array([0])), 32)

  const keyInfo = concat(new TextEncoder().encode('Content-Encoding: aesgcm\0'), new Uint8Array([0]), receiverPublicKey, serverPublicRaw)
  const nonceInfo = concat(new TextEncoder().encode('Content-Encoding: nonce\0'), new Uint8Array([0]), receiverPublicKey, serverPublicRaw)

  const contentKey = await crypto.subtle.importKey('raw', await hkdf(prk, salt, keyInfo, 16), { name: 'AES-GCM' }, false, ['encrypt'])
  const nonce = await hkdf(prk, salt, nonceInfo, 12)

  const paddedPayload = concat(new Uint8Array(2), new TextEncoder().encode(payload))
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, contentKey, paddedPayload))

  // Build output: salt (16) + rs (4) + keyid_len (1) + server_public (65) + encrypted
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096, false)
  return concat(salt, rs, new Uint8Array([serverPublicRaw.length]), serverPublicRaw, encrypted)
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const a of arrays) { out.set(a, off); off += a.length }
  return out
}

import { rpc } from './supabase'

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export async function subscribePush(pin: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) return

  try {
    const registration = await navigator.serviceWorker.ready
    let sub = await registration.pushManager.getSubscription()
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
    }
    await rpc('save_push_subscription', {
      p_pin: pin,
      p_subscription: sub.toJSON(),
    })
  } catch {
    // Push not supported or denied — silent fail
  }
}

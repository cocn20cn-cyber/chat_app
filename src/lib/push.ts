import { supabase } from './supabase'

export type PushSetupStatus = 'idle' | 'registered' | 'not-configured' | 'unsupported' | 'failed'
export type PushEventKind = 'message' | 'call'

function vapidPublicKeyBytes(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = window.atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

async function sessionToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function registerPushSubscription(): Promise<PushSetupStatus> {
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!publicKey) return 'not-configured'
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'

  try {
    const token = await sessionToken()
    if (!token) return 'failed'
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
      ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKeyBytes(publicKey),
      })
    const response = await fetch('/api/push-subscription', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    })
    return response.ok ? 'registered' : 'failed'
  } catch {
    return 'failed'
  }
}

export async function notifyPrivateRecipient(recipientId: string, kind: PushEventKind) {
  try {
    const token = await sessionToken()
    if (!token) return
    await fetch('/api/notify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipientId, kind }),
      keepalive: true,
    })
  } catch {
    // Realtime messaging remains independent from push delivery.
  }
}

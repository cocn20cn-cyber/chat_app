import { createClient } from '@supabase/supabase-js'

function configured() {
  const url = process.env.SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && serviceRole ? { url, serviceRole } : null
}

function bearerToken(request) {
  const value = request.headers.authorization || ''
  return value.startsWith('Bearer ') ? value.slice(7) : null
}

function bodyOf(request) {
  if (typeof request.body !== 'string') return request.body || {}
  try { return JSON.parse(request.body) } catch { return {} }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' })
  const settings = configured()
  const token = bearerToken(request)
  const { subscription } = bodyOf(request)
  if (!settings) return response.status(503).json({ error: 'Push server is not configured' })
  if (!token) return response.status(401).json({ error: 'Sign in is required' })
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return response.status(400).json({ error: 'Invalid push subscription' })
  }

  const admin = createClient(settings.url, settings.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: auth, error: authError } = await admin.auth.getUser(token)
  if (authError || !auth.user) return response.status(401).json({ error: 'Invalid session' })

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (!profile) return response.status(403).json({ error: 'Private member access required' })

  const { error } = await admin.from('push_subscriptions').upsert({
    endpoint: subscription.endpoint,
    user_id: auth.user.id,
    subscription,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
  if (error) return response.status(500).json({ error: 'Could not save push subscription' })
  return response.status(200).json({ ok: true })
}

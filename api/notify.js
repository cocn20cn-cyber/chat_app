import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

function configured() {
  const url = process.env.SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  return url && serviceRole && publicKey && privateKey && subject
    ? { url, serviceRole, publicKey, privateKey, subject }
    : null
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
  const { recipientId, kind } = bodyOf(request)
  if (!settings) return response.status(503).json({ error: 'Push server is not configured' })
  if (!token) return response.status(401).json({ error: 'Sign in is required' })
  if (typeof recipientId !== 'string' || !['message', 'call'].includes(kind)) {
    return response.status(400).json({ error: 'Invalid notification request' })
  }

  const admin = createClient(settings.url, settings.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: auth, error: authError } = await admin.auth.getUser(token)
  if (authError || !auth.user || auth.user.id === recipientId) {
    return response.status(401).json({ error: 'Invalid session' })
  }

  const { data: members } = await admin
    .from('profiles')
    .select('id')
    .in('id', [auth.user.id, recipientId])
  if (!members || members.length !== 2) {
    return response.status(403).json({ error: 'Private member access required' })
  }

  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, subscription')
    .eq('user_id', recipientId)
  if (error) return response.status(500).json({ error: 'Could not read push subscriptions' })

  webpush.setVapidDetails(settings.subject, settings.publicKey, settings.privateKey)
  const payload = JSON.stringify({
    title: 'Alyas Software',
    body: kind === 'call' ? 'Incoming voice call' : 'You have a new private message.',
    url: '/',
    tag: kind === 'call' ? 'alyas-software-call' : 'alyas-software-message',
  })
  let sent = 0
  await Promise.all((subscriptions || []).map(async ({ endpoint, subscription }) => {
    try {
      await webpush.sendNotification(subscription, payload, {
        TTL: kind === 'call' ? 60 : 60 * 30,
        urgency: kind === 'call' ? 'high' : 'normal',
      })
      sent += 1
    } catch (reason) {
      const statusCode = reason && typeof reason === 'object' ? reason.statusCode : undefined
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', endpoint)
      }
    }
  }))
  return response.status(200).json({ ok: true, sent })
}

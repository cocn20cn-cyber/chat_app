import { supabase } from '../lib/supabase'
import type { Attachment, CallRecord, Message, MessageReceipt, MessageType, Profile } from '../types'

const BUCKET = 'chat-files'

export async function getProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at')
  if (error) throw new Error(error.message)
  return Promise.all((data as Profile[]).map(addAvatarSignedUrl))
}

export async function addAvatarSignedUrl(profile: Profile): Promise<Profile> {
  if (!profile.avatar_url || /^https?:\/\//i.test(profile.avatar_url)) return profile
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(profile.avatar_url, 60 * 60)
  if (error) return profile
  return { ...profile, avatar_url: data.signedUrl }
}

export async function uploadProfileAvatar(userId: string, file: File) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowed.includes(file.type)) throw new Error('Choose a JPG, PNG, WEBP, or GIF image.')
  if (file.size > 5 * 1024 * 1024) throw new Error('Profile photos need to be smaller than 5 MB.')
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${userId}/avatars/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) throw new Error('Your profile photo could not be uploaded. Please try again.')
  const { error: profileError } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', userId)
  if (profileError) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error('Your profile photo was uploaded but could not be saved. Please try again.')
  }
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  return data?.signedUrl || null
}

export async function getMessages(myId: string, friendId: string) {
  const filter = `and(sender_id.eq.${myId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${myId})`
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(filter)
    .order('created_at', { ascending: true })
    .limit(500)
  if (error) throw new Error(error.message)
  return Promise.all((data as Message[]).map(addSignedUrl))
}

export async function getCalls(myId: string, friendId: string) {
  const filter = `and(caller_id.eq.${myId},receiver_id.eq.${friendId}),and(caller_id.eq.${friendId},receiver_id.eq.${myId})`
  const { data, error } = await supabase
    .from('calls')
    .select('*')
    .or(filter)
    .order('started_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return data as CallRecord[]
}

export async function addSignedUrl(message: Message): Promise<Message> {
  if (!message.file_path) return message
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(message.file_path, 60 * 60)
  if (error) return message
  return { ...message, signed_url: data.signedUrl }
}

export async function sendTextMessage(senderId: string, receiverId: string, content: string) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ sender_id: senderId, receiver_id: receiverId, content, message_type: 'text' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Message
}

export async function sendFileMessage(
  senderId: string,
  receiverId: string,
  attachment: Attachment,
  content: string,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
) {
  const id = crypto.randomUUID()
  const safeName = attachment.file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'attachment'
  const path = `${senderId}/${id}/${safeName}`
  await uploadFile(path, attachment.file, onProgress, signal)

  const { data, error } = await supabase
    .from('messages')
    .insert({
      id,
      sender_id: senderId,
      receiver_id: receiverId,
      content: content || null,
      message_type: attachment.type,
      file_path: path,
      file_name: attachment.file.name,
      file_size: attachment.file.size,
    })
    .select()
    .single()

  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(error.message)
  }
  return addSignedUrl(data as Message)
}

async function uploadFile(path: string, file: File, onProgress: (percent: number) => void, signal: AbortSignal) {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new Error('Your session has expired. Please sign in again.')

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!baseUrl || !anonKey) throw new Error('Supabase has not been configured.')
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    const abort = () => request.abort()
    signal.addEventListener('abort', abort, { once: true })
    request.open('POST', `${baseUrl}/storage/v1/object/${BUCKET}/${encodedPath}`)
    request.setRequestHeader('apikey', anonKey)
    request.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    request.setRequestHeader('x-upsert', 'false')
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.max(1, Math.round((event.loaded / event.total) * 100)))
    }
    request.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'))
    request.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    request.onload = () => {
      signal.removeEventListener('abort', abort)
      if (request.status >= 200 && request.status < 300) {
        onProgress(100)
        resolve()
      } else {
        reject(new Error('Upload failed. Please try again.'))
      }
    }
    request.send(file)
  })
}

export async function markMessagesDelivered(myId: string, friendId: string) {
  const deliveredAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('messages')
    .update({ delivered_at: deliveredAt })
    .eq('sender_id', friendId)
    .eq('receiver_id', myId)
    .is('delivered_at', null)
    .select('id, delivered_at, seen_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as MessageReceipt[]
}

export async function markMessagesSeen(myId: string, friendId: string) {
  const seenAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('messages')
    .update({ delivered_at: seenAt, seen_at: seenAt })
    .eq('sender_id', friendId)
    .eq('receiver_id', myId)
    .is('seen_at', null)
    .select('id, delivered_at, seen_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as MessageReceipt[]
}

export async function updateLastSeen() {
  const { data } = await supabase.auth.getUser()
  if (!data.user) return
  await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', data.user.id)
}

export async function createCall(callerId: string, receiverId: string, id: string) {
  const { data, error } = await supabase
    .from('calls')
    .insert({ id, caller_id: callerId, receiver_id: receiverId, status: 'ringing' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as CallRecord
}

export async function saveCallOffer(id: string, offer: RTCSessionDescriptionInit) {
  const { error } = await supabase.from('calls').update({ offer_sdp: offer }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function saveCallAnswer(id: string, answer: RTCSessionDescriptionInit) {
  const { error } = await supabase.from('calls').update({ answer_sdp: answer, status: 'connected' }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function getPendingIncomingCall(receiverId: string) {
  const cutoff = new Date(Date.now() - 60_000).toISOString()
  const { data, error } = await supabase
    .from('calls')
    .select('*')
    .eq('receiver_id', receiverId)
    .eq('status', 'ringing')
    .not('offer_sdp', 'is', null)
    .gte('started_at', cutoff)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as CallRecord | null
}

export async function updateCall(id: string, status: CallRecord['status'], startedAt?: string) {
  const ended = status === 'ended' || status === 'rejected' || status === 'failed'
  const endedAt = ended ? new Date().toISOString() : null
  const duration = ended && startedAt ? Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)) : null
  const values = ended ? { status, ended_at: endedAt, duration } : { status }
  const { error } = await supabase.from('calls').update(values).eq('id', id)
  if (error) throw new Error(error.message)
}

export function messageTypeFor(file: File): Exclude<MessageType, 'text'> {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'file'
}

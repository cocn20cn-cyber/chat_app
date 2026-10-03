import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { addAvatarSignedUrl, addSignedUrl, markMessagesSeen, sendFileMessage, sendTextMessage } from '../services/chat'
import type { Attachment, Message, Profile } from '../types'

type ConnectionState = 'connected' | 'reconnecting'

export function useChat(myId: string, friendId: string, onProfileUpdated?: (profile: Profile) => void) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [friendTyping, setFriendTyping] = useState(false)
  const [friendOnline, setFriendOnline] = useState(false)
  const [friendLastSeen, setFriendLastSeen] = useState<string | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('reconnecting')
  const uploadController = useRef<AbortController | null>(null)
  const typingStopTimer = useRef<number | null>(null)
  const remoteTypingTimer = useRef<number | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const profileCallbackRef = useRef(onProfileUpdated)

  useEffect(() => { profileCallbackRef.current = onProfileUpdated }, [onProfileUpdated])

  const addMessage = useCallback((message: Message) => {
    setMessages((current) => {
      if (current.some((item) => item.id === message.id)) return current
      return [...current, message].sort((a, b) => a.created_at.localeCompare(b.created_at))
    })
  }, [])

  const belongsToConversation = useCallback((message: Message) => (
    (message.sender_id === myId && message.receiver_id === friendId)
    || (message.sender_id === friendId && message.receiver_id === myId)
  ), [friendId, myId])

  const broadcastMessage = useCallback((message: Message) => {
    const channel = channelRef.current
    if (!channel) return
    void channel.send({ type: 'broadcast', event: 'message-created', payload: { message } }).catch(() => undefined)
  }, [])

  const refreshMessages = useCallback(async () => {
    const filter = `and(sender_id.eq.${myId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${myId})`
    const { data, error: queryError } = await supabase
      .from('messages')
      .select('*')
      .or(filter)
      .order('created_at', { ascending: true })
      .limit(500)
    if (queryError) throw new Error(queryError.message)
    const hydrated = await Promise.all((data as Message[]).map(addSignedUrl))
    setMessages(hydrated)
  }, [friendId, myId])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    void refreshMessages()
      .catch((reason: unknown) => mounted && setError(reason instanceof Error ? reason.message : 'Could not load the conversation.'))
      .finally(() => mounted && setLoading(false))

    const channel = supabase
      .channel('two-person-chat', {
        config: { private: true, presence: { key: myId }, broadcast: { self: false, ack: true } },
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (event) => {
        const next = event.new as Message
        if (!belongsToConversation(next)) return
        void addSignedUrl(next).then(addMessage)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (event) => {
        const updated = event.new as Message
        setMessages((current) => current.map((message) => message.id === updated.id ? { ...message, seen_at: updated.seen_at } : message))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (event) => {
        const profile = event.new as Profile
        if (profile.id !== myId && profile.id !== friendId) return
        void addAvatarSignedUrl(profile).then((hydrated) => profileCallbackRef.current?.(hydrated))
      })
      .on('broadcast', { event: 'message-created' }, ({ payload }) => {
        const message = (payload as { message?: Message }).message
        if (!message || !belongsToConversation(message)) return
        void addSignedUrl(message).then(addMessage)
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const data = payload as { userId?: string; isTyping?: boolean }
        if (data.userId !== friendId) return
        if (remoteTypingTimer.current) window.clearTimeout(remoteTypingTimer.current)
        setFriendTyping(Boolean(data.isTyping))
        if (data.isTyping) {
          remoteTypingTimer.current = window.setTimeout(() => setFriendTyping(false), 2200)
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const isOnline = Boolean(state[friendId]?.length)
        setFriendOnline((wasOnline) => {
          if (wasOnline && !isOnline) {
            window.setTimeout(() => {
              void supabase.from('profiles').select('last_seen').eq('id', friendId).single()
                .then(({ data }) => setFriendLastSeen((data as { last_seen: string | null } | null)?.last_seen ?? null))
            }, 500)
          }
          return isOnline
        })
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('connected')
          void channel.track({ user_id: myId, online_at: new Date().toISOString() })
          void refreshMessages().catch(() => undefined)
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnection('reconnecting')
      })
    channelRef.current = channel

    return () => {
      mounted = false
      if (typingStopTimer.current) window.clearTimeout(typingStopTimer.current)
      if (remoteTypingTimer.current) window.clearTimeout(remoteTypingTimer.current)
      void channel.send({ type: 'broadcast', event: 'typing', payload: { userId: myId, isTyping: false } })
      void supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [addMessage, belongsToConversation, friendId, myId, refreshMessages])

  useEffect(() => {
    if (!messages.some((message) => message.sender_id === friendId && !message.seen_at) || document.visibilityState !== 'visible') return
    void markMessagesSeen(myId, friendId).catch(() => undefined)
  }, [friendId, messages, myId])

  useEffect(() => {
    const markVisibleMessages = () => {
      if (document.visibilityState === 'visible') {
        void markMessagesSeen(myId, friendId).catch(() => undefined)
        void refreshMessages().catch(() => undefined)
      }
    }
    document.addEventListener('visibilitychange', markVisibleMessages)
    return () => document.removeEventListener('visibilitychange', markVisibleMessages)
  }, [friendId, myId, refreshMessages])

  useEffect(() => {
    const reconcile = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshMessages().catch(() => undefined)
    }, 15_000)
    return () => window.clearInterval(reconcile)
  }, [refreshMessages])

  const sendTyping = useCallback(() => {
    const channel = channelRef.current
    if (!channel) return
    void channel.send({ type: 'broadcast', event: 'typing', payload: { userId: myId, isTyping: true } })
    if (typingStopTimer.current) window.clearTimeout(typingStopTimer.current)
    typingStopTimer.current = window.setTimeout(() => {
      void channel.send({ type: 'broadcast', event: 'typing', payload: { userId: myId, isTyping: false } })
    }, 1200)
  }, [myId])

  const sendMessage = useCallback(async (content: string, attachment: Attachment | null) => {
    const cleanContent = content.trim()
    if (!cleanContent && !attachment) return false
    setSending(true)
    setError(null)
    try {
      let message: Message
      if (attachment) {
        uploadController.current = new AbortController()
        setUploadProgress(0)
        message = await sendFileMessage(myId, friendId, attachment, cleanContent, setUploadProgress, uploadController.current.signal)
      } else {
        message = await sendTextMessage(myId, friendId, cleanContent)
      }
      addMessage(message)
      broadcastMessage(message)
      return true
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') {
        setError('Upload cancelled.')
      } else {
        setError(reason instanceof Error ? reason.message : 'Message could not be sent. Please try again.')
      }
      return false
    } finally {
      uploadController.current = null
      setUploadProgress(null)
      setSending(false)
    }
  }, [addMessage, broadcastMessage, friendId, myId])

  const cancelUpload = useCallback(() => uploadController.current?.abort(), [])

  return {
    messages,
    loading,
    error,
    clearError: () => setError(null),
    sending,
    uploadProgress,
    friendTyping,
    friendOnline,
    friendLastSeen,
    connection,
    sendTyping,
    sendMessage,
    cancelUpload,
    refreshMessages,
  }
}

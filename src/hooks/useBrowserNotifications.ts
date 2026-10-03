import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message } from '../types'

type NotificationPermissionState = NotificationPermission | 'unsupported' | 'ios-install-required'

function currentPermission(): NotificationPermissionState {
  if (typeof window === 'undefined') return 'unsupported'
  if (requiresIosHomeScreenInstall()) return 'ios-install-required'
  return 'Notification' in window ? window.Notification.permission : 'unsupported'
}

function requiresIosHomeScreenInstall() {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return isIos && !standalone
}

function notificationBody(message: Message) {
  if (message.message_type === 'text') return message.content || 'Sent you a message'
  if (message.message_type === 'image') return message.content || 'Sent you a photo'
  if (message.message_type === 'video') return message.content || 'Sent you a video'
  if (message.message_type === 'audio') return message.content || 'Sent you a voice message'
  return message.content || `Sent you a file${message.file_name ? `: ${message.file_name}` : ''}`
}

export function useBrowserNotifications(messages: Message[], myId: string, friendName: string, conversationReady: boolean) {
  const [permission, setPermission] = useState<NotificationPermissionState>(currentPermission)
  const knownMessageIds = useRef(new Set<string>())
  const initialized = useRef(false)

  useEffect(() => {
    if (!conversationReady) return
    if (!initialized.current) {
      messages.forEach((message) => knownMessageIds.current.add(message.id))
      initialized.current = true
      return
    }
    for (const message of messages) {
      if (knownMessageIds.current.has(message.id)) continue
      knownMessageIds.current.add(message.id)
      if (message.sender_id !== myId || document.visibilityState === 'visible' || permission !== 'granted') continue
      const notification = new window.Notification(friendName, {
        body: notificationBody(message),
        tag: `private-message-${message.id}`,
        silent: false,
      })
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    }
  }, [conversationReady, friendName, messages, myId, permission])

  const requestPermission = useCallback(async () => {
    if (requiresIosHomeScreenInstall()) {
      setPermission('ios-install-required')
      return 'ios-install-required' as const
    }
    if (!('Notification' in window)) {
      setPermission('unsupported')
      return 'unsupported' as const
    }
    const result = await window.Notification.requestPermission()
    setPermission(result)
    return result
  }, [])

  const notifyIncomingCall = useCallback(() => {
    if (document.visibilityState === 'visible' || permission !== 'granted') return
    const notification = new window.Notification(friendName, {
      body: 'Incoming voice call',
      tag: 'private-incoming-call',
      silent: false,
      requireInteraction: true,
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
    window.setTimeout(() => notification.close(), 60_000)
  }, [friendName, permission])

  return { permission, requestPermission, notifyIncomingCall, iosInstallRequired: permission === 'ios-install-required' }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message } from '../types'

type NotificationPermissionState = NotificationPermission | 'unsupported' | 'ios-install-required'

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function requiresIosHomeScreenInstall() {
  if (typeof window === 'undefined') return false
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return isIosDevice() && !standalone
}

function currentPermission(): NotificationPermissionState {
  if (typeof window === 'undefined') return 'unsupported'
  if (requiresIosHomeScreenInstall()) return 'ios-install-required'
  return 'Notification' in window ? window.Notification.permission : 'unsupported'
}

function notificationBody(message: Message) {
  if (message.message_type === 'text') return message.content || 'Sent you a message'
  if (message.message_type === 'image') return message.content || 'Sent you a photo'
  if (message.message_type === 'video') return message.content || 'Sent you a video'
  if (message.message_type === 'audio') return message.content || 'Sent you a voice message'
  return message.content || `Sent you a file${message.file_name ? `: ${message.file_name}` : ''}`
}

async function showNotification(title: string, options: NotificationOptions) {
  try {
    // Home Screen web apps on iPhone use their service worker for the most
    // reliable notification display path. Fall back for desktop browsers.
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready
      await registration.showNotification(title, options)
      return
    }
    new window.Notification(title, options)
  } catch {
    // Notifications are an enhancement. Messaging itself must never fail.
  }
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
      void showNotification(friendName, {
        body: notificationBody(message),
        tag: `private-message-${message.id}`,
        silent: false,
      })
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
    try {
      const result = await window.Notification.requestPermission()
      setPermission(result)
      return result
    } catch {
      // Keep the real browser status instead of silently pretending success.
      const result = window.Notification.permission
      setPermission(result)
      return result
    }
  }, [])

  const notifyIncomingCall = useCallback(() => {
    if (document.visibilityState === 'visible' || permission !== 'granted') return
    void showNotification(friendName, {
      body: 'Incoming voice call',
      tag: 'private-incoming-call',
      silent: false,
      requireInteraction: true,
    })
  }, [friendName, permission])

  return { permission, requestPermission, notifyIncomingCall, iosInstallRequired: permission === 'ios-install-required' }
}

import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Avatar } from '../components/Avatar'
import { AccountDialog } from '../components/AccountDialog'
import { CallOverlay } from '../components/CallOverlay'
import { Icon } from '../components/Icon'
import { MessageComposer } from '../components/MessageComposer'
import { MessageList } from '../components/MessageList'
import { useBrowserNotifications } from '../hooks/useBrowserNotifications'
import { useChat } from '../hooks/useChat'
import { useVoiceCall } from '../hooks/useVoiceCall'
import { formatLastSeen } from '../lib/format'
import { getCalls, getProfiles, updateLastSeen } from '../services/chat'
import type { CallRecord, Profile } from '../types'

interface Props {
  user: User
  onLogout: () => Promise<void>
}

export function ChatPage({ user, onLogout }: Props) {
  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const updateProfile = useCallback((updated: Profile) => {
    setProfiles((current) => current?.map((profile) => profile.id === updated.id ? { ...profile, ...updated } : profile) ?? current)
  }, [])

  useEffect(() => {
    let active = true
    void getProfiles()
      .then((items) => { if (active) setProfiles(items) })
      .catch(() => { if (active) setLoadError('This account is not allowed to access the private conversation.') })
    return () => { active = false }
  }, [])

  if (loadError) return <AccessMessage text={loadError} onLogout={onLogout} />
  if (!profiles) return <main className="center-screen"><span className="spinner" /> Loading your private conversation…</main>
  const me = profiles.find((profile) => profile.id === user.id)
  const friend = profiles.find((profile) => profile.id !== user.id)
  if (!me || !friend || profiles.length !== 2) return <AccessMessage text="This private messenger must have exactly two approved profiles. Ask the owner to complete the Supabase setup." onLogout={onLogout} />
  return <Conversation user={user} me={me} friend={friend} onProfileUpdated={updateProfile} onLogout={onLogout} />
}

function Conversation({ user, me, friend, onProfileUpdated, onLogout }: { user: User; me: Profile; friend: Profile; onProfileUpdated: (profile: Profile) => void; onLogout: () => Promise<void> }) {
  const chat = useChat(user.id, friend.id, onProfileUpdated)
  const notifications = useBrowserNotifications(chat.messages, user.id, friend.display_name, !chat.loading)
  const call = useVoiceCall(user.id, friend.id, notifications.notifyIncomingCall)
  const [calls, setCalls] = useState<CallRecord[]>([])
  const [accountOpen, setAccountOpen] = useState(false)

  const loadCalls = useCallback(async () => {
    try { setCalls(await getCalls(user.id, friend.id)) } catch { /* Call history is non-critical to messaging. */ }
  }, [friend.id, user.id])

  useEffect(() => { void loadCalls() }, [loadCalls])
  useEffect(() => {
    if (call.state === 'ended') window.setTimeout(() => void loadCalls(), 300)
  }, [call.state, loadCalls])
  useEffect(() => {
    const noteLastSeen = () => { if (document.visibilityState === 'hidden') void updateLastSeen() }
    window.addEventListener('pagehide', noteLastSeen)
    document.addEventListener('visibilitychange', noteLastSeen)
    return () => {
      window.removeEventListener('pagehide', noteLastSeen)
      document.removeEventListener('visibilitychange', noteLastSeen)
    }
  }, [])

  const friendStatus = chat.friendOnline ? 'Online' : formatLastSeen(chat.friendLastSeen ?? friend.last_seen)

  return (
    <main className="chat-layout">
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="sidebar-brand-icon"><Icon name="lock" size={17} /></span><span>Alyas Software</span></div>
        <div className="contact-card contact-card--active">
          <div className="avatar-wrap"><Avatar name={friend.display_name} url={friend.avatar_url} /><i className={chat.friendOnline ? 'status-dot status-dot--online' : 'status-dot'} /></div>
          <span><strong>{friend.display_name}</strong><small>{chat.friendOnline ? 'Online' : 'Offline'}</small></span>
        </div>
        <button className="logout-button" onClick={() => void onLogout()}>Sign out</button>
      </aside>
      <section className="chat-panel">
        <header className="chat-header">
          <div className="header-person"><div className="avatar-wrap"><Avatar name={friend.display_name} url={friend.avatar_url} size="small" /><i className={chat.friendOnline ? 'status-dot status-dot--online' : 'status-dot'} /></div><span><strong>{friend.display_name}</strong><small>{friendStatus}</small></span></div>
          <div className="header-actions">
            <span className={`connection-status ${chat.connection === 'connected' ? '' : 'connection-status--reconnecting'}`}>{chat.connection === 'connected' ? 'Live' : 'Reconnecting'}</span>
            <button className={`header-icon-button ${notifications.permission === 'granted' ? 'header-icon-button--active' : ''}`} onClick={() => void notifications.requestPermission()} disabled={notifications.permission === 'unsupported'} aria-label="Enable call and message notifications" title={notifications.permission === 'granted' ? 'Call and message notifications are on' : notifications.permission === 'denied' ? 'Notifications are blocked in browser settings' : 'Enable call and message notifications'}>
              <Icon name={notifications.permission === 'granted' ? 'bell' : 'bellOff'} size={19} />
            </button>
            <button className="account-avatar-button" onClick={() => setAccountOpen(true)} aria-label="Open account settings" title="Your account settings"><Avatar name={me.display_name} url={me.avatar_url} size="small" /></button>
            <button className="voice-button" onClick={() => void call.startCall()} disabled={!call.signalReady || call.state !== 'idle'} aria-label="Start voice call" title="Start voice call"><Icon name="phone" size={19} /></button>
          </div>
        </header>
        {chat.error && <div className="chat-error" role="alert">{chat.error}<button onClick={chat.clearError} aria-label="Dismiss message">×</button></div>}
        <MessageList messages={chat.messages} calls={calls} myId={user.id} friendName={friend.display_name} loading={chat.loading} friendTyping={chat.friendTyping} />
        <MessageComposer sending={chat.sending} uploadProgress={chat.uploadProgress} onSend={chat.sendMessage} onCancelUpload={chat.cancelUpload} onTyping={chat.sendTyping} />
      </section>
      <audio ref={call.remoteAudioRef} autoPlay />
      <CallOverlay state={call.state} friendName={friend.display_name} friendAvatar={friend.avatar_url} error={call.error} muted={call.isMuted} startedAt={call.callStartedAt} onAccept={() => void call.acceptCall()} onReject={call.rejectCall} onEnd={call.endCall} onDismiss={call.dismiss} onMute={call.toggleMute} />
      {accountOpen && <AccountDialog email={user.email} profile={me} onAvatarUpdated={(avatarUrl) => onProfileUpdated({ ...me, avatar_url: avatarUrl })} onClose={() => setAccountOpen(false)} />}
    </main>
  )
}

function AccessMessage({ text, onLogout }: { text: string; onLogout: () => Promise<void> }) {
  return <main className="center-screen"><section className="access-card"><div className="brand-mark"><Icon name="lock" size={21} /></div><h1>Private access only</h1><p>{text}</p><button className="primary-button" onClick={() => void onLogout()}>Sign out</button></section></main>
}

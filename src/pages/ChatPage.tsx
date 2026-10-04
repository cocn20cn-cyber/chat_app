import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Avatar } from "../components/Avatar";
import { AccountDialog } from "../components/AccountDialog";
import { CallOverlay } from "../components/CallOverlay";
import { Icon } from "../components/Icon";
import { MessageComposer } from "../components/MessageComposer";
import { MessageList } from "../components/MessageList";
import { useBrowserNotifications } from "../hooks/useBrowserNotifications";
import { useChat } from "../hooks/useChat";
import { useVoiceCall } from "../hooks/useVoiceCall";
import { formatLastSeen } from "../lib/format";
import { getCalls, getProfiles, updateLastSeen } from "../services/chat";
import type { CallRecord, Profile } from "../types";

interface Props {
  user: User;
  onLogout: () => Promise<void>;
}

export function ChatPage({ user, onLogout }: Props) {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const updateProfile = useCallback((updated: Profile) => {
    setProfiles(
      (current) =>
        current?.map((profile) =>
          profile.id === updated.id ? { ...profile, ...updated } : profile,
        ) ?? current,
    );
  }, []);

  useEffect(() => {
    let active = true;
    void getProfiles()
      .then((items) => {
        if (active) setProfiles(items);
      })
      .catch(() => {
        if (active)
          setLoadError(
            "This account is not allowed to access the private conversation.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  if (loadError) return <AccessMessage text={loadError} onLogout={onLogout} />;
  if (!profiles)
    return (
      <main className="center-screen">
        <span className="spinner" /> Loading your private conversation…
      </main>
    );
  const me = profiles.find((profile) => profile.id === user.id);
  const friend = profiles.find((profile) => profile.id !== user.id);
  if (!me || !friend || profiles.length !== 2)
    return (
      <AccessMessage
        text="This private messenger must have exactly two approved profiles. Ask the owner to complete the Supabase setup."
        onLogout={onLogout}
      />
    );
  return (
    <Conversation
      user={user}
      me={me}
      friend={friend}
      onProfileUpdated={updateProfile}
      onLogout={onLogout}
    />
  );
}

function Conversation({
  user,
  me,
  friend,
  onProfileUpdated,
  onLogout,
}: {
  user: User;
  me: Profile;
  friend: Profile;
  onProfileUpdated: (profile: Profile) => void;
  onLogout: () => Promise<void>;
}) {
  const chat = useChat(user.id, friend.id, onProfileUpdated);
  const notifications = useBrowserNotifications(
    chat.messages,
    user.id,
    friend.display_name,
    !chat.loading,
  );
  const call = useVoiceCall(
    user.id,
    friend.id,
    notifications.notifyIncomingCall,
  );
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationHelp, setNotificationHelp] = useState<
    "install" | "blocked" | "unsupported" | null
  >(null);

  const loadCalls = useCallback(async () => {
    try {
      setCalls(await getCalls(user.id, friend.id));
    } catch {
      /* Call history is non-critical to messaging. */
    }
  }, [friend.id, user.id]);

  useEffect(() => {
    void loadCalls();
  }, [loadCalls]);
  useEffect(() => {
    if (call.state === "ended") window.setTimeout(() => void loadCalls(), 300);
  }, [call.state, loadCalls]);
  useEffect(() => {
    const noteLastSeen = () => {
      if (document.visibilityState === "hidden") void updateLastSeen();
    };
    window.addEventListener("pagehide", noteLastSeen);
    document.addEventListener("visibilitychange", noteLastSeen);
    return () => {
      window.removeEventListener("pagehide", noteLastSeen);
      document.removeEventListener("visibilitychange", noteLastSeen);
    };
  }, []);

  const friendStatus = chat.friendOnline
    ? "Online"
    : formatLastSeen(chat.friendLastSeen ?? friend.last_seen);

  return (
    <main className="chat-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon">
            <img src="https://ik.imagekit.io/ehggwul6k/logo.png" alt="Logo" />
          </span>
          <span>Alyas Software</span>
        </div>
        <div className="contact-card contact-card--active">
          <div className="avatar-wrap">
            <Avatar name={friend.display_name} url={friend.avatar_url} />
            <i
              className={
                chat.friendOnline
                  ? "status-dot status-dot--online"
                  : "status-dot"
              }
            />
          </div>
          <span>
            <strong>{friend.display_name}</strong>
            <small>{chat.friendOnline ? "Online" : "Offline"}</small>
          </span>
        </div>
        <button className="logout-button" onClick={() => void onLogout()}>
          Sign out
        </button>
      </aside>
      <section className="chat-panel">
        <header className="chat-header">
          <div className="header-person">
            <div className="avatar-wrap">
              <Avatar
                name={friend.display_name}
                url={friend.avatar_url}
                size="small"
              />
              <i
                className={
                  chat.friendOnline
                    ? "status-dot status-dot--online"
                    : "status-dot"
                }
              />
            </div>
            <span>
              <strong>{friend.display_name}</strong>
              <small>{friendStatus}</small>
            </span>
          </div>
          <div className="header-actions">
            <span
              className={`connection-status ${chat.connection === "connected" ? "" : "connection-status--reconnecting"}`}
            >
              {chat.connection === "connected" ? "Live" : "Reconnecting"}
            </span>
            <button
              className={`header-icon-button ${notifications.permission === "granted" ? "header-icon-button--active" : ""}`}
              onClick={() => {
                if (notifications.iosInstallRequired) {
                  setNotificationHelp("install");
                  return;
                }
                void notifications.requestPermission().then((result) => {
                  if (result === "denied") setNotificationHelp("blocked");
                  if (result === "unsupported") setNotificationHelp("unsupported");
                });
              }}
              disabled={notifications.permission === "unsupported"}
              aria-label="Enable call and message notifications"
              title={
                notifications.permission === "granted"
                  ? "Call and message notifications are on"
                  : notifications.iosInstallRequired
                    ? "Install Alyas Software to your iPhone Home Screen for notifications"
                  : notifications.permission === "denied"
                    ? "Notifications are blocked in browser settings"
                    : "Enable call and message notifications"
              }
            >
              <Icon
                name={
                  notifications.permission === "granted" ? "bell" : "bellOff"
                }
                size={19}
              />
            </button>

            <button
              className="voice-button"
              onClick={() => void call.startCall()}
              disabled={!call.signalReady || call.state !== "idle"}
              aria-label="Start voice call"
              title="Start voice call"
            >
              <Icon name="phone" size={19} />
            </button>

            <button
              className="account-avatar-button"
              onClick={() => setAccountOpen(true)}
              aria-label="Open account settings"
              title="Your account settings"
            >
              <Avatar name={me.display_name} url={me.avatar_url} size="small" />
            </button>
          </div>
        </header>
        {chat.error && (
          <div className="chat-error" role="alert">
            {chat.error}
            <button onClick={chat.clearError} aria-label="Dismiss message">
              ×
            </button>
          </div>
        )}
        <MessageList
          messages={chat.messages}
          calls={calls}
          myId={user.id}
          friendName={friend.display_name}
          loading={chat.loading}
          friendTyping={chat.friendTyping}
        />
        <MessageComposer
          sending={chat.sending}
          uploadProgress={chat.uploadProgress}
          onSend={chat.sendMessage}
          onCancelUpload={chat.cancelUpload}
          onTyping={chat.sendTyping}
        />
      </section>
      <audio ref={call.remoteAudioRef} autoPlay />
      <CallOverlay
        state={call.state}
        friendName={friend.display_name}
        friendAvatar={friend.avatar_url}
        error={call.error}
        muted={call.isMuted}
        startedAt={call.callStartedAt}
        onAccept={() => void call.acceptCall()}
        onReject={call.rejectCall}
        onEnd={call.endCall}
        onDismiss={call.dismiss}
        onMute={call.toggleMute}
      />
      {accountOpen && (
        <AccountDialog
          email={user.email}
          profile={me}
          onAvatarUpdated={(avatarUrl) =>
            onProfileUpdated({ ...me, avatar_url: avatarUrl })
          }
          onClose={() => setAccountOpen(false)}
        />
      )}
      {notificationHelp && (
        <NotificationHelpDialog
          type={notificationHelp}
          onClose={() => setNotificationHelp(null)}
        />
      )}
    </main>
  );
}

function NotificationHelpDialog({
  type,
  onClose,
}: {
  type: "install" | "blocked" | "unsupported";
  onClose: () => void;
}) {
  const install = type === "install";
  const blocked = type === "blocked";
  const title = install
    ? "Add Alyas Software to Home Screen"
    : blocked
      ? "Notifications are blocked"
      : "Notifications are not available";

  return (
    <section
      className="account-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-help-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="notification-help-dialog">
        <button className="dialog-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={18} />
        </button>
        <div className="dialog-heading">
          <div className="dialog-icon">
            <Icon name="bell" size={19} />
          </div>
          <div>
            <p className="eyebrow">NOTIFICATIONS</p>
            <h2 id="notification-help-title">{title}</h2>
          </div>
        </div>
        {install ? (
          <>
            <p>
              iPhone Safari only allows web notifications after this site is
              installed as a Home Screen app.
            </p>
            <ol>
              <li>In Safari, tap <strong>Share</strong>.</li>
              <li>Choose <strong>Add to Home Screen</strong>.</li>
              <li>Open <strong>Alyas Software</strong> from the new icon.</li>
              <li>Tap the bell again, then choose <strong>Allow</strong>.</li>
            </ol>
          </>
        ) : blocked ? (
          <p>
            Notifications were blocked for Alyas Software. Allow them in your
            device or browser notification settings, then reopen the app and
            tap the bell again.
          </p>
        ) : (
          <p>
            This browser cannot request notifications. Open Alyas Software in
            the latest Safari or Chrome version and try again.
          </p>
        )}
        <button className="primary-button" onClick={onClose}>
          Got it
        </button>
      </div>
    </section>
  );
}

function AccessMessage({
  text,
  onLogout,
}: {
  text: string;
  onLogout: () => Promise<void>;
}) {
  return (
    <main className="center-screen">
      <section className="access-card">
        <div className="brand-mark">
          <Icon name="lock" size={21} />
        </div>
        <h1>Private access only</h1>
        <p>{text}</p>
        <button className="primary-button" onClick={() => void onLogout()}>
          Sign out
        </button>
      </section>
    </main>
  );
}

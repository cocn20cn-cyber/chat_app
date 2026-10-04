import { useEffect, useRef, useState } from "react";
import { formatBytes, formatTime } from "../lib/format";
import type { CallRecord, Message } from "../types";
import { Icon } from "./Icon";

interface Props {
  messages: Message[];
  calls: CallRecord[];
  myId: string;
  friendName: string;
  loading: boolean;
  friendTyping: boolean;
}

export function MessageList({
  messages,
  calls,
  myId,
  friendName,
  loading,
  friendTyping,
}: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const stayAtBottom = useRef(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (stayAtBottom.current)
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
  }, [calls.length, messages.length, friendTyping]);

  const onScroll = () => {
    const element = listRef.current;
    if (!element) return;
    stayAtBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 100;
  };

  if (loading)
    return (
      <div className="conversation-loading">
        <span className="spinner" /> Loading conversation…
      </div>
    );

  return (
    <>
      <div
        className="message-list"
        ref={listRef}
        onScroll={onScroll}
        aria-live="polite"
      >
        <div className="message-stack">
          {messages.length === 0 && calls.length === 0 && (
            <div className="empty-conversation">
              Your private conversation starts here. Say hello.
            </div>
          )}
          {timeline(messages, calls).map((entry) => {
            if (entry.kind === "call")
              return (
                <CallEvent
                  key={`call-${entry.call.id}`}
                  call={entry.call}
                  myId={myId}
                />
              );
            const message = entry.message;
            const mine = message.sender_id === myId;
            return (
              <article
                className={`message-row ${mine ? "message-row--mine" : ""}`}
                key={message.id}
              >
                <div
                  className={`message-bubble message-bubble--${message.message_type}`}
                >
                  {message.content && (
                    <p className="message-content">{message.content}</p>
                  )}
                  <Attachment message={message} openImage={setLightboxUrl} />
                  <div className="message-meta">
                    <time dateTime={message.created_at}>
                      {formatTime(message.created_at)}
                    </time>
                    {mine && <DeliveryState message={message} />}
                  </div>
                </div>
              </article>
            );
          })}
          {friendTyping && (
            <div className="typing-indicator">
              <span />
              <span />
              <span /> {friendName} is typing…
            </div>
          )}
        </div>
      </div>
      {lightboxUrl && (
        <button
          className="lightbox"
          aria-label="Close image preview"
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="Expanded message attachment" />
        </button>
      )}
    </>
  );
}

function DeliveryState({ message }: { message: Message }) {
  if (message.seen_at)
    return (
      <span
        className="delivery-state delivery-state--seen"
        title="Seen"
        aria-label="Seen"
      >
        <Icon name="checkDouble" size={14} />
      </span>
    );
  if (message.delivered_at)
    return (
      <span className="delivery-state" title="Delivered" aria-label="Delivered">
        <Icon name="checkDouble" size={14} />
      </span>
    );
  return (
    <span
      className="delivery-state"
      title="Sent — not delivered yet"
      aria-label="Sent — not delivered yet"
    >
      <Icon name="check" size={14} />
    </span>
  );
}

type TimelineEntry =
  | { kind: "message"; createdAt: string; message: Message }
  | { kind: "call"; createdAt: string; call: CallRecord };

function timeline(messages: Message[], calls: CallRecord[]): TimelineEntry[] {
  return [
    ...messages.map((message) => ({
      kind: "message" as const,
      createdAt: message.created_at,
      message,
    })),
    ...calls.map((call) => ({
      kind: "call" as const,
      createdAt: call.started_at,
      call,
    })),
  ].sort((first, second) => first.createdAt.localeCompare(second.createdAt));
}

function CallEvent({ call, myId }: { call: CallRecord; myId: string }) {
  const outgoing = call.caller_id === myId;
  const direction = outgoing ? "Outgoing" : "Incoming";
  let detail = `${direction} voice call`;
  if (call.status === "rejected") detail = `${direction} voice call declined`;
  if (call.status === "failed") detail = `${direction} missed voice call`;
  if (call.duration)
    detail = `${direction} voice call · ${formatDuration(call.duration)}`;
  return (
    <div className="call-event" aria-label={detail}>
      <span
        className={`call-event-icon ${outgoing ? "call-event-icon--outgoing" : ""}`}
      >
        <Icon name="phone" size={14} />
      </span>
      <span>{detail}</span>
      <time dateTime={call.started_at}>{formatTime(call.started_at)}</time>
    </div>
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${Math.max(1, remainder)}s`;
}

function Attachment({
  message,
  openImage,
}: {
  message: Message;
  openImage: (url: string) => void;
}) {
  if (!message.file_path || !message.signed_url) return null;
  if (message.message_type === "image") {
    return (
      <button
        className="image-message"
        onClick={() => openImage(message.signed_url!)}
      >
        <img
          src={message.signed_url}
          alt={message.file_name || "Image attachment"}
          loading="lazy"
          decoding="async"
        />
      </button>
    );
  }
  if (message.message_type === "video") {
    return (
      <video className="video-message" controls preload="metadata">
        <source src={message.signed_url} />
        Your browser cannot play this video.
      </video>
    );
  }
  if (message.message_type === "audio") {
    return (
      <AudioMessage url={message.signed_url} />
    );
  }
  return (
    <a
      className="file-message"
      href={message.signed_url}
      target="_blank"
      rel="noreferrer"
      download={message.file_name || undefined}
    >
      <span className="file-icon">
        <Icon name="file" size={18} />
      </span>
      <span className="file-details">
        <strong>{message.file_name || "Attachment"}</strong>
        <small>{formatBytes(message.file_size)} · Open</small>
      </span>
    </a>
  );
}

function AudioMessage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [url]);

  return (
    <div className="audio-message">
      <Icon name="mic" size={17} />
      <span className="audio-message-player">
        <audio
          controls
          preload="auto"
          src={url}
          onError={() => setFailed(true)}
        >
          Your browser cannot play this voice message.
        </audio>
        {failed && (
          <a href={url} target="_blank" rel="noreferrer">
            Open audio
          </a>
        )}
      </span>
    </div>
  );
}

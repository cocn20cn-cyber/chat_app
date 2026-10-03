import { useEffect, useState } from "react";
import type { CallState } from "../types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

interface Props {
  state: CallState;
  friendName: string;
  friendAvatar?: string | null;
  error: string | null;
  muted: boolean;
  startedAt: string | null;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onDismiss: () => void;
  onMute: () => void;
}

function formatDuration(startedAt: string | null) {
  if (!startedAt) return "00:00";
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
  );
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CallOverlay({
  state,
  friendName,
  friendAvatar,
  error,
  muted,
  startedAt,
  onAccept,
  onReject,
  onEnd,
  onDismiss,
  onMute,
}: Props) {
  const [duration, setDuration] = useState(() => formatDuration(startedAt));
  useEffect(() => {
    setDuration(formatDuration(startedAt));
    if (state !== "connected") return;
    const timer = window.setInterval(
      () => setDuration(formatDuration(startedAt)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [startedAt, state]);

  if (state === "idle") return null;
  const ended = state === "ended" || state === "error";
  const incoming = state === "incoming";
  const outgoing = state === "outgoing";
  const connected = state === "connected";
  const title = incoming
    ? "Incoming voice call"
    : outgoing
      ? "Calling…"
      : state === "connecting"
        ? "Connecting securely…"
        : connected
          ? "Voice call"
          : state === "error"
            ? "Call unavailable"
            : "Call ended";
  const description =
    error ||
    (incoming
      ? `${friendName} is calling you`
      : outgoing
        ? `Waiting for ${friendName} to answer`
        : connected
          ? `Connected · ${duration}`
          : "Your voice stays peer to peer.");

  return (
    <section
      className="call-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="call-title"
    >
      <div className="call-card">
        <div
          className={`call-avatar-wrap ${connected ? "call-avatar-wrap--connected" : ""}`}
        >
          <Avatar name={friendName} url={friendAvatar} size="large" />
          <span className="call-audio-pulse" />
        </div>
        <p className="call-kicker">ALYAS SOFTWARE</p>
        <h2 id="call-title">{title}</h2>
        <p className="call-description">{description}</p>
        {incoming && (
          <div className="call-actions call-actions--incoming">
            <button
              className="round-call-button round-call-button--reject"
              onClick={onReject}
              aria-label="Reject voice call"
            >
              <Icon name="close" size={22} />
              <span>Reject</span>
            </button>
            <button
              className="round-call-button round-call-button--accept"
              onClick={onAccept}
              aria-label="Accept voice call"
            >
              <Icon name="phone" size={21} />
              <span>Accept</span>
            </button>
          </div>
        )}
        {(outgoing || state === "connecting") && (
          <button
            className="round-call-button round-call-button--reject call-end-single"
            onClick={onEnd}
          >
            <Icon name="close" size={22} />
            <span>End call</span>
          </button>
        )}
        {connected && (
          <div className="call-actions">
            <button
              className={`call-control ${muted ? "call-control--active" : ""}`}
              onClick={onMute}
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
            >
              {muted ? (
                <Icon name="micOff" size={20} />
              ) : (
                <Icon name="mic" size={20} />
              )}
              <span>{muted ? "Unmute" : "Mute"}</span>
            </button>
            <button
              className="call-control call-control--end"
              onClick={onEnd}
              aria-label="End voice call"
            >
              <Icon name="phone" size={20} />
              <span>End</span>
            </button>
          </div>
        )}
        {ended && (
          <button className="primary-button" onClick={onDismiss}>
            Close
          </button>
        )}
      </div>
    </section>
  );
}

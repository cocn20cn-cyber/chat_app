import { useEffect, useRef, useState } from "react";
import { formatBytes } from "../lib/format";
import { messageTypeFor } from "../services/chat";
import type { Attachment } from "../types";
import { Icon } from "./Icon";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

function isAppleMobileDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function preferredAudioMimeType() {
  // Safari records and plays AAC/MPEG-4 audio most reliably. Choosing WebM
  // first can create a recording that another browser plays but the sending
  // iPhone leaves in a perpetual loading state.
  const formats = isAppleMobileDevice()
    ? ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return formats.find((type) => MediaRecorder.isTypeSupported(type));
}

interface Props {
  sending: boolean;
  uploadProgress: number | null;
  onSend: (content: string, attachment: Attachment | null) => Promise<boolean>;
  onCancelUpload: () => void;
  onTyping: () => void;
}

export function MessageComposer({
  sending,
  uploadProgress,
  onSend,
  onCancelUpload,
  onTyping,
}: Props) {
  const [content, setContent] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    },
    [attachment],
  );
  useEffect(
    () => () => {
      if (recordingTimerRef.current)
        window.clearInterval(recordingTimerRef.current);
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        recorder.onstop = null;
        recorder.stop();
      }
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  useEffect(() => {
    const input = textAreaRef.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${Math.min(Math.max(input.scrollHeight, 44), 128)}px`;
  }, [content]);

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (recording) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setError("Files need to be smaller than 100 MB.");
      return;
    }
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    const type = messageTypeFor(file);
    setAttachment({
      file,
      type,
      previewUrl: type === "image" ? URL.createObjectURL(file) : undefined,
    });
    setError(null);
  };

  const removeAttachment = () => {
    if (sending) return;
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  };

  const clearRecording = () => {
    if (recordingTimerRef.current)
      window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    recorderRef.current = null;
  };

  const startVoiceRecording = async () => {
    if (sending || recording) return;
    if (attachment) {
      setError(
        "Send or remove the current attachment before recording a voice message.",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Voice recording is not supported by this browser.");
      return;
    }
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        clearRecording();
        setRecording(false);
        setError("Voice recording stopped unexpectedly. Please try again.");
      };
      recorder.onstop = () => {
        const actualType =
          recorder.mimeType || mimeType || (isAppleMobileDevice() ? "audio/mp4" : "audio/webm");
        const recording = new Blob(chunks, { type: actualType });
        clearRecording();
        setRecording(false);
        setRecordingSeconds(0);
        if (recording.size < 500) {
          setError(
            "Your voice message was too short. Please record a little longer.",
          );
          return;
        }
        const extension = actualType.includes("mp4")
          ? "m4a"
          : actualType.includes("ogg")
            ? "ogg"
            : "webm";
        const file = new File(
          [recording],
          `voice-message-${Date.now()}.${extension}`,
          { type: actualType },
        );
        setAttachment({ file, type: "audio" });
      };
      recorder.start(250);
      setRecordingSeconds(0);
      setRecording(true);
      recordingTimerRef.current = window.setInterval(
        () => setRecordingSeconds((seconds) => seconds + 1),
        1000,
      );
    } catch (reason) {
      clearRecording();
      setError(
        reason instanceof DOMException && reason.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow microphone access and try again."
          : "Could not start voice recording. Please try again.",
      );
    }
  };

  const stopVoiceRecording = () => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (sending || (!content.trim() && !attachment)) return;
    const sent = await onSend(content, attachment);
    if (sent) {
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      setAttachment(null);
      setContent("");
    }
  };

  return (
    <form className="composer" onSubmit={submit}>
      {attachment && (
        <div className="attachment-preview">
          {attachment.previewUrl ? (
            <img src={attachment.previewUrl} alt="Selected image preview" />
          ) : (
            <span className="attachment-glyph">
              <Icon
                name={
                  attachment.type === "video"
                    ? "video"
                    : attachment.type === "audio"
                      ? "mic"
                      : "file"
                }
                size={18}
              />
            </span>
          )}
          <span>
            <strong>
              {attachment.type === "audio"
                ? "Voice message"
                : attachment.file.name}
            </strong>
            <small>{formatBytes(attachment.file.size)}</small>
          </span>
          {!sending && (
            <button
              type="button"
              className="icon-button"
              onClick={removeAttachment}
              aria-label="Remove attachment"
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
      )}
      {sending && uploadProgress !== null && (
        <div className="upload-status">
          <span>
            Uploading{uploadProgress > 0 ? ` ${uploadProgress}%` : "…"}
          </span>
          <div>
            <i style={{ width: `${uploadProgress}%` }} />
          </div>
          <button type="button" onClick={onCancelUpload}>
            Cancel
          </button>
        </div>
      )}
      {error && <p className="composer-error">{error}</p>}
      {recording && (
        <div className="recording-status" role="status">
          <i /> Recording voice message{" "}
          <time>{formatRecordingTime(recordingSeconds)}</time>
        </div>
      )}
      <div className="composer-row">
        <input
          ref={fileInputRef}
          type="file"
          className="visually-hidden"
          onChange={chooseFile}
          accept="image/jpeg,image/png,image/webp,image/gif,video/*,audio/*,*/*"
        />
        <button
          type="button"
          className="icon-button attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || recording}
          aria-label="Add attachment"
          title="Add photo, video, or file"
        >
          <Icon name="attach" />
        </button>
        <button
          type="button"
          className={`icon-button voice-note-button ${recording ? "voice-note-button--recording" : ""}`}
          onClick={() =>
            recording ? stopVoiceRecording() : void startVoiceRecording()
          }
          disabled={sending}
          aria-label={
            recording ? "Stop recording voice message" : "Record voice message"
          }
          title={
            recording
              ? "Stop and prepare voice message"
              : "Record voice message"
          }
        >
          <Icon name={recording ? "stop" : "mic"} size={19} />
        </button>
        <textarea
          ref={textAreaRef}
          value={content}
          rows={1}
          placeholder="Write a message"
          onChange={(event) => {
            setContent(event.target.value);
            onTyping();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          disabled={sending || recording}
          aria-label="Message"
        />
        <button
          className="send-button"
          type="submit"
          disabled={sending || recording || (!content.trim() && !attachment)}
          aria-label="Send message"
        >
          {sending ? (
            <span className="spinner" />
          ) : (
            <>
              <span className="send-label">Send</span>
              <Icon name="send" size={17} />
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function formatRecordingTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

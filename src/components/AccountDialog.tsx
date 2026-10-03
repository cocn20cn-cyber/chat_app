import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { uploadProfileAvatar } from "../services/chat";
import type { Profile } from "../types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

interface Props {
  email: string | undefined;
  profile: Profile;
  onAvatarUpdated: (avatarUrl: string | null) => void;
  onClose: () => void;
}

export function AccountDialog({
  email,
  profile,
  onAvatarUpdated,
  onClose,
}: Props) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    if (password.length < 10) {
      setError("Use at least 10 characters for your new password.");
      return;
    }
    if (password !== confirmation) {
      setError("The two new passwords do not match.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(
        "Your password could not be changed. Please try again or sign in again first.",
      );
      return;
    }
    setPassword("");
    setConfirmation("");
    setSuccess(true);
  };

  const chooseAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      const avatarUrl = await uploadProfileAvatar(profile.id, file);
      onAvatarUpdated(avatarUrl);
    } catch (reason) {
      setAvatarError(
        reason instanceof Error
          ? reason.message
          : "Your profile photo could not be updated. Please try again.",
      );
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <section
      className="account-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="account-dialog">
        <div className="dialog-heading">
          <div className="dialog-icon">
            <Icon name="settings" size={19} />
          </div>
          <div>
            <p className="eyebrow">YOUR ACCOUNT</p>
            <h2 id="account-title">Account settings</h2>
          </div>
          <button
            className="dialog-close"
            onClick={onClose}
            aria-label="Close account settings"
          >
            <Icon name="close" size={19} />
          </button>
        </div>
        <p className="account-email">
          Signed in as <strong>{email || "your account"}</strong>
        </p>
        <section className="avatar-settings" aria-labelledby="avatar-title">
          <Avatar
            name={profile.display_name}
            url={profile.avatar_url}
            size="large"
          />
          <div>
            <strong id="avatar-title">Profile photo</strong>
            <small>JPG, PNG, WEBP, or GIF · max 5 MB</small>
            <button
              type="button"
              className="photo-button"
              onClick={() => inputRef.current?.click()}
              disabled={avatarBusy}
            >
              {avatarBusy ? (
                <>
                  <span className="spinner" /> Uploading…
                </>
              ) : (
                <>
                  <Icon name="attach" size={15} /> Choose photo
                </>
              )}
            </button>
          </div>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => void chooseAvatar(event)}
          />
        </section>
        {avatarError && (
          <p className="form-error" role="alert">
            {avatarError}
          </p>
        )}
        <form className="password-form" onSubmit={submit}>
          <h3>Change password</h3>
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              minLength={10}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={submitting}
              minLength={10}
              required
            />
          </label>
          <p className="password-help">
            Use 10 or more characters. Your password is securely updated in
            Supabase Auth; it is never stored in the chat database.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="form-success" role="status">
              <Icon name="check" size={16} /> Password changed successfully.
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="primary-button" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="spinner" /> Updating…
                </>
              ) : (
                "Update password"
              )}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

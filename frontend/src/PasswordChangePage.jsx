import { useState } from "react";
import { changePassword } from "./api.js";

export default function PasswordChangePage({ user, onChanged, onError }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const { user: updatedUser } = await changePassword({
        currentPassword: user.mustChangePassword ? undefined : currentPassword,
        newPassword,
      });
      onChanged(updatedUser);
    } catch (requestError) {
      if (requestError.status === 401) {
        onError(requestError);
      } else {
        setError(requestError.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="password-change-title">
        <div className="auth-brand">
          <span className="brand-logo">RC</span>
          <span>RewaCivic<span>AI</span></span>
        </div>
        <p className="auth-eyebrow">ACCOUNT SECURITY</p>
        <h1 id="password-change-title">Set your personal password</h1>
        <p className="auth-description">
          {user.mustChangePassword
            ? "Your administrator created a one-time password for this account. Change it before continuing."
            : "Update your account password to keep your civic workspace secure."}
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          {!user.mustChangePassword && (
            <>
              <label htmlFor="current-password">Current password</label>
              <input
                autoComplete="current-password"
                id="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                type="password"
                value={currentPassword}
              />
            </>
          )}
          <label htmlFor="new-password">New password</label>
          <input
            autoComplete="new-password"
            id="new-password"
            maxLength={72}
            minLength={10}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            type="password"
            value={newPassword}
          />
          <p className="auth-hint">Use at least 10 characters.</p>
          <label htmlFor="confirm-new-password">Confirm new password</label>
          <input
            autoComplete="new-password"
            id="confirm-new-password"
            maxLength={72}
            minLength={10}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type="password"
            value={confirmPassword}
          />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" disabled={busy} type="submit">
            {busy ? "Updating password…" : "Set password and continue"}
          </button>
        </form>
      </section>
    </main>
  );
}

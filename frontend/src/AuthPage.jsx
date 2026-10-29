import { useEffect, useState } from "react";
import {
  getAdminSetupStatus,
  login,
  registerCitizen,
  setupAdmin,
} from "./api.js";

const initialForm = {
  displayName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  setupKey: "",
};

export default function AuthPage({
  initialMode = "login",
  onAuthenticated,
  onBack,
  sessionError = "",
}) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [setupAvailable, setSetupAvailable] = useState(false);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupError, setSetupError] = useState("");

  useEffect(() => {
    let active = true;
    getAdminSetupStatus()
      .then(({ available }) => {
        if (active) setSetupAvailable(available);
      })
      .catch((error) => {
        if (active) {
          setSetupAvailable(false);
          setSetupError(error.message);
        }
      })
      .finally(() => {
        if (active) setSetupLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function changeMode(nextMode) {
    setMode(nextMode);
    setError("");
    setForm(initialForm);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (mode !== "login" && form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      let response;
      if (mode === "register") {
        response = await registerCitizen({
          displayName: form.displayName,
          email: form.email,
          phone: form.phone,
          password: form.password,
        });
      } else if (mode === "admin-setup") {
        response = await setupAdmin({
          displayName: form.displayName,
          email: form.email,
          password: form.password,
          setupKey: form.setupKey,
        });
      } else {
        response = await login({
          email: form.email,
          password: form.password,
        });
      }

      onAuthenticated(response.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";
  const isAdminSetup = mode === "admin-setup";

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <button className="auth-back" type="button" onClick={onBack}>
          ← Back to RewaCivicAI
        </button>

        <div className="auth-brand">
          <span className="brand-logo">RC</span>
          <span>RewaCivic<span>AI</span></span>
        </div>

        <p className="auth-eyebrow">
          {isAdminSetup ? "SECURE FIRST-TIME SETUP" : "CIVIC ISSUE MANAGEMENT"}
        </p>
        <h1 id="auth-title">
          {isLogin
            ? "Welcome back"
            : isAdminSetup
              ? "Create the first admin"
              : "Join your community"}
        </h1>
        <p className="auth-description">
          {isLogin
            ? "Sign in to report local issues and follow their progress."
            : isAdminSetup
              ? "The first administrator account requires the one-time setup key configured by the project owner."
              : "Create a citizen account to report and track civic issues in Rewa."}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && (
            <>
              <label htmlFor="auth-name">Full name</label>
              <input
                autoComplete="name"
                id="auth-name"
                maxLength={80}
                minLength={2}
                required
                value={form.displayName}
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
              />
            </>
          )}

          <label htmlFor="auth-email">Email address</label>
          <input
            autoComplete="email"
            id="auth-email"
            maxLength={254}
            required
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />

          {!isLogin && !isAdminSetup && (
            <>
              <label htmlFor="auth-phone">Phone number <span>(optional)</span></label>
              <input
                autoComplete="tel"
                id="auth-phone"
                maxLength={32}
                type="tel"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </>
          )}

          {isAdminSetup && (
            <>
              <label htmlFor="auth-setup-key">One-time admin setup key</label>
              <input
                autoComplete="off"
                id="auth-setup-key"
                required
                type="password"
                value={form.setupKey}
                onChange={(event) => setForm({ ...form, setupKey: event.target.value })}
              />
            </>
          )}

          <label htmlFor="auth-password">Password</label>
          <input
            autoComplete={isLogin ? "current-password" : "new-password"}
            id="auth-password"
            maxLength={72}
            minLength={10}
            required
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
          {!isLogin && <p className="auth-hint">Use at least 10 characters.</p>}

          {!isLogin && (
            <>
              <label htmlFor="auth-confirm-password">Confirm password</label>
              <input
                autoComplete="new-password"
                id="auth-confirm-password"
                maxLength={72}
                minLength={10}
                required
                type="password"
                value={form.confirmPassword}
                onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
              />
            </>
          )}

          {(error || sessionError) && (
            <p className="auth-error" role="alert">{error || sessionError}</p>
          )}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy
              ? "Please wait…"
              : isLogin
                ? "Sign in"
                : isAdminSetup
                  ? "Create administrator"
                  : "Create citizen account"}
          </button>
        </form>

        <div className="auth-switches">
          {isLogin ? (
            <>
              <p>
                New to RewaCivicAI?{" "}
                <button type="button" onClick={() => changeMode("register")}>
                  Create a citizen account
                </button>
              </p>
              {setupAvailable && (
                <p>
                  Setting up this project?{" "}
                  <button type="button" onClick={() => changeMode("admin-setup")}>
                    Register the first admin
                  </button>
                </p>
              )}
              {!setupLoading && !setupAvailable && (
                <p className="auth-hint">
                  {setupError || "Admin setup is closed. Ask the project administrator for access."}
                </p>
              )}
            </>
          ) : (
            <p>
              Already registered?{" "}
              <button type="button" onClick={() => changeMode("login")}>
                Sign in
              </button>
            </p>
          )}
        </div>

        <p className="auth-security-note">
          {isAdminSetup
            ? "Admin privileges are never available through public citizen registration."
            : "Your password is securely hashed. Your reports are only visible to you and authorized administrators."}
        </p>
      </section>
    </main>
  );
}

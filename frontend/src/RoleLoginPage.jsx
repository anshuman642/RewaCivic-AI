import { useState } from "react";
import { login } from "./api.js";

const roleDetails = {
  citizen: {
    title: "Citizen sign in",
    description: "Sign in to report local issues and follow your reports.",
    label: "Citizen email",
  },
  admin: {
    title: "Admin sign in",
    description: "Authorized municipal administrators only.",
    label: "Admin email",
  },
  worker: {
    title: "Worker sign in",
    description: "Use the individual work account issued by your administrator.",
    label: "Worker email",
  },
};

export default function RoleLoginPage({ role, onAuthenticated, onBack, onRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const details = roleDetails[role];

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const { user } = await login({ email, password, role });
      onAuthenticated(user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="role-login-title">
        <button className="auth-back" type="button" onClick={onBack}>
          ← Choose a different role
        </button>
        <div className="auth-brand">
          <span className="brand-logo">RC</span>
          <span>RewaCivic<span>AI</span></span>
        </div>
        <p className="auth-eyebrow">{role.toUpperCase()} ACCESS</p>
        <h1 id="role-login-title">{details.title}</h1>
        <p className="auth-description">{details.description}</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="login-email">{details.label}</label>
          <input
            autoComplete="username"
            autoFocus
            id="login-email"
            maxLength={254}
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <label htmlFor="login-password">Password</label>
          <input
            autoComplete="current-password"
            id="login-password"
            maxLength={72}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" disabled={busy} type="submit">
            {busy ? "Signing in…" : `Sign in as ${role}`}
          </button>
        </form>

        {role === "citizen" && (
          <div className="auth-switches">
            <p>
              New to RewaCivicAI?{" "}
              <button type="button" onClick={onRegister}>Create a citizen account</button>
            </p>
          </div>
        )}

        <p className="auth-security-note">
          Each role has a separate entry point. The server verifies your account role before granting access.
        </p>
      </section>
    </main>
  );
}

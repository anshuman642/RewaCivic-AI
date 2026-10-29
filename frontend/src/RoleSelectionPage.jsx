import { useEffect, useState } from "react";
import { getAdminSetupStatus } from "./api.js";

const roles = [
  { role: "citizen", label: "Continue as Citizen", icon: "♙", color: "citizen" },
  { role: "admin", label: "Continue as Admin", icon: "▣", color: "admin" },
  { role: "worker", label: "Continue as Worker", icon: "⚒", color: "worker" },
];

export default function RoleSelectionPage({
  onSelectRole,
  onRegisterCitizen,
  onSetupAdmin,
  onLanding,
}) {
  const [adminSetupAvailable, setAdminSetupAvailable] = useState(false);
  const [setupError, setSetupError] = useState("");

  useEffect(() => {
    let active = true;
    getAdminSetupStatus()
      .then(({ available }) => {
        if (active) setAdminSetupAvailable(available);
      })
      .catch(() => {
        if (active) {
          setAdminSetupAvailable(false);
          setSetupError("First-admin setup status could not be checked. Verify the API connection.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="role-page">
      <section className="role-card" aria-labelledby="role-title">
        <div className="role-card-topline">
          <p>ACCESS PORTAL</p>
          <span>Rewa operations</span>
        </div>
        <h1 id="role-title">Login</h1>
        <p className="role-description">Please choose a role to continue the civic issue workflow.</p>

        <div className="role-options">
          {roles.map((item) => (
            <button
              className={`role-option ${item.color}`}
              key={item.role}
              onClick={() => onSelectRole(item.role)}
              type="button"
            >
              <span className="role-option-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              <span className="role-option-arrow" aria-hidden="true">›</span>
            </button>
          ))}
        </div>

        <div className="role-registration-links">
          <p>
            New citizen?{" "}
            <button type="button" onClick={onRegisterCitizen}>Create a citizen account</button>
          </p>
          {adminSetupAvailable && (
            <p>
              First-time project setup?{" "}
              <button type="button" onClick={onSetupAdmin}>Register the first admin</button>
            </p>
          )}
          {setupError && <p className="role-setup-error" role="status">{setupError}</p>}
        </div>

        <p className="role-security-note">
          Worker access is issued individually by an administrator. Roles cannot be self-selected after sign-in.
        </p>
        <button className="role-home-link" onClick={onLanding} type="button">
          Explore the RewaCivicAI project
        </button>
      </section>
    </main>
  );
}

import { useRef, useState } from "react";
import {
  getReportImageUrl,
  reviewResolutionEvidence,
  submitResolutionEvidence,
} from "./api.js";

function formatEvidenceDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime())
    ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "Date unavailable";
}

export default function ResolutionProof({
  issue,
  isAdmin,
  isWorker,
  onReportUpdate,
  onSessionExpired,
}) {
  const [afterPhoto, setAfterPhoto] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const formRef = useRef(null);
  const evidence = issue.resolutionEvidence || [];
  const pendingEvidence = evidence.some((item) => item.reviewStatus === "pending");
  const canSubmit = isWorker && issue.status === "In Progress" && !pendingEvidence;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!afterPhoto) {
      setError("Choose a photo showing the completed repair.");
      return;
    }

    setBusyAction("submit");
    setError("");
    try {
      const { report } = await submitResolutionEvidence(issue.id, {
        afterPhoto,
      });
      onReportUpdate(report);
      setAfterPhoto(null);
      formRef.current?.reset();
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired(requestError);
      else setError(requestError.message);
    } finally {
      setBusyAction("");
    }
  }

  async function handleReview(item, decision) {
    setBusyAction(item._id);
    setError("");
    try {
      const { report } = await reviewResolutionEvidence(
        issue.id,
        item._id,
        decision,
        reviewNote,
      );
      onReportUpdate(report);
      setReviewNote("");
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired(requestError);
      else setError(requestError.message);
    } finally {
      setBusyAction("");
    }
  }

  return (
    <section className="resolution-proof">
      <div className="resolution-proof-heading">
        <div>
          <h3>Proof of resolution</h3>
          <p>Upload a completed-work photo. An administrator reviews it before closure.</p>
        </div>
        {pendingEvidence && <span className="proof-status pending">Awaiting review</span>}
      </div>

      {canSubmit && (
        <form className="proof-upload-form" onSubmit={handleSubmit} ref={formRef}>
          <label>
            Completed work photo <span>JPEG, PNG, or WebP · up to 5 MB</span>
            <input
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setAfterPhoto(event.target.files?.[0] || null)}
              required
              type="file"
            />
          </label>
          <button className="primary-btn" disabled={busyAction === "submit"} type="submit">
            {busyAction === "submit" ? "Submitting evidence…" : "Submit for admin review"}
          </button>
        </form>
      )}

      {isWorker && issue.status === "Pending" && (
        <p className="proof-guidance">Move this assigned report to In Progress before adding repair evidence.</p>
      )}
      {isWorker && pendingEvidence && (
        <p className="proof-guidance">Evidence is awaiting admin review. A new submission is available if changes are requested.</p>
      )}

      {isAdmin && pendingEvidence && (
        <label className="proof-review-note">
          Review note <span>Required when requesting changes</span>
          <textarea
            maxLength={500}
            onChange={(event) => setReviewNote(event.target.value)}
            placeholder="Add guidance for the field worker if evidence needs changes."
            value={reviewNote}
          />
        </label>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      {evidence.length === 0 ? (
        <p className="activity-empty">No repair evidence has been submitted.</p>
      ) : (
        <div className="proof-evidence-list">
          {evidence.map((item) => (
            <article className="proof-evidence-card" key={item._id}>
              <div className="proof-evidence-meta">
                <strong>Submitted by {item.submittedBy?.displayName || "Field worker"}</strong>
                <span>{formatEvidenceDate(item.submittedAt)}</span>
                <span className={`proof-status ${item.reviewStatus}`}>
                  {item.reviewStatus === "pending" ? "Pending review" : item.reviewStatus}
                </span>
              </div>
              <div className="proof-photo-grid">
                {item.beforeImageUrl && (
                  <figure>
                    <img
                      alt={`Before work: ${issue.title}`}
                      loading="lazy"
                      src={getReportImageUrl(item.beforeImageUrl)}
                    />
                    <figcaption>Before work</figcaption>
                  </figure>
                )}
                <figure>
                  <img
                    alt={`Completed work: ${issue.title}`}
                    loading="lazy"
                    src={getReportImageUrl(item.afterImageUrl)}
                  />
                  <figcaption>Completed work</figcaption>
                </figure>
              </div>
              {item.reviewedAt && (
                <p className="proof-review-result">
                  Reviewed by {item.reviewedBy?.displayName || "Administrator"} · {formatEvidenceDate(item.reviewedAt)}
                  {item.reviewNote && <span>Note: {item.reviewNote}</span>}
                </p>
              )}
              {isAdmin && item.reviewStatus === "pending" && (
                <div className="proof-review-actions">
                  <button
                    disabled={Boolean(busyAction) || !reviewNote.trim()}
                    onClick={() => handleReview(item, "reject")}
                    type="button"
                  >
                    {busyAction === item._id ? "Saving…" : "Request changes"}
                  </button>
                  <button
                    className="approve"
                    disabled={Boolean(busyAction)}
                    onClick={() => handleReview(item, "approve")}
                    type="button"
                  >
                    {busyAction === item._id ? "Saving…" : "Approve & resolve"}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

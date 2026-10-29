import { useEffect, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { createReport } from "./api.js";

const REWA_CENTER = [24.5362, 81.3037];
const LOCATION_PRESETS = [
  { name: "Civil Lines", coordinates: [24.5362, 81.3037] },
  { name: "University Road", coordinates: [24.5266, 81.3154] },
  { name: "Sirmour Chowk", coordinates: [24.548, 81.303] },
  { name: "Amahiya", coordinates: [24.5367, 81.2927] },
  { name: "Transport Nagar", coordinates: [24.5602, 81.3206] },
  { name: "Madhotal", coordinates: [24.5136, 81.2868] },
  { name: "Tukanganj", coordinates: [24.5426, 81.3137] },
];

const STEPS = ["Issue type", "Photo", "Location", "Details", "Review"];

function MapClickHandler({ onChooseLocation }) {
  useMapEvents({
    click(event) {
      onChooseLocation(event.latlng);
    },
  });
  return null;
}

function MapCenterController({ coordinates }) {
  const map = useMap();
  useEffect(() => {
    map.setView(coordinates || REWA_CENTER, coordinates ? 15 : 14);
  }, [coordinates, map]);
  return null;
}

function ReportLocationMap({ coordinates, onChooseLocation }) {
  return (
    <MapContainer
      className="report-location-map"
      center={coordinates || REWA_CENTER}
      zoom={14}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapCenterController coordinates={coordinates} />
      <MapClickHandler onChooseLocation={onChooseLocation} />
      {coordinates && <CircleMarker center={coordinates} radius={9} pathOptions={{
        color: "#fff",
        weight: 3,
        fillColor: "#078b67",
        fillOpacity: 1,
      }} />}
    </MapContainer>
  );
}

function getDefaultTitle(type) {
  return type === "Garbage" ? "Garbage accumulation" : "Road pothole";
}

export default function ReportIssueWizard({
  onCancel,
  onSuccess,
  onSessionExpired,
}) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState("Garbage");
  const [photo, setPhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [location, setLocation] = useState("");
  const [coordinates, setCoordinates] = useState(null);
  const [title, setTitle] = useState(getDefaultTitle("Garbage"));
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("Medium");
  const [error, setError] = useState("");
  const [photoCheck, setPhotoCheck] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function chooseIssueType(value) {
    setType(value);
    setTitle(getDefaultTitle(value));
  }

  function choosePreset(preset) {
    setLocation(preset.name);
    setCoordinates(preset.coordinates);
  }

  function chooseCoordinates({ lat, lng }) {
    setCoordinates([lat, lng]);
    setLocation((current) => current || "Selected map location, Rewa");
  }

  function selectPhoto(file) {
    setError("");
    setPhotoCheck("");

    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("The image must be 5 MB or smaller.");
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return nextPreviewUrl;
    });
    setPhoto(file);
  }

  function handlePhotoChange(event) {
    selectPhoto(event.target.files?.[0]);
    event.target.value = "";
  }

  function checkPhoto() {
    if (!previewUrl) {
      setPhotoCheck("Add a photo to run the image check.");
      return;
    }

    const image = new Image();
    image.onload = () => {
      if (image.width < 320 || image.height < 240) {
        setPhotoCheck("Photo is readable, but a clearer image at 320 × 240 or larger is recommended.");
      } else {
        setPhotoCheck("Photo looks ready to attach to your report.");
      }
    };
    image.onerror = () => setPhotoCheck("This image could not be opened. Please choose another file.");
    image.src = previewUrl;
  }

  function useCurrentLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError("Location access is not available in this browser. Select a location on the map.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords: currentCoordinates }) => {
        const selected = [currentCoordinates.latitude, currentCoordinates.longitude];
        setCoordinates(selected);
        setLocation("Current device location");
        setLocating(false);
      },
      (locationError) => {
        setLocating(false);
        setError(
          locationError.code === locationError.PERMISSION_DENIED
            ? "Location permission was denied. Select a location on the map or choose an area."
            : "Could not determine your location. Choose an area or tap the map.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  function continueToNextStep() {
    setError("");
    if (step === 2 && !location.trim()) {
      setError("Choose a Rewa area or tap the map to set the issue location.");
      return;
    }
    if (step === 3 && !title.trim()) {
      setError("Enter a short title for the issue.");
      return;
    }
    setStep((currentStep) => Math.min(currentStep + 1, STEPS.length - 1));
  }

  async function submitReport() {
    setBusy(true);
    setError("");
    try {
      const { report } = await createReport({
        title: title.trim(),
        description: description.trim(),
        type,
        location: location.trim(),
        severity,
        photo,
        latitude: coordinates?.[0],
        longitude: coordinates?.[1],
      });
      onSuccess(report);
    } catch (requestError) {
      if (!onSessionExpired(requestError)) setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-view report-wizard">
      <header className="report-wizard-heading">
        <div>
          <p className="wizard-eyebrow">CITIZEN PORTAL · NEW REPORT</p>
          <h2>Report a Civic Issue</h2>
          <p>Share the issue details so the city team can respond.</p>
        </div>
        <button className="secondary-btn" type="button" onClick={onCancel}>
          Back to Dashboard
        </button>
      </header>

      <section className="panel wizard-panel">
        <ol className="wizard-progress" aria-label="Report steps">
          {STEPS.map((label, index) => (
            <li
              className={index === step ? "current" : index < step ? "complete" : ""}
              key={label}
              aria-current={index === step ? "step" : undefined}
            >
              <span>{index < step ? "✓" : index + 1}</span>
              <small>{label}</small>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="wizard-step">
            <h3>Select Issue Type</h3>
            <p className="wizard-help">Choose the category that best describes the problem.</p>
            <div className="issue-type-options">
              {[
                { label: "Garbage", icon: "▤", help: "Waste accumulation or illegal dumping" },
                { label: "Pothole", icon: "●", help: "Road damage and surface breakage" },
              ].map((item) => (
                <button
                  className={`issue-type-option ${type === item.label ? "selected" : ""}`}
                  key={item.label}
                  onClick={() => chooseIssueType(item.label)}
                  type="button"
                  aria-pressed={type === item.label}
                >
                  <span className="issue-type-icon">{item.icon}</span>
                  <strong>{item.label}</strong>
                  <small>{item.help}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-step">
            <h3>Upload Issue Photo</h3>
            <p className="wizard-help">A clear photo helps the municipal team assess the issue.</p>
            <label
              className={`photo-dropzone ${previewUrl ? "has-photo" : ""}`}
              htmlFor="wizard-photo"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                selectPhoto(event.dataTransfer.files?.[0]);
              }}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="Selected civic issue" />
              ) : (
                <>
                  <span className="photo-upload-icon">⇧</span>
                  <strong>Drop or upload an image</strong>
                  <small>JPEG, PNG or WebP · up to 5 MB</small>
                </>
              )}
            </label>
            <input
              className="visually-hidden"
              id="wizard-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoChange}
            />
            <div className="photo-actions">
              <label className="secondary-btn" htmlFor="wizard-photo">Upload image</label>
              {previewUrl && (
                <>
                  <button className="secondary-btn" type="button" onClick={checkPhoto}>
                    Check photo quality
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(previewUrl);
                      setPhoto(null);
                      setPreviewUrl("");
                      setPhotoCheck("");
                    }}
                  >
                    Remove photo
                  </button>
                </>
              )}
            </div>
            <p className="wizard-help photo-disclosure">
              Photo quality is checked in your browser. This prototype does not claim to run AI image recognition.
            </p>
            {photoCheck && <p className="photo-check-message" role="status">{photoCheck}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="wizard-step">
            <h3>Issue Location</h3>
            <p className="wizard-help">
              Choose a Rewa area, use your device location, or tap the map. A map pin is optional.
            </p>
            <div className="location-picker">
              <div className="location-picker-list">
                {LOCATION_PRESETS.map((preset) => (
                  <button
                    className={`location-preset ${location === preset.name ? "selected" : ""}`}
                    key={preset.name}
                    onClick={() => choosePreset(preset)}
                    type="button"
                  >
                    {preset.name}<span aria-hidden="true">→</span>
                  </button>
                ))}
                <button
                  className="secondary-btn location-device-btn"
                  disabled={locating}
                  onClick={useCurrentLocation}
                  type="button"
                >
                  {locating ? "Finding location…" : "Use my current location"}
                </button>
                <label className="wizard-label" htmlFor="wizard-location">Location description</label>
                <input
                  id="wizard-location"
                  className="wizard-input"
                  maxLength={240}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Street, landmark or area"
                  value={location}
                />
              </div>
              <div className="location-map-wrap">
                <ReportLocationMap
                  coordinates={coordinates}
                  onChooseLocation={chooseCoordinates}
                />
                <p>Tap the map to place a pin. Map data © OpenStreetMap contributors.</p>
              </div>
            </div>
            {coordinates && (
              <p className="coordinates-note">
                Coordinates: {coordinates[0].toFixed(5)}, {coordinates[1].toFixed(5)}
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="wizard-step wizard-details">
            <h3>Issue Details</h3>
            <p className="wizard-help">Add enough information for the response team to understand the issue.</p>
            <label className="wizard-label" htmlFor="wizard-title">Issue title</label>
            <input
              className="wizard-input"
              id="wizard-title"
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
            <label className="wizard-label" htmlFor="wizard-description">Description <span>(optional)</span></label>
            <textarea
              className="wizard-input wizard-textarea"
              id="wizard-description"
              maxLength={1000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe what you observed and any details that may help."
              value={description}
            />
            <label className="wizard-label" htmlFor="wizard-severity">Severity</label>
            <select
              className="wizard-input"
              id="wizard-severity"
              onChange={(event) => setSeverity(event.target.value)}
              value={severity}
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>
          </div>
        )}

        {step === 4 && (
          <div className="wizard-step">
            <h3>Review & Submit</h3>
            <p className="wizard-help">Confirm the details before sending this report to Rewa's civic team.</p>
            <div className="report-review">
              {previewUrl && <img src={previewUrl} alt="Issue preview" />}
              <dl>
                <div><dt>Issue</dt><dd>{title}</dd></div>
                <div><dt>Type</dt><dd>{type}</dd></div>
                <div><dt>Location</dt><dd>{location}</dd></div>
                <div><dt>Severity</dt><dd>{severity}</dd></div>
                {description && <div><dt>Description</dt><dd>{description}</dd></div>}
                {coordinates && (
                  <div>
                    <dt>Map coordinates</dt>
                    <dd>{coordinates[0].toFixed(5)}, {coordinates[1].toFixed(5)}</dd>
                  </div>
                )}
              </dl>
            </div>
            <p className="report-privacy-note">
              Your report will be visible to you and authorized municipal staff. Your photo is attached securely.
            </p>
          </div>
        )}

        {error && <p className="form-error wizard-error" role="alert">{error}</p>}

        <div className="wizard-controls">
          <button
            className="secondary-btn"
            disabled={step === 0 || busy}
            onClick={() => {
              setError("");
              setStep((currentStep) => Math.max(currentStep - 1, 0));
            }}
            type="button"
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button className="primary-btn" onClick={continueToNextStep} type="button">
              Continue
            </button>
          ) : (
            <button className="primary-btn" disabled={busy} onClick={submitReport} type="button">
              {busy ? "Submitting report…" : "Submit Report"}
            </button>
          )}
        </div>
      </section>
    </section>
  );
}

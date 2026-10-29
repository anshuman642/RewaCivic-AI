# RewaCivicAI

RewaCivicAI is a hackathon prototype for reporting garbage and pothole issues and tracking municipal response.

## What works

- Landing page and municipal dashboard with report, analytics, and location views.
- MongoDB-backed report listing, creation, and status updates through the Express API.
- Optional JPEG, PNG, and WebP report photos, limited to 5 MB, stored in `backend/uploads`.
- Report search and issue-type filtering.
- Development proxy from Vite to the local API at `http://localhost:5000`.
- Citizen email/password signup, secure sign-in, and personal report history.
- One-time first-admin registration with an environment-only setup key.
- Admin credentials are the email and password chosen during first-admin setup; there is no shared or hardcoded default password.
- Separate citizen, administrator, and field-worker sign-in screens with server-checked roles.
- Admin-managed worker accounts with admin-set passwords, email login, and immediate access to the field dashboard.
- The admin Workers page lists registered accounts and recent successful logins, shows every worker's assigned reports, and lets the administrator assign an open report directly to a worker.
- Admin account directory with registered profile details and paginated account records and successful login history across account roles.
- Admin report assignment, citywide report access, status updates, and a citizen/worker directory.
- Worker access limited to assigned reports and field-work status updates.
- Workers can view photos only on reports assigned to them; citizens can view only their own report photos.
- Per-report activity timelines for submission, worker assignments, and status changes.
- Admin operations watch with live counts for unassigned high-priority reports, open reports older than 48 hours, new reports this week, and busiest reported area.
- CivicTwin beta groups possible duplicates by matching issue type and map pins within 100 meters; it preserves individual reports and does not claim AI photo or text verification.
- Proof of Resolution lets assigned workers submit a completed-work photo for an in-progress report; only an administrator can approve evidence and mark the report resolved. Rejected evidence stays in the activity record and needs a review note. Existing before/after evidence remains visible.
- Civic SLA advisory gives active reports default response deadlines (High 24h, Medium 72h, Low 7 days) and escalates overdue work at 1, 24, and 72 hours; the dashboard queue does not send notifications or replace municipal policy.
- SmartCrew provides an assigned-worker route suggestion on admin and field-worker dashboards. It prioritizes a high-severity first stop, then orders nearby tasks with a nearest-neighbor heuristic; map lines and distances are straight-line estimates, not road directions or traffic-aware routing. Reports without valid coordinates are excluded from the map route.
- CSV export for all reports matching the administrator's current search and issue-type filters.

Citizens can choose a Rewa area, place a pin on an OpenStreetMap view, or share their browser location; submitted coordinates appear on the municipal report map. Photo uploads are validated and attached to reports, but automatic AI image classification is not implemented yet. Photos are stored on the backend machine, so this setup is intended for local demos rather than multi-instance production hosting.

## Run locally

Use two VS Code terminals.

### 1. Start the backend

```powershell
cd backend
npm install
```

Add these values to `backend/.env`. Keep any existing MongoDB connection string; do not overwrite it when adding the auth settings.

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/rewacivicai
JWT_SECRET=<random secret, at least 32 characters>
ADMIN_SETUP_KEY=<different random one-time registration key>
```

Generate two different secrets from the `backend` directory in PowerShell:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep both values private and add them to `.env`; do not commit `.env`. On the access portal, choose **Register the first admin** and enter `ADMIN_SETUP_KEY`. That key is accepted only until the first admin account is created. Citizens can register directly; public signup cannot grant admin permissions. New registrations are signed in immediately.

After signing in, an administrator can use **Workers** to create individual field-worker accounts with a name, email, optional phone number, and password. The Workers page also shows recent account logins and each worker's assigned reports, and lets an administrator assign an open report directly to a worker. Share the email and password securely with the worker; they can sign in using the **Field Worker** portal and immediately access their assigned reports. Passwords must be at least 10 characters (and no more than 72 UTF-8 bytes). Workers can move assigned reports to **In Progress**, then submit a completed-work photo for administrator review. Only an administrator can approve the evidence and resolve the report. Sessions use an HTTP-only, same-site cookie and expire after 8 hours. MongoDB stores bcrypt-hashed passwords. Citizens can only see their own reports; workers can see and update only reports assigned to them; administrators can review all reports, assign workers, change status, and view the citizen/worker directory.

Start the API:

```powershell
npm run dev
```

MongoDB must be running and reachable at the configured URI. Check `http://localhost:5000/api/health`; the database should report `connected` before signup or submitting reports. If the frontend and API are deployed on different origins, set `CORS_ORIGIN` to the frontend origin and use a same-site deployment so the secure session cookie is sent.

If health reports `disconnected` and backend logs say the Atlas IP is not whitelisted, add only your current public IP to MongoDB Atlas **Network Access → IP Access List**, then restart the backend. Do not use `0.0.0.0/0` for a normal setup. Never share or commit your Atlas connection string.

### 2. Start the frontend

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The development server proxies API and photo requests to `http://localhost:5000`. For another API host, set `VITE_API_BASE_URL` to its `/api` URL.

## Deploy to Vercel and Render

The Render Blueprint in `render.yaml` deploys the API from the `backend` directory. In Render, create a Blueprint from the GitHub repository and set `MONGODB_URI` to the Atlas connection string in the service environment. Render generates `JWT_SECRET` and `ADMIN_SETUP_KEY`; keep both values private. In Atlas Network Access, allow the Render service's outbound IPs, or use the provider's documented network option for your plan.

The Vercel project should use `frontend` as its root directory. `frontend/vercel.json` proxies `/api/*` and `/uploads/*` through the Render API so the browser session cookie remains first-party. After creating the Render service, make sure its service name matches `rewacivicai-api` in `frontend/vercel.json`; if Render assigned a different hostname, update both rewrite destinations to that service's HTTPS URL and redeploy Vercel. Once Vercel assigns the production domain, add that exact origin (for example, `https://your-project.vercel.app`, without a trailing slash) as `CORS_ORIGIN` in the Render service environment, then redeploy/restart the API.

Deploy `frontend` to Vercel after configuring the proxy. The frontend and API need to share the same Vercel hostname through those rewrites for authentication cookies to work reliably. The default Render filesystem is ephemeral, so uploaded report photos are not durable across deploys; use persistent object storage before relying on photo uploads in production.

## Checks

```powershell
cd frontend
npm run lint
npm test
npm run build
```

```powershell
cd backend
npm test
```

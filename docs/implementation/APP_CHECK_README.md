# Firebase App Check – PR Summary

## What was changed

| File | Change |
|---|---|
| `frontend/src/lib/firebase.ts` | Initialises App Check with **reCAPTCHA Enterprise** provider on the client |
| `firestore.rules` | Every rule now gates on `request.app != null` (App Check token present) |
| `firebase.json` | Sets `enforcementMode: ENFORCED` for Firestore and Cloud Functions |
| `backend/src/middleware/appCheck.js` | New Express middleware – verifies `X-Firebase-AppCheck` header via Admin SDK |
| `backend/src/index.js` | Wires Admin SDK init + middleware on all `/api/*` routes |
| `.env.example` | Documents the two new env vars |

---

## How this prevents Unauthorized Replay attacks

### What is an Unauthorized Replay attack?

An attacker intercepts a valid HTTP request to your API (e.g. via a proxy or browser DevTools), copies the headers and body, and replays it with tools like `curl` or a bot script. Without App Check the server has no way to tell a legitimate frontend from a scraper.

### How App Check stops it

**Token binding** — An App Check token is cryptographically bound to:
- Your specific Firebase **project ID** (cannot be transplanted to another project)
- The **attested client identity** — reCAPTCHA Enterprise scores the browser session and only issues a token when confidence is high that a human is present

**Short TTL** — Tokens expire in ~1 hour. A replayed token works only within its remaining lifetime; the attacker cannot renew it without passing a fresh reCAPTCHA challenge.

**No token = 403** — The Express middleware rejects any request missing the `X-Firebase-AppCheck` header before it touches a route handler or database, so no Firebase egress cost is incurred.

**Firestore rules double-check** — Even if a request bypasses the backend, the `isAppCheckValid()` function in `firestore.rules` checks `request.app != null` at the database layer, giving a second enforcement boundary.

---

## Screenshot – 403 via curl

Run the backend locally, then:

```bash
curl -i http://localhost:4000/api/markets
```

Expected output:

```
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": "Unauthorized",
  "message": "Missing X-Firebase-AppCheck token. Only verified clients may access this API."
}
```

---

## Setup steps for reviewers

### 1. Create a reCAPTCHA Enterprise key
- Google Cloud Console → **reCAPTCHA Enterprise** → Create key → Web → add your domain
- Copy the **site key** → `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY` in `.env.local`

### 2. Register the app in Firebase App Check
- Firebase Console → **App Check** → your web app → **reCAPTCHA Enterprise** → paste the site key

### 3. Enable Enforcement Mode
- Firebase Console → App Check → each service tile → **Enforce**
  - Firestore ✅
  - Cloud Functions ✅

> **Tip:** Run in *Monitor* mode for 24–48 hours first to confirm all legitimate traffic carries valid tokens before enabling enforcement.

### 4. Local development debug token
- Firebase Console → App Check → your app → **⋮** → Manage debug tokens → Add token
- Copy token → `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN` in `.env.local`
- Do **not** commit this value

### 5. Backend service account
- GCP Console → IAM → Service Accounts → create account with **Firebase App Check Admin** role
- Download JSON → set `GOOGLE_APPLICATION_CREDENTIALS=./service-account.json`
- Add `service-account.json` to `.gitignore`

### 6. Install new backend dependency
```bash
cd backend && npm install firebase-admin
```

/**
 * middleware/appCheck.js
 *
 * Express middleware that enforces Firebase App Check on every API route.
 *
 * How it works
 * ─────────────
 * Every request from an authorised frontend carries an
 * `X-Firebase-AppCheck` header containing a short-lived attestation token
 * minted by reCAPTCHA Enterprise (or DeviceCheck on Apple platforms).
 *
 * This middleware calls the Firebase Admin SDK to verify that token.
 * If the token is missing, expired, or was issued for a different project
 * the middleware short-circuits the request with HTTP 403 – the request
 * never reaches the route handler, so no Firebase or database cost is
 * incurred.
 *
 * Why this prevents "Unauthorized Replay" attacks
 * ─────────────────────────────────────────────────
 * An App Check token is:
 *   • Bound to your Firebase project ID (cannot be reused across projects)
 *   • Short-lived (~1 hour TTL) and non-renewable by the attacker
 *   • Tied to a specific attested client identity (reCAPTCHA score / device)
 *
 * A replay attacker who intercepts a valid token can reuse it only within
 * the token's remaining TTL and only against your own project – after
 * which they must obtain a fresh token, which requires passing a new
 * reCAPTCHA Enterprise challenge (score ≥ threshold).  Bots and
 * headless curl clients cannot obtain a token at all because they cannot
 * satisfy the reCAPTCHA attestation.
 *
 * Usage
 * ──────
 *   const appCheckMiddleware = require('./middleware/appCheck');
 *   app.use('/api', appCheckMiddleware);   // protect all /api/* routes
 */

"use strict";

const { getAppCheck } = require("firebase-admin/app-check");

/**
 * Verifies the Firebase App Check token sent in the request header.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function appCheckMiddleware(req, res, next) {
  const appCheckToken = req.headers["x-firebase-appcheck"];

  // ── 1. Header presence check ──────────────────────────────────────────────
  if (!appCheckToken || typeof appCheckToken !== "string") {
    return res.status(403).json({
      error: "Unauthorized",
      message:
        "Missing X-Firebase-AppCheck token. " +
        "Only verified clients may access this API.",
    });
  }

  // ── 2. Token verification via Firebase Admin SDK ──────────────────────────
  try {
    await getAppCheck().verifyToken(appCheckToken);
    // Token is valid – continue to the route handler
    return next();
  } catch (err) {
    // Token is expired, malformed, or was issued for a different project
    return res.status(403).json({
      error: "Unauthorized",
      message: "Invalid or expired App Check token.",
    });
  }
}

module.exports = appCheckMiddleware;

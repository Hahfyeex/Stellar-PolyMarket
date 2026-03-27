/**
 * middleware/archiveApiKey.js
 *
 * Read-only API key guard for the archive endpoint.
 * Expects header:  X-Archive-Api-Key: <key>
 * Set ARCHIVE_API_KEY in environment variables.
 */

const ARCHIVE_API_KEY = process.env.ARCHIVE_API_KEY || "archive-read-only-key";

function archiveApiKey(req, res, next) {
  const key = req.headers["x-archive-api-key"];
  if (!key || key !== ARCHIVE_API_KEY) {
    return res.status(401).json({ error: "Missing or invalid X-Archive-Api-Key header" });
  }
  next();
}

module.exports = archiveApiKey;

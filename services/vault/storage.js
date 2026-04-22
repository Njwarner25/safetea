/**
 * SafeTea Safety Vault — object-storage adapter (V1: Vercel Blob)
 *
 * Keeps the file endpoints ignorant of the underlying provider so we can
 * swap to S3 / R2 in V2 without touching handlers. The Vault spec flagged
 * at-rest-only encryption for V1 file bytes (provider-managed AES-256);
 * app-layer file encryption is V2.
 *
 * Upload pattern: @vercel/blob's `handleUpload` does client-direct uploads
 * via a short-lived token — bytes do NOT go through our Vercel function,
 * which bypasses the 4.5 MB body limit and cuts one hop of latency.
 *
 * Never exposes a file URL to a caller we haven't auth'd. The `put` URL
 * returned by Vercel Blob is cryptographically unguessable but treat it
 * as a bearer — store encrypted, only return to the owner in the
 * download endpoint.
 */

'use strict';

const blob = require('@vercel/blob');
const blobClient = require('@vercel/blob/client');

/**
 * Fails closed if the Blob token isn't configured.
 * On Vercel, BLOB_READ_WRITE_TOKEN is auto-populated when you've attached
 * a Blob store to the project. Locally, set it manually.
 */
function requireToken() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN not configured. Attach a Vercel Blob store to the project.');
  }
}

/**
 * Remove a blob by URL. Swallows "not found" so re-runs are idempotent.
 */
async function removeBlob(url) {
  if (!url) return;
  requireToken();
  try {
    await blob.del(url);
  } catch (err) {
    // Already gone — don't explode on a cleanup path
    if (err && err.message && /not found/i.test(err.message)) return;
    throw err;
  }
}

/**
 * Produce the server-side handler for client-direct uploads.
 * The handler is handed to @vercel/blob/client's handleUpload, which
 * negotiates the token exchange and fires `onUploadCompleted` once the
 * client's PUT finishes.
 *
 * @param {object} config
 * @param {(pathname: string, clientPayload: any) => Promise<{ allowedContentTypes: string[], maximumSizeInBytes?: number, tokenPayload: string }>} config.onBeforeGenerateToken
 * @param {(uploadedBlob: object, tokenPayload: string) => Promise<void>} config.onUploadCompleted
 */
async function handleClientUpload(req, res, config) {
  requireToken();
  // Vercel plain functions (/api/*.js, not Next.js pages/api) do NOT
  // auto-parse JSON bodies. The caller must pass a parsed body in
  // config.body — typically from api/_utils/auth's parseBody(req).
  // We still fall back to req.body so Next.js-style callers keep working.
  const body = (config && config.body != null) ? config.body : req.body;
  if (body == null) {
    throw new Error('handleClientUpload: request body is empty — pass config.body from parseBody(req)');
  }
  const jsonResponse = await blobClient.handleUpload({
    body,
    request: req,
    onBeforeGenerateToken: async function (pathname, clientPayload) {
      return config.onBeforeGenerateToken(pathname, clientPayload);
    },
    onUploadCompleted: async function (event) {
      await config.onUploadCompleted(event.blob, event.tokenPayload);
    },
  });
  return jsonResponse;
}

module.exports = {
  removeBlob,
  handleClientUpload,
};

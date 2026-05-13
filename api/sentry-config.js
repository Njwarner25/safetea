// Public endpoint that the browser SDK loader calls to discover the
// runtime Sentry config. We do not embed the DSN in source — the
// operator sets SENTRY_DSN as a Vercel env var and this endpoint
// surfaces it to the browser at request time.
//
// Returns:
//   { dsn: string | null, environment: string, release?: string }
//
// If SENTRY_DSN is unset the response has dsn: null, which signals the
// browser loader to skip Sentry entirely (no crash, no noise).

'use strict';

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Short cache — DSN doesn't change often, but we still want a flip
  // of the env var to propagate within a few minutes.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  return res.status(200).json({
    dsn: process.env.SENTRY_DSN || null,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
    release: process.env.VERCEL_GIT_COMMIT_SHA || null,
  });
};

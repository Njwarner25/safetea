'use strict';

/**
 * GET /api/version
 *
 * Returns the current SafeTea web/app version. Mobile apps (Capacitor) and the
 * browser PWA poll this to detect when an update is available, then show an
 * "Update available — tap to refresh" banner.
 *
 * Bump APP_VERSION on every deploy where users should be nudged to refresh.
 * Semver-style: major bumps are mandatory, minor/patch are nudges.
 */

const APP_VERSION = '2026.04.30.1';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  return res.status(200).json({
    version: APP_VERSION,
    build_at: '2026-04-30T06:30:00Z',
    min_supported_version: '2026.04.27.1',
    update_url: 'https://getsafetea.app',
    notes: 'Trust Level system, vault folder caching fix, recent signups admin panel.'
  });
};

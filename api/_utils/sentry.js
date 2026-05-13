// Sentry initializer for serverless functions.
//
// Initializes once per cold start. If SENTRY_DSN is unset (e.g. preview
// deploys or local dev where the operator hasn't provisioned the env var
// yet), every export becomes a no-op — we MUST NOT crash a function just
// because observability isn't wired up.
//
// All Sentry calls are wrapped in try/catch so an SDK bug or transport
// failure can never bubble up into the request handler.

'use strict';

let Sentry = null;
let initialized = false;
let initAttempted = false;

function init() {
  if (initAttempted) return;
  initAttempted = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // No DSN configured — silently disable. Don't even require the SDK
    // so cold starts stay fast on deployments where Sentry is off.
    return;
  }

  try {
    // Lazy-require: only pulled in when DSN is present.
    // eslint-disable-next-line global-require
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
      release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
      // Conservative defaults — observability only, no perf tracing or
      // profiling. Operator can dial these up later.
      tracesSampleRate: 0,
      profilesSampleRate: 0,
      // Vercel functions are short-lived. Flushing on shutdown happens
      // automatically; we don't need integrations that hook the process.
      defaultIntegrations: false,
    });
    initialized = true;
  } catch (_err) {
    // Could not load or init the SDK — stay quiet, never throw.
    Sentry = null;
    initialized = false;
  }
}

// Initialize at module load so the first request after a cold start
// already has Sentry ready (and subsequent requests reuse this state).
init();

function captureException(err, context) {
  try {
    if (!initialized || !Sentry) return;
    if (context && typeof context === 'object') {
      Sentry.withScope(function (scope) {
        try {
          for (const key of Object.keys(context)) {
            const val = context[key];
            // Tags must be primitives — anything else goes on extra.
            if (val === null || val === undefined) continue;
            if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
              scope.setTag(key, String(val));
            } else {
              scope.setExtra(key, val);
            }
          }
        } catch (_) { /* ignore scope errors */ }
        try { Sentry.captureException(err); } catch (_) { /* ignore */ }
      });
    } else {
      Sentry.captureException(err);
    }
  } catch (_) {
    // Sentry must NEVER break the calling code.
  }
}

function captureMessage(msg, level) {
  try {
    if (!initialized || !Sentry) return;
    Sentry.captureMessage(msg, level || 'info');
  } catch (_) { /* ignore */ }
}

function isEnabled() {
  return !!initialized;
}

module.exports = { init, captureException, captureMessage, isEnabled };

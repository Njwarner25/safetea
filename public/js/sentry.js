// Browser-side Sentry loader for SafeTea web pages.
//
// Strategy:
//   1. Fetch /api/sentry-config to get the DSN (operator-provided via
//      Vercel env var). No DSN = no Sentry, full stop.
//   2. Lazily inject Sentry's official CDN bundle as a <script> tag so
//      first paint isn't blocked. The bundle is async and small.
//   3. Once loaded, call Sentry.onLoad() to init with the DSN.
//
// Every step is wrapped in try/catch — a broken observability tool must
// never break the page.
//
// To verify after the operator sets SENTRY_DSN: open the console on a
// page that includes this script and run
//     window.__safeteaSentry()
// It returns { configured, initialized, dsnPresent } so the operator
// can confirm wiring without a real crash.
(function () {
  'use strict';

  var state = {
    configured: false,
    initialized: false,
    dsnPresent: false,
    error: null,
  };

  function safe(fn) { try { fn(); } catch (_) { /* swallow */ } }

  // Allow pages to override the DSN via window.SENTRY_DSN BEFORE this
  // script runs (e.g. a future build-time injection). Otherwise we
  // fetch it from the API.
  function getConfigSource() {
    try {
      if (window.SENTRY_DSN) {
        return Promise.resolve({
          dsn: window.SENTRY_DSN,
          environment: window.SENTRY_ENVIRONMENT || 'production',
          release: window.SENTRY_RELEASE || undefined,
        });
      }
    } catch (_) { /* ignore */ }

    if (typeof fetch !== 'function') {
      return Promise.resolve({ dsn: null });
    }

    return fetch('/api/sentry-config', { credentials: 'same-origin' })
      .then(function (r) { return r && r.ok ? r.json() : { dsn: null }; })
      .catch(function () { return { dsn: null }; });
  }

  function injectSentryCdn(onReady) {
    try {
      // Sentry's official CDN bundle. Pinned major version 8 so a
      // breaking SDK change can't blindside us. The "tracing" build
      // would be needed for performance monitoring; we deliberately use
      // the smaller bundle here since we only want error capture.
      var src = 'https://browser.sentry-cdn.com/8.55.0/bundle.min.js';
      var existing = document.querySelector('script[data-sentry-loader]');
      if (existing) {
        if (window.Sentry) onReady();
        else existing.addEventListener('load', onReady);
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.setAttribute('data-sentry-loader', '1');
      s.onload = function () { safe(onReady); };
      s.onerror = function () {
        state.error = 'cdn_load_failed';
      };
      (document.head || document.documentElement).appendChild(s);
    } catch (err) {
      state.error = 'inject_failed';
    }
  }

  function initSentry(config) {
    try {
      if (!window.Sentry || typeof window.Sentry.init !== 'function') {
        state.error = 'sdk_missing';
        return;
      }
      window.Sentry.init({
        dsn: config.dsn,
        environment: config.environment || 'production',
        release: config.release || undefined,
        // Errors only — no perf tracing, no session replay, no profiling.
        // Operator can flip these on later if needed.
        tracesSampleRate: 0,
        // Don't capture every console.error — too noisy.
        integrations: [],
      });
      state.initialized = true;
    } catch (err) {
      state.error = 'init_failed';
    }
  }

  // Expose a tiny status helper for the operator to verify wiring from
  // the browser console.
  try {
    window.__safeteaSentry = function () {
      return {
        configured: state.configured,
        initialized: state.initialized,
        dsnPresent: state.dsnPresent,
        error: state.error,
        sdkLoaded: !!window.Sentry,
      };
    };
  } catch (_) { /* ignore */ }

  // Kick off — fetch config, then conditionally load + init.
  getConfigSource().then(function (config) {
    try {
      state.configured = true;
      if (!config || !config.dsn) {
        // No DSN = silent no-op. This is the expected state on preview
        // deploys where the operator hasn't set the env var.
        return;
      }
      state.dsnPresent = true;
      injectSentryCdn(function () { initSentry(config); });
    } catch (_) { /* swallow */ }
  }).catch(function () { /* swallow */ });
})();

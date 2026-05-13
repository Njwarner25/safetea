/**
 * share-target-register.js — registers share-target-sw.js for the PWA
 * Share Target API.
 *
 * Loaded by save-to-vault.html. The handler page also imports a
 * `fetchSharedFiles(id)` helper from here that talks to the SW via
 * MessageChannel and returns the stashed { files, title, text, url }
 * payload the SW intercepted from the OS POST.
 */
(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) {
    window.__shareTargetUnavailable = 'service-worker-unsupported';
    return;
  }

  // Register the SW at the root scope so it intercepts /save-to-vault.html.
  window.__shareTargetReady = navigator.serviceWorker
    .register('/share-target-sw.js', { scope: '/' })
    .then(function (reg) {
      // Wait until the SW is active before we try to message it.
      if (reg.active) return reg;
      return new Promise(function (resolve) {
        var sw = reg.installing || reg.waiting;
        if (!sw) {
          resolve(reg);
          return;
        }
        sw.addEventListener('statechange', function () {
          if (sw.state === 'activated') resolve(reg);
        });
        // Safety timeout: never block forever.
        setTimeout(function () { resolve(reg); }, 4000);
      });
    })
    .catch(function (err) {
      console.warn('[share-target] SW registration failed:', err && err.message);
      window.__shareTargetUnavailable = (err && err.message) || 'registration-failed';
      return null;
    });

  /**
   * Ask the active SW for the stashed share payload by id. Resolves
   * with { files: File[], title, text, url } on success, or null if
   * the SW had no record (e.g., the user opened the URL directly).
   */
  window.fetchSharedFiles = function (id) {
    if (!id) return Promise.resolve(null);
    return window.__shareTargetReady.then(function () {
      var ctrl = navigator.serviceWorker.controller;
      if (!ctrl) {
        // No controlling SW on first install; the next refresh will fix it.
        return null;
      }
      return new Promise(function (resolve) {
        var ch = new MessageChannel();
        var done = false;
        var settle = function (value) {
          if (done) return;
          done = true;
          resolve(value);
        };
        ch.port1.onmessage = function (ev) {
          var data = ev && ev.data;
          if (!data || !data.ok || !data.stash) return settle(null);
          settle(data.stash);
        };
        try {
          ctrl.postMessage({ type: 'share:get', id: id }, [ch.port2]);
        } catch (e) {
          settle(null);
        }
        setTimeout(function () { settle(null); }, 5000);
      });
    });
  };
})();

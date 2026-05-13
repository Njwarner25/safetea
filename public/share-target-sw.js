/**
 * share-target-sw.js — minimal service worker for the Web Share Target API.
 *
 * When a user picks the app from the OS share sheet on Android Chrome PWAs
 * (or iOS Safari PWAs that grow Share Target support), the OS POSTs the
 * shared content as multipart/form-data to /save-to-vault.html.
 *
 * Plain page navigation can't read a POST body. The pattern is:
 *   1. SW intercepts the POST to /save-to-vault.html (`event.respondWith`).
 *   2. SW reads the FormData, stashes the file blobs in a Map keyed by a
 *      one-shot id, then 303-redirects to the same URL with ?share_id=<id>.
 *   3. The handler page asks the SW for the stash (BroadcastChannel msg
 *      "share:get" with the id) and the SW posts back the blob list.
 *
 * Scope: only intercepts POSTs whose pathname starts with /save-to-vault.html.
 * Everything else passes through (no fetch handler).
 */

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

// In-memory stash; cleared after the handler page picks it up.
// Keyed by random id; survives only as long as the SW process lives,
// which is plenty since the handler page loads immediately after the
// 303 redirect.
var SHARE_STASH = new Map();

function genId() {
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10)
  );
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'POST') return;
  var url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }
  if (url.pathname !== '/save-to-vault.html' && url.pathname !== '/save-to-vault') {
    return;
  }
  event.respondWith(handleShare(event));
});

async function handleShare(event) {
  try {
    var formData = await event.request.formData();
    var files = formData.getAll('files') || [];
    var title = formData.get('title') || '';
    var text = formData.get('text') || '';
    var sharedUrl = formData.get('url') || '';
    var id = genId();
    SHARE_STASH.set(id, {
      files: files,
      title: typeof title === 'string' ? title : '',
      text: typeof text === 'string' ? text : '',
      url: typeof sharedUrl === 'string' ? sharedUrl : '',
      created_at: Date.now(),
    });
    // 303 redirect so the browser does a GET to the handler page with
    // the share_id in the query string.
    return Response.redirect('/save-to-vault.html?share_id=' + encodeURIComponent(id), 303);
  } catch (err) {
    return new Response(
      'Could not read shared content: ' + (err && err.message ? err.message : 'unknown'),
      { status: 500, headers: { 'content-type': 'text/plain' } }
    );
  }
}

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'share:get') {
    var id = data.id;
    var stash = SHARE_STASH.get(id);
    if (stash) SHARE_STASH.delete(id);
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ ok: !!stash, stash: stash || null });
    }
  } else if (data.type === 'share:peek') {
    var id2 = data.id;
    var stash2 = SHARE_STASH.get(id2);
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ ok: !!stash2, has: !!stash2 });
    }
  }
});

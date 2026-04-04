// SafeTea Record & Protect — Upload Service Worker (Progressive Enhancement)
// Retries pending uploads when user returns to the page.
// Cannot record audio (browser limitation) — recording is handled by the main page.

var DB_NAME = 'safetea_recording';
var DB_VERSION = 1;

function openDB() {
    return new Promise(function(resolve, reject) {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = function() { reject(req.error); };
        req.onsuccess = function() { resolve(req.result); };
        // Don't create stores here — main page handles that
    });
}

function getPendingSegments(db) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction('segments', 'readonly');
        var store = tx.objectStore('segments');
        var idx = store.index('status');
        var req = idx.getAll('pending');
        req.onsuccess = function() { resolve(req.result || []); };
        req.onerror = function() { reject(req.error); };
    });
}

function blobToBase64(blob) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onloadend = function() { resolve(reader.result.split(',')[1]); };
        reader.onerror = function() { reject(reader.error); };
        reader.readAsDataURL(blob);
    });
}

// Listen for messages from the main page
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'FLUSH_UPLOADS') {
        flushPendingUploads(event.data.token);
    }
});

async function flushPendingUploads(token) {
    try {
        var db = await openDB();
        var pending = await getPendingSegments(db);
        if (pending.length === 0) return;

        // Sort FIFO
        pending.sort(function(a, b) { return a.segmentNumber - b.segmentNumber; });

        // Upload up to 5 at a time
        var batch = pending.slice(0, 5);
        for (var i = 0; i < batch.length; i++) {
            var seg = batch[i];
            try {
                var base64 = await blobToBase64(seg.blob);
                var resp = await fetch('/api/recording/chunk', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionKey: seg.sessionKey,
                        chunkNumber: seg.segmentNumber,
                        audioData: base64,
                        durationMs: 30000,
                        latitude: seg.lat || null,
                        longitude: seg.lng || null
                    })
                });
                if (resp.ok) {
                    // Confirm
                    await fetch('/api/recording/confirm', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            sessionKey: seg.sessionKey,
                            chunkNumber: seg.segmentNumber
                        })
                    });
                    // Delete from IndexedDB
                    var delTx = db.transaction('segments', 'readwrite');
                    delTx.objectStore('segments').delete(seg.id);
                }
            } catch (e) {
                // Network error — will retry next time
                console.log('[SW] Upload failed for segment', seg.segmentNumber, e.message);
            }
        }
    } catch (e) {
        console.log('[SW] Flush failed:', e.message);
    }
}

// On activation, try flushing
self.addEventListener('activate', function(event) {
    event.waitUntil(self.clients.claim());
});

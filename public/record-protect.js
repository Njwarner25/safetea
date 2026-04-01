// ============ SafeTea Record & Protect ============
// Emergency audio recording with GPS + trusted contact alerts

(function() {
    'use strict';

    var TOKEN_KEY = 'safetea_token';
    var LEGAL_KEY = 'safetea_record_legal_accepted';

    var state = {
        recording: false,
        sessionKey: null,
        mediaRecorder: null,
        chunkNumber: 0,
        watchId: null,
        lastLat: null,
        lastLng: null,
        escalationTimer: null,
        overlay: null
    };

    function getToken() { return localStorage.getItem(TOKEN_KEY); }
    function authHeaders() { return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }; }

    function getUser() {
        try { return JSON.parse(localStorage.getItem('safetea_user')); } catch(e) { return null; }
    }

    // ============ LEGAL CONSENT POPUP ============
    function showLegalPopup() {
        return new Promise(function(resolve) {
            var backdrop = document.createElement('div');
            backdrop.id = 'rp-legal-backdrop';
            backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';

            backdrop.innerHTML =
                '<div style="background:#1A1A2E;border:1px solid rgba(231,76,60,0.3);border-radius:16px;padding:28px;max-width:480px;width:100%;max-height:80vh;overflow-y:auto">' +
                    '<div style="text-align:center;margin-bottom:20px">' +
                        '<div style="width:56px;height:56px;background:rgba(231,76,60,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">' +
                            '<i class="fas fa-microphone" style="font-size:24px;color:#e74c3c"></i>' +
                        '</div>' +
                        '<h3 style="color:#fff;font-size:18px;margin-bottom:8px">Record & Protect</h3>' +
                        '<p style="color:#8080A0;font-size:13px">Emergency audio recording for your safety</p>' +
                    '</div>' +
                    '<div style="background:rgba(231,76,60,0.08);border:1px solid rgba(231,76,60,0.15);border-radius:12px;padding:16px;margin-bottom:16px">' +
                        '<h4 style="color:#e74c3c;font-size:14px;margin-bottom:8px"><i class="fas fa-exclamation-triangle"></i> Important Legal Notice</h4>' +
                        '<p style="color:#C0C0D0;font-size:12px;line-height:1.6;margin-bottom:8px">' +
                            'By using Record & Protect, you acknowledge:' +
                        '</p>' +
                        '<ul style="color:#C0C0D0;font-size:12px;line-height:1.8;padding-left:16px;margin:0">' +
                            '<li>Recording laws vary by state. Some states require all-party consent.</li>' +
                            '<li>You are responsible for knowing and following your local recording laws.</li>' +
                            '<li>Audio is uploaded to SafeTea servers and shared with your trusted contacts.</li>' +
                            '<li>Your GPS location will be captured and shared with trusted contacts.</li>' +
                            '<li>This feature is intended for personal safety emergencies only.</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div style="background:rgba(232,160,181,0.08);border:1px solid rgba(232,160,181,0.15);border-radius:12px;padding:16px;margin-bottom:20px">' +
                        '<h4 style="color:#E8A0B5;font-size:14px;margin-bottom:8px"><i class="fas fa-info-circle"></i> Outcry Witness</h4>' +
                        '<p style="color:#C0C0D0;font-size:12px;line-height:1.6">' +
                            'Your trusted contacts will be informed about being a potential "outcry witness" — the first person a victim discloses abuse to. In many states, an outcry witness\'s testimony carries special evidentiary weight in court.' +
                        '</p>' +
                    '</div>' +
                    '<div style="display:flex;gap:10px">' +
                        '<button id="rp-legal-cancel" style="flex:1;background:rgba(255,255,255,0.06);color:#8080A0;border:none;padding:12px;border-radius:10px;font-size:14px;cursor:pointer;font-family:\'Inter\',sans-serif">Cancel</button>' +
                        '<button id="rp-legal-accept" style="flex:1;background:linear-gradient(135deg,#e74c3c,#c0392b);color:#fff;border:none;padding:12px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif">I Understand & Accept</button>' +
                    '</div>' +
                '</div>';

            document.body.appendChild(backdrop);

            document.getElementById('rp-legal-accept').onclick = function() {
                localStorage.setItem(LEGAL_KEY, 'true');
                backdrop.remove();
                resolve(true);
            };
            document.getElementById('rp-legal-cancel').onclick = function() {
                backdrop.remove();
                resolve(false);
            };
            backdrop.addEventListener('click', function(e) {
                if (e.target === backdrop) { backdrop.remove(); resolve(false); }
            });
        });
    }

    // ============ STEALTH OVERLAY ============
    function showStealthOverlay() {
        var overlay = document.createElement('div');
        overlay.id = 'rp-stealth-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px';
        overlay.innerHTML =
            '<div style="text-align:center;max-width:360px">' +
                '<div id="rp-pulse" style="width:80px;height:80px;background:rgba(231,76,60,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;animation:rpPulse 2s ease-in-out infinite">' +
                    '<div style="width:50px;height:50px;background:rgba(231,76,60,0.4);border-radius:50%;display:flex;align-items:center;justify-content:center">' +
                        '<i class="fas fa-microphone" style="font-size:22px;color:#e74c3c"></i>' +
                    '</div>' +
                '</div>' +
                '<p style="color:#e74c3c;font-size:16px;font-weight:600;margin-bottom:6px">Recording Active</p>' +
                '<p id="rp-timer" style="color:#8080A0;font-size:24px;font-weight:300;margin-bottom:6px;font-variant-numeric:tabular-nums">00:00</p>' +
                '<p id="rp-chunk-status" style="color:#555;font-size:11px;margin-bottom:24px">Uploading...</p>' +
                '<p id="rp-gps-status" style="color:#555;font-size:11px;margin-bottom:30px"></p>' +
                '<button id="rp-stop-btn" style="background:linear-gradient(135deg,#e74c3c,#c0392b);color:#fff;border:none;padding:14px 40px;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif;min-width:180px">' +
                    '<i class="fas fa-stop"></i> Stop Recording' +
                '</button>' +
            '</div>';

        // Add pulse animation
        var style = document.createElement('style');
        style.textContent = '@keyframes rpPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.15);opacity:0.7}}';
        overlay.appendChild(style);

        document.body.appendChild(overlay);
        state.overlay = overlay;

        document.getElementById('rp-stop-btn').onclick = stopRecording;

        // Start timer
        var startTime = Date.now();
        state.timerInterval = setInterval(function() {
            var elapsed = Math.floor((Date.now() - startTime) / 1000);
            var mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
            var secs = String(elapsed % 60).padStart(2, '0');
            var timerEl = document.getElementById('rp-timer');
            if (timerEl) timerEl.textContent = mins + ':' + secs;
        }, 1000);
    }

    function hideStealthOverlay() {
        if (state.timerInterval) clearInterval(state.timerInterval);
        if (state.overlay) state.overlay.remove();
        state.overlay = null;
    }

    // ============ START RECORDING ============
    async function startRecording() {
        // Check tier
        var user = getUser();
        if (user && user.subscription_tier !== 'pro' && user.subscription_tier !== 'premium') {
            if (typeof showToast === 'function') showToast('Record & Protect requires SafeTea Pro. Upgrade to access this feature.');
            return;
        }

        // Check legal consent
        if (!localStorage.getItem(LEGAL_KEY)) {
            var accepted = await showLegalPopup();
            if (!accepted) return;
        }

        // Request mic permission
        var stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            if (typeof showToast === 'function') showToast('Microphone access denied. Please enable it in your browser settings.');
            return;
        }

        // Get GPS
        var lat = null, lng = null;
        if (navigator.geolocation) {
            try {
                var pos = await new Promise(function(resolve, reject) {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
                });
                lat = pos.coords.latitude;
                lng = pos.coords.longitude;
                state.lastLat = lat;
                state.lastLng = lng;
            } catch (e) {
                console.warn('GPS unavailable:', e.message);
            }
        }

        // Start session on server
        try {
            var resp = await fetch('/api/recording/start', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ latitude: lat, longitude: lng })
            });
            var data = await resp.json();
            if (!data.success) {
                if (typeof showToast === 'function') showToast(data.error || 'Failed to start recording session');
                stream.getTracks().forEach(function(t) { t.stop(); });
                return;
            }
            state.sessionKey = data.sessionKey;
        } catch (err) {
            if (typeof showToast === 'function') showToast('Network error starting recording. Please try again.');
            stream.getTracks().forEach(function(t) { t.stop(); });
            return;
        }

        state.recording = true;
        state.chunkNumber = 0;

        // Show stealth overlay
        showStealthOverlay();

        // Start MediaRecorder
        var mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        state.mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });

        state.mediaRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) {
                uploadChunk(e.data);
            }
        };

        state.mediaRecorder.onstop = function() {
            stream.getTracks().forEach(function(t) { t.stop(); });
        };

        state.mediaRecorder.start(10000); // 10-second chunks

        // Start GPS tracking
        if (navigator.geolocation) {
            state.watchId = navigator.geolocation.watchPosition(
                function(pos) {
                    state.lastLat = pos.coords.latitude;
                    state.lastLng = pos.coords.longitude;
                    var gpsEl = document.getElementById('rp-gps-status');
                    if (gpsEl) gpsEl.textContent = 'GPS: ' + pos.coords.latitude.toFixed(5) + ', ' + pos.coords.longitude.toFixed(5);
                },
                function() {},
                { enableHighAccuracy: true, maximumAge: 15000 }
            );
        }

        // Escalation timer — 3 minutes
        state.escalationTimer = setTimeout(function() {
            if (state.recording && state.sessionKey) {
                fetch('/api/recording/escalate', {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({ sessionKey: state.sessionKey })
                }).catch(function() {});
                var statusEl = document.getElementById('rp-chunk-status');
                if (statusEl) statusEl.textContent = 'Escalation alert sent to contacts';
            }
        }, 180000); // 3 minutes

        if (typeof showToast === 'function') showToast('Recording started. Your contacts have been notified.');
    }

    // ============ UPLOAD CHUNK ============
    function uploadChunk(blob) {
        var chunkNum = state.chunkNumber++;
        var reader = new FileReader();
        reader.onloadend = function() {
            var base64 = reader.result.split(',')[1];

            fetch('/api/recording/chunk', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    sessionKey: state.sessionKey,
                    chunkNumber: chunkNum,
                    audioData: base64,
                    durationMs: 10000,
                    latitude: state.lastLat,
                    longitude: state.lastLng
                })
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var statusEl = document.getElementById('rp-chunk-status');
                if (statusEl) {
                    statusEl.textContent = data.success
                        ? 'Chunk ' + (chunkNum + 1) + ' uploaded'
                        : 'Upload error — retrying...';
                }
            })
            .catch(function() {
                var statusEl = document.getElementById('rp-chunk-status');
                if (statusEl) statusEl.textContent = 'Upload error — retrying...';
                // Retry once after 3 seconds
                setTimeout(function() {
                    fetch('/api/recording/chunk', {
                        method: 'POST',
                        headers: authHeaders(),
                        body: JSON.stringify({
                            sessionKey: state.sessionKey,
                            chunkNumber: chunkNum,
                            audioData: base64,
                            durationMs: 10000,
                            latitude: state.lastLat,
                            longitude: state.lastLng
                        })
                    }).catch(function() {});
                }, 3000);
            });
        };
        reader.readAsDataURL(blob);
    }

    // ============ STOP RECORDING ============
    function stopRecording() {
        if (!state.recording) return;
        state.recording = false;

        // Stop MediaRecorder
        if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
            state.mediaRecorder.stop();
        }

        // Stop GPS
        if (state.watchId !== null) {
            navigator.geolocation.clearWatch(state.watchId);
            state.watchId = null;
        }

        // Clear escalation timer
        if (state.escalationTimer) {
            clearTimeout(state.escalationTimer);
            state.escalationTimer = null;
        }

        // Notify server
        if (state.sessionKey) {
            fetch('/api/recording/stop', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ sessionKey: state.sessionKey })
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    if (typeof showToast === 'function') showToast('Recording saved. ' + (data.totalChunks || 0) + ' audio chunk(s) stored securely.');
                }
            })
            .catch(function() {
                if (typeof showToast === 'function') showToast('Recording stopped locally. Server sync pending.');
            });
        }

        state.sessionKey = null;
        state.chunkNumber = 0;

        hideStealthOverlay();
    }

    // ============ INIT ============
    window.initRecordProtect = function() {
        var btn = document.getElementById('rp-start-btn');
        if (btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                startRecording();
            });
        }
    };

    // Also expose for direct calls
    window.startRecordProtect = startRecording;
    window.stopRecordProtect = stopRecording;

})();

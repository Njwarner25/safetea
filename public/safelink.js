// SafeLink — Frontend logic
// Pairs with safelink.html. Reuses safetea_token from authStore.

(function() {
    'use strict';

    var SITUATIONAL_MESSAGES = [
        { situation: 'Riding the train alone?', reassurance: "Don't be afraid — SafeLink has you." },
        { situation: 'Walking alone?', reassurance: "You're not alone." },
        { situation: 'Heading home late?', reassurance: 'Stay connected.' },
        { situation: 'Something feels off?', reassurance: "Trust your instincts — we've got you." },
        { situation: 'Commuting late?', reassurance: "You don't have to do it alone." },
        { situation: 'In an unfamiliar place?', reassurance: 'SafeLink keeps you connected to people who care.' },
        { situation: 'Waiting for your ride?', reassurance: "We'll wait with you." },
        { situation: 'New city, new route?', reassurance: "You've got backup." },
        { situation: 'Late shift ending?', reassurance: "Let someone know you're on your way." },
        { situation: 'Parking garage feels empty?', reassurance: "You're still connected." },
        { situation: 'Long walk to your car?', reassurance: "We're with you every step." }
    ];

    var ACTIVE_KEY = 'safelink_active_session';
    var state = {
        user: null,
        sessionKey: null,
        startedAt: null,
        trackingUrl: null,
        contactsNotified: 0,
        watchId: null,
        timerInterval: null
    };

    // ---- Toast ----
    function showToast(msg, type) {
        var t = document.getElementById('toast');
        t.textContent = msg;
        t.className = 'toast visible' + (type ? ' ' + type : '');
        clearTimeout(t._hideT);
        t._hideT = setTimeout(function() { t.className = 'toast' + (type ? ' ' + type : ''); }, 3500);
    }

    function token() { return localStorage.getItem('safetea_token'); }

    function authedFetch(url, opts) {
        opts = opts || {};
        opts.headers = opts.headers || {};
        opts.headers['Authorization'] = 'Bearer ' + token();
        if (opts.body && typeof opts.body !== 'string') {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(opts.body);
        }
        return fetch(url, opts);
    }

    // ---- Init ----
    function init() {
        // Pick situational message
        var msg = SITUATIONAL_MESSAGES[Math.floor(Math.random() * SITUATIONAL_MESSAGES.length)];
        document.getElementById('msg-situation').textContent = msg.situation;
        document.getElementById('msg-reassurance').textContent = msg.reassurance;

        // Auth check
        if (!token()) {
            window.location.href = '/login.html';
            return;
        }

        // Load profile
        authedFetch('/api/auth/me')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data || !data.user) {
                    window.location.href = '/login.html';
                    return;
                }
                state.user = data.user;
                document.getElementById('loading-state').style.display = 'none';

                var tier = state.user.subscription_tier || state.user.tier;
                if (tier !== 'plus' && tier !== 'pro' && tier !== 'premium') {
                    document.getElementById('gate-card').style.display = 'block';
                    return;
                }

                document.getElementById('main-content').style.display = 'block';

                // Restore active session if exists
                var stored = localStorage.getItem(ACTIVE_KEY);
                if (stored) {
                    try {
                        var s = JSON.parse(stored);
                        if (s && s.sessionKey && s.startedAt) {
                            state.sessionKey = s.sessionKey;
                            state.startedAt = new Date(s.startedAt).getTime();
                            state.trackingUrl = s.trackingUrl;
                            state.contactsNotified = s.contactsNotified || 0;
                            showActiveCard();
                            startGeolocation();
                            startTimer();
                        }
                    } catch (e) { localStorage.removeItem(ACTIVE_KEY); }
                }
            })
            .catch(function() {
                document.getElementById('loading-state').style.display = 'none';
                showToast('Could not load your profile. Please try again.', 'error');
            });
    }

    // ---- Activate ----
    window.activateSafeLink = function() {
        var btn = document.getElementById('activate-btn');
        var labelInput = document.getElementById('label-input');
        var label = labelInput.value.trim();

        if (!navigator.geolocation) {
            showToast('Your browser does not support location sharing.', 'error');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Getting your location...';

        navigator.geolocation.getCurrentPosition(function(pos) {
            var lat = pos.coords.latitude;
            var lng = pos.coords.longitude;

            authedFetch('/api/safelink/start', {
                method: 'POST',
                body: { latitude: lat, longitude: lng, label: label }
            })
                .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
                .then(function(res) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-link"></i> Activate SafeLink';

                    if (!res.ok) {
                        showToast(res.data.error || 'Failed to start SafeLink', 'error');
                        return;
                    }

                    state.sessionKey = res.data.sessionKey;
                    state.startedAt = Date.now();
                    state.trackingUrl = res.data.shareData && res.data.shareData.trackingUrl;
                    state.contactsNotified = res.data.contactsNotified || 0;

                    localStorage.setItem(ACTIVE_KEY, JSON.stringify({
                        sessionKey: state.sessionKey,
                        startedAt: new Date(state.startedAt).toISOString(),
                        trackingUrl: state.trackingUrl,
                        contactsNotified: state.contactsNotified
                    }));

                    showActiveCard();
                    startGeolocation();
                    startTimer();

                    var foundMsg = res.data.contactsFound > 0
                        ? 'SafeLink active. ' + state.contactsNotified + ' contact(s) notified.'
                        : 'SafeLink active. Add trusted contacts to notify them automatically.';
                    showToast(foundMsg, 'success');
                })
                .catch(function(err) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-link"></i> Activate SafeLink';
                    showToast('Could not start SafeLink. Please try again.', 'error');
                    console.error('SafeLink start error:', err);
                });
        }, function(err) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-link"></i> Activate SafeLink';
            if (err.code === 1) {
                showToast('Location permission denied. SafeLink needs your location to share with contacts.', 'error');
            } else {
                showToast('Could not get your location. Please try again.', 'error');
            }
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    };

    function showActiveCard() {
        document.getElementById('start-card').style.display = 'none';
        document.getElementById('active-card').style.display = 'block';

        var contactsChip = document.getElementById('chip-contacts');
        if (state.contactsNotified > 0) {
            contactsChip.innerHTML = '<i class="fas fa-users"></i> ' + state.contactsNotified + ' Contact' + (state.contactsNotified === 1 ? '' : 's') + ' Notified';
            contactsChip.classList.remove('warn');
        } else {
            contactsChip.innerHTML = '<i class="fas fa-exclamation-circle"></i> No Contacts on File';
            contactsChip.classList.add('warn');
        }

        if (state.trackingUrl) {
            document.getElementById('active-tracking-url').textContent = state.trackingUrl;
        }
    }

    // ---- Geolocation watch ----
    function startGeolocation() {
        if (!navigator.geolocation || state.watchId !== null) return;
        state.watchId = navigator.geolocation.watchPosition(function(pos) {
            if (!state.sessionKey) return;
            authedFetch('/api/safelink/location', {
                method: 'POST',
                body: {
                    sessionKey: state.sessionKey,
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy
                }
            }).catch(function(){});
        }, function(err) {
            console.error('Watch position error:', err);
        }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    }

    function stopGeolocation() {
        if (state.watchId !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(state.watchId);
            state.watchId = null;
        }
    }

    // ---- Timer ----
    function startTimer() {
        if (state.timerInterval) clearInterval(state.timerInterval);
        updateTimer();
        state.timerInterval = setInterval(updateTimer, 1000);
    }

    function stopTimer() {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
    }

    function updateTimer() {
        if (!state.startedAt) return;
        var elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
        var h = Math.floor(elapsed / 3600);
        var m = Math.floor((elapsed % 3600) / 60);
        var s = elapsed % 60;
        var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
        var text = h > 0 ? (h + ':' + pad(m) + ':' + pad(s)) : (m + ':' + pad(s));
        var el = document.getElementById('active-timer');
        if (el) el.textContent = text;
    }

    // ---- End session ----
    window.endSafeLink = function() {
        if (!state.sessionKey) return;
        if (!confirm('End SafeLink? Your trusted contacts will be notified that you have arrived safely.')) return;

        authedFetch('/api/safelink/stop', {
            method: 'POST',
            body: { sessionKey: state.sessionKey }
        })
            .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
            .then(function(res) {
                if (!res.ok) {
                    showToast(res.data.error || 'Failed to end SafeLink', 'error');
                    return;
                }

                stopGeolocation();
                stopTimer();
                localStorage.removeItem(ACTIVE_KEY);
                state.sessionKey = null;
                state.startedAt = null;
                state.trackingUrl = null;

                document.getElementById('active-card').style.display = 'none';
                document.getElementById('start-card').style.display = 'block';
                document.getElementById('label-input').value = '';

                showToast('SafeLink ended. Stay safe!', 'success');
            })
            .catch(function() {
                showToast('Could not end SafeLink. Please try again.', 'error');
            });
    };

    // ---- Copy tracking link ----
    window.copyTrackingLink = function() {
        if (!state.trackingUrl) return;
        var btn = document.getElementById('copy-link-btn');

        var doneFeedback = function() {
            btn.classList.add('copied');
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(function() {
                btn.classList.remove('copied');
                btn.innerHTML = '<i class="fas fa-copy"></i> Copy Link';
            }, 1800);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(state.trackingUrl).then(doneFeedback).catch(function() {
                fallbackCopy(state.trackingUrl);
                doneFeedback();
            });
        } else {
            fallbackCopy(state.trackingUrl);
            doneFeedback();
        }
    };

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
    }

    // Boot
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

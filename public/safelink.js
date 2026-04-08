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
        timerInterval: null,
        isPublic: false,
        category: null,
        currentTab: 'discover',
        discoverPollInterval: null
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

                // Wire category chip selection
                var chips = document.querySelectorAll('#category-chips .cat-chip');
                chips.forEach(function(chip) {
                    chip.addEventListener('click', function() {
                        chips.forEach(function(c) { c.classList.remove('active'); });
                        if (state.category === chip.dataset.cat) {
                            state.category = null;
                        } else {
                            chip.classList.add('active');
                            state.category = chip.dataset.cat;
                        }
                    });
                });

                // Initial loads for connect features
                loadDiscover();
                loadConnections();
                // Refresh every 20s
                state.discoverPollInterval = setInterval(function() {
                    loadDiscover();
                    loadConnections();
                }, 20000);

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

    // ---- Public toggle ----
    window.togglePublicMode = function() {
        var toggle = document.getElementById('public-toggle');
        var fields = document.getElementById('broadcast-fields');
        var warning = document.getElementById('verify-warning');

        var isVerified = state.user && (state.user.identity_verified === true || (state.user.trust_score || 0) >= 60);

        if (toggle.checked && !isVerified) {
            toggle.checked = false;
            fields.classList.remove('visible');
            warning.style.display = 'block';
            return;
        }

        warning.style.display = 'none';
        if (toggle.checked) {
            fields.classList.add('visible');
        } else {
            fields.classList.remove('visible');
        }
    };

    // ---- Tabs ----
    window.switchTab = function(tab) {
        state.currentTab = tab;
        var btns = document.querySelectorAll('.tab-btn');
        btns.forEach(function(b) { b.classList.toggle('active', b.dataset.tab === tab); });
        var contents = document.querySelectorAll('.tab-content');
        contents.forEach(function(c) { c.classList.remove('active'); });
        var active = document.getElementById('tab-' + tab);
        if (active) active.classList.add('active');
    };

    // ---- Discover ----
    function loadDiscover() {
        authedFetch('/api/safelink/discover')
            .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
            .then(function(res) {
                var list = document.getElementById('discover-list');
                if (!res.ok) {
                    if (res.data && res.data.code === 'verification_required') {
                        list.innerHTML = '<div class="empty-state"><i class="fas fa-shield-alt"></i>Identity verification required to discover broadcasts.<br><a href="/verify.html" style="color:#E8A0B5">Verify now</a></div>';
                    } else {
                        list.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i>Could not load broadcasts</div>';
                    }
                    return;
                }
                renderDiscover(res.data.broadcasts || []);
            })
            .catch(function() {});
    }

    function renderDiscover(broadcasts) {
        var list = document.getElementById('discover-list');
        if (!broadcasts.length) {
            list.innerHTML = '<div class="empty-state"><i class="fas fa-compass"></i>No public SafeLinks right now.<br>Be the first — toggle "Make this public" above.</div>';
            return;
        }
        list.innerHTML = broadcasts.map(function(b) {
            var initials = (b.hostName || 'S').split(' ').map(function(p){ return p.charAt(0); }).join('').slice(0,2).toUpperCase();
            var avatar = b.hostAvatar
                ? '<img src="' + escapeAttr(b.hostAvatar) + '" alt="">'
                : initials;
            var when = relTime(b.createdAt);
            var verified = b.hostVerified ? '<span class="bi-verify"><i class="fas fa-shield-check"></i> Verified</span>' : '';
            var catBadge = b.category ? '<span class="bi-cat">' + escapeHtml(b.category) + '</span>' : '';
            var msg = escapeHtml(b.broadcastMessage || b.label || 'SafeLink active');

            var btnHtml;
            if (b.myRequestStatus === 'accepted') {
                btnHtml = '<button class="bi-btn accepted" disabled><i class="fas fa-check"></i> Connected</button>';
            } else if (b.myRequestStatus === 'pending') {
                btnHtml = '<button class="bi-btn pending" disabled><i class="fas fa-clock"></i> Request sent</button>';
            } else if (b.myRequestStatus === 'declined') {
                btnHtml = '<button class="bi-btn declined" disabled><i class="fas fa-times"></i> Declined</button>';
            } else {
                btnHtml = '<button class="bi-btn" onclick="requestConnect(\'' + escapeAttr(b.sessionKey) + '\')"><i class="fas fa-link"></i> Connect</button>';
            }

            return '' +
                '<div class="broadcast-item">' +
                    '<div class="bi-header">' +
                        '<div class="bi-avatar">' + avatar + '</div>' +
                        '<div style="flex:1;min-width:0">' +
                            '<div class="bi-name-row"><span class="bi-name">' + escapeHtml(b.hostName) + '</span>' + verified + '</div>' +
                            '<div class="bi-when">' + when + '</div>' +
                        '</div>' +
                    '</div>' +
                    catBadge +
                    '<div class="bi-msg">' + msg + '</div>' +
                    '<div class="bi-actions">' + btnHtml + '</div>' +
                '</div>';
        }).join('');
    }

    window.requestConnect = function(sessionKey) {
        authedFetch('/api/safelink/connect', {
            method: 'POST',
            body: { sessionKey: sessionKey }
        })
            .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
            .then(function(res) {
                if (!res.ok) {
                    showToast(res.data.error || 'Could not send request', 'error');
                    return;
                }
                showToast('Connection request sent. Waiting for approval.', 'success');
                loadDiscover();
                loadConnections();
            })
            .catch(function() { showToast('Could not send request', 'error'); });
    };

    // ---- Connections (incoming requests + accepted) ----
    function loadConnections() {
        authedFetch('/api/safelink/connections')
            .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
            .then(function(res) {
                if (!res.ok) return;
                renderRequests(res.data.incoming || []);
                renderConnected(res.data.outgoing || [], res.data.incoming || []);
            })
            .catch(function() {});
    }

    function renderRequests(incoming) {
        var listEl = document.getElementById('requests-list');
        var pending = incoming.filter(function(r) { return r.status === 'pending'; });
        var badge = document.getElementById('req-badge');
        if (pending.length > 0) {
            badge.textContent = '(' + pending.length + ')';
            badge.style.color = '#E8A0B5';
        } else {
            badge.textContent = '';
        }

        if (!pending.length) {
            listEl.innerHTML = '<div class="empty-state"><i class="fas fa-bell"></i>No incoming requests</div>';
            return;
        }
        listEl.innerHTML = pending.map(function(r) {
            var initials = (r.requester.name || 'S').split(' ').map(function(p){ return p.charAt(0); }).join('').slice(0,2).toUpperCase();
            var avatar = r.requester.avatar
                ? '<img src="' + escapeAttr(r.requester.avatar) + '" alt="">'
                : initials;
            var verified = r.requester.verified ? '<span class="bi-verify"><i class="fas fa-shield-check"></i> Verified</span>' : '';
            var msgLine = r.message ? '<div class="bi-msg">"' + escapeHtml(r.message) + '"</div>' : '';
            return '' +
                '<div class="req-item">' +
                    '<div class="bi-header">' +
                        '<div class="bi-avatar">' + avatar + '</div>' +
                        '<div style="flex:1;min-width:0">' +
                            '<div class="bi-name-row"><span class="bi-name">' + escapeHtml(r.requester.name) + '</span>' + verified + '</div>' +
                            '<div class="bi-when">' + relTime(r.createdAt) + '</div>' +
                        '</div>' +
                    '</div>' +
                    msgLine +
                    '<div class="req-actions">' +
                        '<button class="req-accept" onclick="respondRequest(' + r.id + ', \'accept\')"><i class="fas fa-check"></i> Accept</button>' +
                        '<button class="req-decline" onclick="respondRequest(' + r.id + ', \'decline\')"><i class="fas fa-times"></i> Decline</button>' +
                    '</div>' +
                '</div>';
        }).join('');
    }

    function renderConnected(outgoing, incoming) {
        var listEl = document.getElementById('connected-list');
        var acceptedOut = outgoing.filter(function(r) { return r.status === 'accepted' && r.sessionStatus === 'active'; });
        var acceptedIn = incoming.filter(function(r) { return r.status === 'accepted'; });

        if (!acceptedOut.length && !acceptedIn.length) {
            listEl.innerHTML = '<div class="empty-state"><i class="fas fa-link"></i>No active connections</div>';
            return;
        }

        var html = '';
        acceptedOut.forEach(function(r) {
            var initials = (r.host.name || 'S').split(' ').map(function(p){ return p.charAt(0); }).join('').slice(0,2).toUpperCase();
            var avatar = r.host.avatar ? '<img src="' + escapeAttr(r.host.avatar) + '" alt="">' : initials;
            var locBtn = r.hostLocation
                ? '<a class="bi-btn" target="_blank" href="https://www.google.com/maps?q=' + r.hostLocation.latitude + ',' + r.hostLocation.longitude + '"><i class="fas fa-map-marker-alt"></i> View location</a>'
                : '<button class="bi-btn" disabled>Waiting for location...</button>';
            var trackBtn = '<a class="bi-btn" target="_blank" href="/safelink-track?key=' + escapeAttr(r.sessionKey) + '"><i class="fas fa-map"></i> Open tracker</a>';
            html += '' +
                '<div class="broadcast-item">' +
                    '<div class="bi-header">' +
                        '<div class="bi-avatar">' + avatar + '</div>' +
                        '<div style="flex:1;min-width:0">' +
                            '<div class="bi-name-row"><span class="bi-name">' + escapeHtml(r.host.name) + '</span><span class="bi-verify"><i class="fas fa-shield-check"></i> Verified</span></div>' +
                            '<div class="bi-when">Connected with you</div>' +
                        '</div>' +
                    '</div>' +
                    (r.broadcastMessage ? '<div class="bi-msg">' + escapeHtml(r.broadcastMessage) + '</div>' : '') +
                    '<div class="bi-actions">' + locBtn + trackBtn + '</div>' +
                '</div>';
        });
        acceptedIn.forEach(function(r) {
            var initials = (r.requester.name || 'S').split(' ').map(function(p){ return p.charAt(0); }).join('').slice(0,2).toUpperCase();
            var avatar = r.requester.avatar ? '<img src="' + escapeAttr(r.requester.avatar) + '" alt="">' : initials;
            html += '' +
                '<div class="broadcast-item">' +
                    '<div class="bi-header">' +
                        '<div class="bi-avatar">' + avatar + '</div>' +
                        '<div style="flex:1;min-width:0">' +
                            '<div class="bi-name-row"><span class="bi-name">' + escapeHtml(r.requester.name) + '</span><span class="bi-verify"><i class="fas fa-shield-check"></i> Verified</span></div>' +
                            '<div class="bi-when">Connected to your SafeLink</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        });
        listEl.innerHTML = html;
    }

    window.respondRequest = function(requestId, action) {
        authedFetch('/api/safelink/respond', {
            method: 'POST',
            body: { requestId: requestId, action: action }
        })
            .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
            .then(function(res) {
                if (!res.ok) {
                    showToast(res.data.error || 'Failed', 'error');
                    return;
                }
                showToast('Request ' + action + 'ed', 'success');
                loadConnections();
                loadDiscover();
            })
            .catch(function() { showToast('Failed', 'error'); });
    };

    // ---- Helpers ----
    function escapeHtml(s) {
        if (s == null) return '';
        return String(s).replace(/[&<>"']/g, function(c) {
            return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
        });
    }
    function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
    function relTime(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        var s = Math.floor((Date.now() - d.getTime()) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s/60) + 'm ago';
        if (s < 86400) return Math.floor(s/3600) + 'h ago';
        return Math.floor(s/86400) + 'd ago';
    }

    // ---- Activate ----
    window.activateSafeLink = function() {
        var btn = document.getElementById('activate-btn');
        var labelInput = document.getElementById('label-input');
        var label = labelInput.value.trim();
        var publicToggle = document.getElementById('public-toggle');
        var broadcastInput = document.getElementById('broadcast-msg');
        var isPublic = publicToggle && publicToggle.checked;
        var broadcastMessage = broadcastInput ? broadcastInput.value.trim() : '';

        if (isPublic && !broadcastMessage) {
            showToast('Add a short broadcast message so others know your situation.', 'error');
            return;
        }

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
                body: {
                    latitude: lat,
                    longitude: lng,
                    label: label,
                    isPublic: isPublic,
                    broadcastMessage: isPublic ? broadcastMessage : null,
                    category: isPublic ? state.category : null
                }
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
                    state.isPublic = !!res.data.isPublic;

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

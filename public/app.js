// ============ SafeTea Dashboard — app.js ============
// Core initialization, auth, profile, tools wiring

(function() {
    'use strict';

    var TOKEN_KEY = 'safetea_token';
    var USER_KEY = 'safetea_user';

    function getToken() { return localStorage.getItem(TOKEN_KEY); }
    function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch(e) { return null; } }
    function authHeaders() { return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }; }

    // ============ AUTH GUARD ============
    var token = getToken();
    if (!token) {
        window.location.href = '/login';
    }

    // ============ LOAD PROFILE ============
    function loadProfile() {
        var user = getUser();
        if (user) renderProfile(user);

        // Refresh from server
        fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + getToken() } })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.user) {
                    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
                    renderProfile(data.user);
                }
            })
            .catch(function() {});
    }

    function renderProfile(user) {
        var nameEl = document.getElementById('profile-name');
        var emailEl = document.getElementById('profile-email');
        var roleEl = document.getElementById('profile-role');
        var tierEl = document.getElementById('profile-tier');
        var avatarEl = document.getElementById('profile-avatar');
        var welcomeEl = document.getElementById('home-welcome-text');
        var avatarPreview = document.getElementById('avatar-preview');
        var avatarPreviewName = document.getElementById('avatar-preview-name');

        var displayName = user.custom_display_name || user.display_name || user.email.split('@')[0];
        var initial = displayName.charAt(0).toUpperCase();

        if (nameEl) nameEl.textContent = displayName;
        if (emailEl) emailEl.textContent = user.email;
        if (roleEl) roleEl.textContent = user.role || 'member';
        if (avatarEl) {
            avatarEl.textContent = initial;
            if (user.avatar_color) avatarEl.style.background = user.avatar_color;
        }
        if (welcomeEl) welcomeEl.innerHTML = 'Welcome back, ' + escapeHtmlSafe(displayName) + '! <span style="font-size:20px">&#128150;</span>';
        if (avatarPreview) {
            avatarPreview.textContent = initial;
            if (user.avatar_color) avatarPreview.style.background = user.avatar_color;
        }
        if (avatarPreviewName) avatarPreviewName.textContent = displayName;

        // Show tier badge
        if (tierEl) {
            var isPremium = user.subscription_tier === 'pro' || user.subscription_tier === 'premium' || user.subscription_tier === 'plus';
            tierEl.style.display = isPremium ? 'block' : 'none';
        }

        // Date check premium gate
        var dcUpgradeWall = document.getElementById('dc-upgrade-wall');
        var dcPremiumContent = document.getElementById('dc-premium-content');
        var isPaid = user.subscription_tier === 'pro' || user.subscription_tier === 'premium' || user.subscription_tier === 'plus';
        if (dcUpgradeWall) dcUpgradeWall.style.display = isPaid ? 'none' : 'block';
        if (dcPremiumContent) dcPremiumContent.style.display = isPaid ? 'block' : 'none';

        // Inbox premium gate
        var inboxGate = document.getElementById('inbox-gate');
        var inboxContent = document.getElementById('inbox-content');
        if (inboxGate) inboxGate.style.display = isPaid ? 'none' : 'block';
        if (inboxContent) inboxContent.style.display = isPaid ? 'block' : 'none';

        // User avatar in nav
        var navAvatar = document.querySelector('.user-avatar');
        if (navAvatar) {
            navAvatar.textContent = initial;
            if (user.avatar_color) navAvatar.style.background = user.avatar_color;
        }
    }

    function escapeHtmlSafe(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatDateTime(dateStr) {
        if (!dateStr) return 'N/A';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'Invalid date';
        return d.toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
        });
    }

    // ============ VERIFICATION STATUS ============
    function loadVerificationStatus() {
        fetch('/api/auth/verify/status', { headers: { 'Authorization': 'Bearer ' + getToken() } })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.steps) {
                    updateVerifyStep('age', data.steps.age);
                    updateVerifyStep('identity', data.steps.identity);
                    updateVerifyStep('gender', data.steps.gender);
                }

                var banner = document.getElementById('verification-banner');
                if (banner && data.verified) {
                    banner.style.display = 'block';
                    banner.style.background = 'rgba(46,204,113,0.15)';
                    banner.style.color = '#2ecc71';
                    banner.innerHTML = '<i class="fas fa-check-circle"></i> Fully Verified';
                }

                // Show verify identity button if age is done but identity isn't
                var identBtn = document.getElementById('btn-verify-identity');
                if (identBtn && data.nextStep === 'identity') {
                    identBtn.style.display = 'inline-block';
                }
            })
            .catch(function() {
                setVerifyStatus('age', 'Unable to check');
                setVerifyStatus('identity', 'Unable to check');
                setVerifyStatus('gender', 'Unable to check');
            });
    }

    function updateVerifyStep(step, info) {
        var statusEl = document.getElementById('verify-' + step + '-status');
        var stepEl = document.getElementById('verify-step-' + step);
        var iconEl = stepEl ? stepEl.querySelector('.verify-icon') : null;

        if (info.completed) {
            if (statusEl) { statusEl.textContent = 'Verified'; statusEl.style.color = '#2ecc71'; }
            if (iconEl) { iconEl.classList.remove('pending'); iconEl.classList.add('completed'); iconEl.style.background = 'rgba(46,204,113,0.15)'; iconEl.style.color = '#2ecc71'; }
        } else {
            if (statusEl) { statusEl.textContent = 'Not verified'; statusEl.style.color = '#f1c40f'; }
            if (iconEl) { iconEl.style.background = 'rgba(241,196,15,0.15)'; iconEl.style.color = '#f1c40f'; }
        }
    }

    function setVerifyStatus(step, text) {
        var el = document.getElementById('verify-' + step + '-status');
        if (el) { el.textContent = text; el.style.color = '#8080A0'; }
    }

    // ============ LOGOUT ============
    window.handleLogout = function() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        window.location.href = '/login';
    };

    // ============ AREA ALERTS ============
    var areaAlertLat = null;
    var areaAlertLon = null;

    window.detectLocationAndFetch = function() {
        var prompt = document.getElementById('area-alerts-prompt');
        var loading = document.getElementById('area-alerts-loading');
        if (prompt) prompt.style.display = 'none';
        if (loading) loading.style.display = 'block';

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(pos) {
                areaAlertLat = pos.coords.latitude;
                areaAlertLon = pos.coords.longitude;
                fetchAreaAlerts();
            }, function() {
                if (loading) loading.style.display = 'none';
                if (prompt) prompt.style.display = 'block';
                if (typeof showToast === 'function') showToast('Location access denied. Enable location to see nearby alerts.');
            });
        } else {
            if (loading) loading.style.display = 'none';
            if (typeof showToast === 'function') showToast('Geolocation not supported by your browser.');
        }
    };

    window.refreshAreaAlerts = function() {
        if (areaAlertLat && areaAlertLon) {
            fetchAreaAlerts();
        }
    };

    function fetchAreaAlerts() {
        var loading = document.getElementById('area-alerts-loading');
        var listEl = document.getElementById('area-alerts-list');
        var summaryEl = document.getElementById('area-alerts-summary');
        var emptyEl = document.getElementById('area-alerts-empty');
        var prompt = document.getElementById('area-alerts-prompt');

        if (loading) loading.style.display = 'block';
        if (listEl) listEl.style.display = 'none';
        if (summaryEl) summaryEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'none';
        if (prompt) prompt.style.display = 'none';

        var radius = document.getElementById('alert-radius');
        var days = document.getElementById('alert-days');
        var r = radius ? radius.value : '0.5';
        var d = days ? days.value : '30';

        fetch('/api/alerts/area?lat=' + areaAlertLat + '&lon=' + areaAlertLon + '&radius=' + r + '&days=' + d + '&limit=30', {
            headers: { 'Authorization': 'Bearer ' + getToken() }
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (loading) loading.style.display = 'none';

            if (!data.alerts || data.alerts.length === 0) {
                if (emptyEl) emptyEl.style.display = 'block';
                return;
            }

            // Summary
            if (summaryEl) {
                summaryEl.style.display = 'block';
                summaryEl.innerHTML = '<div style="background:rgba(232,160,181,0.08);border:1px solid rgba(232,160,181,0.15);border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:14px;color:#F0D0C0">' +
                    '<strong>' + data.total + '</strong> safety incident' + (data.total !== 1 ? 's' : '') +
                    ' within <strong>' + data.radius_miles + ' mi</strong> in the last <strong>' + data.days_back + ' days</strong></div>';
            }

            // Alert list
            if (listEl) {
                listEl.style.display = 'block';
                var html = '';
                data.alerts.forEach(function(alert) {
                    var cat = CATEGORY_MAP[alert.crime_type] || { label: alert.crime_type, severity: 'medium', icon: '⚠️' };
                    var dist = parseFloat(alert.distance_miles).toFixed(2);
                    var timeAgo = getTimeAgoFromDate(alert.occurred_at);
                    var sevClass = cat.severity === 'high' ? 'border-left:3px solid #e74c3c' : 'border-left:3px solid #f1c40f';
                    html += '<div style="background:#1A1A2E;border-radius:8px;padding:12px 16px;margin-bottom:8px;' + sevClass + '">';
                    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
                    html += '<span style="font-size:16px">' + cat.icon + '</span>';
                    html += '<strong style="color:#fff;font-size:14px">' + escapeHtmlSafe(cat.label) + '</strong>';
                    html += '<span style="margin-left:auto;color:#8080A0;font-size:12px">' + dist + ' mi away</span>';
                    html += '</div>';
                    html += '<div style="color:#8080A0;font-size:12px">' + timeAgo;
                    if (alert.description) html += ' — ' + escapeHtmlSafe(alert.description.substring(0, 100));
                    html += '</div></div>';
                });
                listEl.innerHTML = html;
            }

            // Also populate the alerts tab
            var alertsFullList = document.getElementById('alerts-full-list');
            if (alertsFullList && data.alerts.length > 0) {
                var tabHtml = '<div style="margin-bottom:12px;padding:12px;background:rgba(232,160,181,0.06);border-radius:10px;font-size:13px;color:#F0D0C0">' +
                    data.total + ' safety alert' + (data.total !== 1 ? 's' : '') + ' near your location</div>';
                data.alerts.slice(0, 10).forEach(function(alert) {
                    var cat = CATEGORY_MAP[alert.crime_type] || { label: alert.crime_type, severity: 'medium', icon: '⚠️' };
                    var dist = parseFloat(alert.distance_miles).toFixed(2);
                    tabHtml += '<div class="alert-item"><div class="alert-title"><span class="severity-dot severity-' + cat.severity + '"></span>' + escapeHtmlSafe(cat.label) + '</div>';
                    tabHtml += '<div class="alert-meta">' + dist + ' mi away — ' + getTimeAgoFromDate(alert.occurred_at) + '</div></div>';
                });
                alertsFullList.innerHTML = tabHtml;
            }
        })
        .catch(function() {
            if (loading) loading.style.display = 'none';
            if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.innerHTML = '<p style="color:#8080A0">Unable to load alerts. Please try again.</p>'; }
        });
    }

    var CATEGORY_MAP = {
        sexual_assault: { label: 'Sexual Assault', severity: 'high', icon: '🚨' },
        assault: { label: 'Assault', severity: 'high', icon: '⚠️' },
        domestic_violence: { label: 'Domestic Violence', severity: 'high', icon: '🚨' },
        stalking: { label: 'Stalking', severity: 'high', icon: '🚨' },
        kidnapping: { label: 'Kidnapping', severity: 'high', icon: '🚨' },
        human_trafficking: { label: 'Human Trafficking', severity: 'high', icon: '🚨' },
        harassment: { label: 'Harassment', severity: 'medium', icon: '⚠️' },
        robbery: { label: 'Robbery', severity: 'medium', icon: '⚠️' },
        indecent_exposure: { label: 'Indecent Exposure', severity: 'medium', icon: '⚠️' }
    };

    function getTimeAgoFromDate(dateStr) {
        var d = new Date(dateStr);
        var now = Date.now();
        var diff = now - d.getTime();
        var mins = Math.floor(diff / 60000);
        if (mins < 60) return mins + 'm ago';
        var hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        var days = Math.floor(hrs / 24);
        if (days < 30) return days + 'd ago';
        return Math.floor(days / 30) + 'mo ago';
    }

    // ============ WATCH ZONES ============
    window.addWatchZone = function() {
        if (typeof showToast === 'function') showToast('Watch zones feature coming soon!');
    };

    function loadWatchZones() {
        var el = document.getElementById('watch-zones-list');
        if (!el) return;
        fetch('/api/watch-zones', { headers: { 'Authorization': 'Bearer ' + getToken() } })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.zones && data.zones.length > 0) {
                    var html = '';
                    data.zones.forEach(function(z) {
                        html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)">';
                        html += '<i class="fas fa-map-pin" style="color:#E8A0B5"></i>';
                        html += '<span style="color:#fff;font-size:13px">' + escapeHtmlSafe(z.label || z.address || 'Zone') + '</span>';
                        html += '</div>';
                    });
                    el.innerHTML = html;
                } else {
                    el.innerHTML = '<p style="font-size:13px">No watch zones set. Tap "Add Zone" to monitor an area.</p>';
                }
            })
            .catch(function() {
                el.innerHTML = '<p style="font-size:13px">No watch zones set.</p>';
            });
    }

    // ============ ALERTS TAB ============
    function initAlertsTab() {
        var alertsFullList = document.getElementById('alerts-full-list');
        if (!alertsFullList) return;
        // Set a default message
        alertsFullList.innerHTML = '<div style="text-align:center;padding:24px;color:#8080A0"><i class="fas fa-location-crosshairs" style="font-size:24px;display:block;margin-bottom:8px;color:#E8A0B5"></i>Enable location in <a href="#" onclick="switchTab(\'hub\');setTimeout(function(){switchHubTab(\'search\')},100);return false" style="color:#E8A0B5">Safety Resources</a> to see alerts near you.</div>';
    }

    // ============ PHOTO VERIFICATION (CATFISH CHECK) ============
    window.handleCatfishFile = function(input) {
        var file = input.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { if (typeof showToast === 'function') showToast('File too large (max 5MB)'); return; }

        var reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('cf-image-data').value = e.target.result;
            document.getElementById('cf-image-url').value = '';
            var preview = document.getElementById('cf-preview');
            var previewImg = document.getElementById('cf-preview-img');
            if (preview && previewImg) {
                previewImg.src = e.target.result;
                preview.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
    };

    window.handleCatfishFileDrop = function(event) {
        var file = event.dataTransfer.files[0];
        if (file) {
            var input = document.getElementById('cf-file-input');
            var dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            handleCatfishFile(input);
        }
    };

    window.runCatfishCheck = function() {
        var imageData = document.getElementById('cf-image-data').value;
        var imageUrl = document.getElementById('cf-image-url').value;
        var profileName = document.getElementById('cf-profile-name').value.trim();
        var platform = document.getElementById('cf-platform').value;
        var results = document.getElementById('catfish-results');

        if (!imageData && !imageUrl) { if (typeof showToast === 'function') showToast('Upload a photo or paste an image URL'); return; }

        results.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Verifying photo authenticity...</div>';

        fetch('/api/screening/catfish', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ imageData: imageData || undefined, imageUrl: imageUrl || undefined, profileName: profileName, platform: platform })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.error) { results.innerHTML = '<p style="color:#FF6B6B">' + escapeHtmlSafe(data.error) + '</p>'; return; }
            if (!data.scan) { results.innerHTML = '<p style="color:#8080A0">No results</p>'; return; }

            var scan = data.scan;
            var riskColors = { high_risk: '#e74c3c', medium_risk: '#f1c40f', low_risk: '#f39c12', likely_safe: '#2ecc71' };
            var color = riskColors[scan.riskLevel] || '#8080A0';

            var html = '<div style="text-align:center;padding:20px;background:rgba(' + (scan.riskLevel === 'likely_safe' ? '46,204,113' : scan.riskLevel === 'high_risk' ? '231,76,60' : '241,196,15') + ',0.08);border:1px solid ' + color + ';border-radius:12px;margin-bottom:16px">';
            html += '<div style="font-size:32px;margin-bottom:8px">' + (scan.riskLabel ? scan.riskLabel.split(' ')[0] : '') + '</div>';
            html += '<div style="font-size:18px;font-weight:700;color:' + color + '">' + escapeHtmlSafe(scan.riskLabel || '') + '</div>';
            html += '<div style="font-size:36px;font-weight:800;color:' + color + ';margin:8px 0">' + scan.catfishScore + '/100</div>';
            html += '</div>';

            if (scan.redFlags && scan.redFlags.length > 0) {
                html += '<h4 style="color:#e74c3c;font-size:14px;margin-bottom:8px">🚩 Red Flags</h4>';
                scan.redFlags.forEach(function(f) {
                    var sColor = f.severity === 'critical' ? '#e74c3c' : f.severity === 'high' ? '#e74c3c' : '#f1c40f';
                    html += '<div style="background:#1A1A2E;border-left:3px solid ' + sColor + ';border-radius:8px;padding:12px;margin-bottom:6px">';
                    html += '<div style="color:#fff;font-weight:600;font-size:13px">' + escapeHtmlSafe(f.label) + '</div>';
                    html += '<div style="color:#8080A0;font-size:12px;margin-top:4px">' + escapeHtmlSafe(f.description || '') + '</div></div>';
                });
            }

            if (scan.greenFlags && scan.greenFlags.length > 0) {
                html += '<h4 style="color:#2ecc71;font-size:14px;margin:16px 0 8px">✅ Green Flags</h4>';
                scan.greenFlags.forEach(function(f) {
                    html += '<div style="background:#1A1A2E;border-left:3px solid #2ecc71;border-radius:8px;padding:12px;margin-bottom:6px">';
                    html += '<div style="color:#fff;font-size:13px">' + escapeHtmlSafe(f.label) + '</div>';
                    html += '<div style="color:#8080A0;font-size:12px;margin-top:4px">' + escapeHtmlSafe(f.description || '') + '</div></div>';
                });
            }

            results.innerHTML = html;
        })
        .catch(function() {
            results.innerHTML = '<p style="color:#FF6B6B">Analysis failed. Please try again.</p>';
        });
    };

    // ============ DATE CHECK-OUT / CHECK-IN ============
    var activeDateData = null;
    var activeDateTimer = null;

    // Check for active date on page load
    function checkActiveDate() {
        fetch('/api/dates/checkout', { headers: authHeaders() })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data && data.checkouts && data.checkouts.length > 0) {
                    // Find the most recent checked_out date
                    var active = data.checkouts.find(function(c) { return c.status === 'checked_out'; });
                    if (active) {
                        activeDateData = active;
                        showActiveDate(activeDateData);
                    }
                }
            })
            .catch(function() {});
    }
    checkActiveDate();

    window.handleDatePhotoUpload = function(input) {
        var file = input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(e) {
            var preview = document.getElementById('dc-photo-preview');
            var previewImg = document.getElementById('dc-photo-preview-img');
            var placeholder = document.getElementById('dc-photo-placeholder');
            if (preview && previewImg) { previewImg.src = e.target.result; preview.style.display = 'block'; }
            if (placeholder) placeholder.style.display = 'none';
        };
        reader.readAsDataURL(file);
    };

    window.addContactRow = function() {
        var list = document.getElementById('dc-contacts-list');
        if (!list) return;
        var row = document.createElement('div');
        row.className = 'dc-contact-row';
        row.innerHTML = '<input type="text" placeholder="Name" class="dc-contact-name"><input type="tel" placeholder="Phone (e.g. 630-675-8076)" class="dc-contact-phone"><button class="dc-contact-remove" onclick="this.parentElement.remove()" title="Remove">&times;</button>';
        list.appendChild(row);
    };

    window.dateCheckOut = function() {
        var btn = document.getElementById('dc-checkout-btn');
        var dateName = document.getElementById('dc-date-name').value.trim();
        var venueName = document.getElementById('dc-venue-name').value.trim();
        var venueAddress = document.getElementById('dc-venue-address').value.trim();
        var transportation = document.getElementById('dc-transportation').value;
        var transportDetails = document.getElementById('dc-transport-details') ? document.getElementById('dc-transport-details').value.trim() : '';
        var scheduledTime = document.getElementById('dc-scheduled-time').value;
        var returnTime = document.getElementById('dc-return-time').value;
        var notes = document.getElementById('dc-notes').value.trim();

        // Photo: base64 from file or URL
        var photoPreviewImg = document.getElementById('dc-photo-preview-img');
        var photoUrl = document.getElementById('dc-photo-url').value.trim();
        var datePhotoUrl = (photoPreviewImg && photoPreviewImg.src && photoPreviewImg.src.startsWith('data:')) ? photoPreviewImg.src : photoUrl;

        if (!dateName || !venueName || !scheduledTime) {
            if (typeof showToast === 'function') showToast('Please fill in required fields: name, venue, and date/time');
            return;
        }

        // Gather trusted contacts
        var contacts = [];
        document.querySelectorAll('#dc-contacts-list .dc-contact-row').forEach(function(row) {
            var name = row.querySelector('.dc-contact-name').value.trim();
            var phone = row.querySelector('.dc-contact-phone').value.trim();
            if (name && phone) contacts.push({ name: name, phone: phone });
        });

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking out...'; }

        fetch('/api/dates/checkout', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                dateName: dateName,
                datePhotoUrl: datePhotoUrl,
                venueName: venueName,
                venueAddress: venueAddress,
                transportation: transportation,
                transportDetails: transportDetails,
                scheduledTime: new Date(scheduledTime).toISOString(),
                estimatedReturn: returnTime ? new Date(returnTime).toISOString() : undefined,
                notes: notes,
                trustedContacts: contacts
            })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-door-open"></i> Check Out & Generate SafeTea Report'; }
            if (data.error) { if (typeof showToast === 'function') showToast(data.error); return; }
            if (typeof showToast === 'function') showToast(data.smsMessage || 'Checked out! Your trusted contacts will be notified.');
            activeDateData = data.checkout || data.date || data;
            showActiveDate(activeDateData);
        })
        .catch(function() {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-door-open"></i> Check Out & Generate SafeTea Report'; }
            if (typeof showToast === 'function') showToast('Check-out failed. Please try again.');
        });
    };

    function showActiveDate(date) {
        var form = document.getElementById('dc-form');
        var active = document.getElementById('dc-active');
        var homeActive = document.getElementById('home-active-date');

        if (form) form.style.display = 'none';
        if (active) active.style.display = 'block';

        // Fill active date details
        var nameEl = document.getElementById('dc-active-name');
        var venueEl = document.getElementById('dc-active-venue');
        var timeEl = document.getElementById('dc-active-time');
        if (nameEl) nameEl.textContent = date.date_name || date.dateName || '';
        if (venueEl) venueEl.textContent = date.venue_name || date.venueName || '';
        if (timeEl) timeEl.textContent = formatDateTime(date.scheduled_time || date.scheduledTime);

        if (date.date_photo_url || date.datePhotoUrl) {
            var photoDiv = document.getElementById('dc-active-photo');
            var photoImg = document.getElementById('dc-active-photo-img');
            if (photoDiv && photoImg) { photoImg.src = date.date_photo_url || date.datePhotoUrl; photoDiv.style.display = 'block'; }
        }

        // Home active date card
        if (homeActive) {
            homeActive.style.display = 'block';
            var homeActiveName = document.getElementById('home-active-name');
            var homeActiveVenue = document.getElementById('home-active-venue');
            if (homeActiveName) homeActiveName.textContent = date.date_name || date.dateName || '';
            if (homeActiveVenue) homeActiveVenue.textContent = date.venue_name || date.venueName || '';
        }

        // Start timer
        startDateTimer(date.created_at || new Date().toISOString());
    }

    function startDateTimer(checkoutTime) {
        if (activeDateTimer) clearInterval(activeDateTimer);
        var start = new Date(checkoutTime).getTime();
        activeDateTimer = setInterval(function() {
            var elapsed = Date.now() - start;
            var hrs = Math.floor(elapsed / 3600000);
            var mins = Math.floor((elapsed % 3600000) / 60000);
            var secs = Math.floor((elapsed % 60000) / 1000);
            var text = (hrs > 0 ? hrs + 'h ' : '') + mins + 'm ' + secs + 's';
            var timer = document.getElementById('dc-timer');
            var homeTimer = document.getElementById('home-timer');
            if (timer) timer.textContent = text;
            if (homeTimer) homeTimer.textContent = text;
        }, 1000);
    }

    window.dateCheckIn = function() {
        if (!activeDateData) { if (typeof showToast === 'function') showToast('No active date to check in from'); return; }

        var dateId = activeDateData.id;
        fetch('/api/dates/checkin', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ dateId: dateId })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.error) { if (typeof showToast === 'function') showToast(data.error); return; }
            if (typeof showToast === 'function') showToast('Checked in safely! Your contacts have been notified.');
            if (activeDateTimer) clearInterval(activeDateTimer);
            activeDateData = null;

            // Reset UI
            var active = document.getElementById('dc-active');
            var form = document.getElementById('dc-form');
            var homeActive = document.getElementById('home-active-date');
            if (active) active.style.display = 'none';
            if (form) form.style.display = 'block';
            if (homeActive) homeActive.style.display = 'none';
        })
        .catch(function() { if (typeof showToast === 'function') showToast('Check-in failed. Please try again.'); });
    };

    window.triggerSOS = function() {
        if (!confirm('This will alert your trusted contacts with your GPS location. Are you sure?')) return;

        var sendSOS = function(lat, lng) {
            var token = localStorage.getItem('safetea_token');
            fetch('/api/dates/sos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ type: 'alert_contacts', latitude: lat || null, longitude: lng || null })
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    if (typeof showToast === 'function') showToast('SOS sent! ' + (data.contactsNotified || 0) + ' contact(s) notified.');
                } else {
                    if (typeof showToast === 'function') showToast(data.error || 'SOS failed. Please try again.');
                }
            })
            .catch(function() {
                if (typeof showToast === 'function') showToast('Network error. Please try calling 911 directly.');
            });
        };

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function(pos) { sendSOS(pos.coords.latitude, pos.coords.longitude); },
                function() { sendSOS(null, null); },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        } else {
            sendSOS(null, null);
        }
    };

    window.triggerCall911 = function() {
        if (!confirm('This will call 911. Are you sure?')) return;
        // Log the event
        var token = localStorage.getItem('safetea_token');
        fetch('/api/dates/sos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ type: 'call_911' })
        }).catch(function() {});
        window.open('tel:911', '_self');
    };

    function reportRow(icon, label, value) {
        return '<div class="safetea-report-row">' +
            '<div class="safetea-report-icon"><i class="fas ' + icon + '"></i></div>' +
            '<div><div class="safetea-report-label">' + label + '</div><div class="safetea-report-value">' + value + '</div></div>' +
        '</div>';
    }

    function renderSafeTeaReport(report) {
        var container = document.getElementById('dc-report-content');
        if (!container) return;

        var photoHtml = '';
        if (report.datePhotoUrl || report.date_photo_url) {
            var photoSrc = report.datePhotoUrl || report.date_photo_url;
            photoHtml = '<div class="safetea-report-photo"><img src="' + escapeHtmlSafe(photoSrc) + '" alt="Date photo" onerror="this.parentElement.style.display=\'none\'"></div>';
        }

        var rows = '';
        rows += reportRow('fa-user', 'Meeting', escapeHtmlSafe(report.dateName || report.date_name || ''));
        var venue = escapeHtmlSafe(report.venue || report.venue_name || report.venueName || '');
        var addr = report.address || report.venue_address || report.venueAddress || '';
        if (addr) venue += '<br><span style="font-size:12px;color:#8080A0">' + escapeHtmlSafe(addr) + '</span>';
        rows += reportRow('fa-map-marker-alt', 'Location', venue);
        var transport = report.transportation || '';
        var transportDetail = report.transportDetails || report.transport_details || '';
        if (transport) rows += reportRow('fa-car', 'Transportation', escapeHtmlSafe(transport) + (transportDetail ? '<br><span style="font-size:12px;color:#8080A0">' + escapeHtmlSafe(transportDetail) + '</span>' : ''));
        var sTime = report.scheduledTime || report.scheduled_time;
        if (sTime) rows += reportRow('fa-clock', 'Date & Time', formatDateTime(sTime));
        var eReturn = report.estimatedReturn || report.estimated_return;
        if (eReturn) rows += reportRow('fa-home', 'Expected Back', formatDateTime(eReturn));
        if (report.notes) rows += reportRow('fa-sticky-note', 'Notes', escapeHtmlSafe(report.notes));
        var trackUrl = report.trackingUrl || ('https://www.getsafetea.app/date-status?code=' + (report.shareCode || report.share_code || ''));
        rows += reportRow('fa-link', 'Live Tracking', '<a href="' + escapeHtmlSafe(trackUrl) + '" target="_blank" style="color:#E8A0B5;text-decoration:underline;word-break:break-all">' + escapeHtmlSafe(trackUrl) + '</a>');

        var userName = report.userName || report.user_name || '';
        var shareCode = report.shareCode || report.share_code || '';
        var createdAt = report.createdAt || report.created_at || '';

        container.innerHTML =
            '<div class="safetea-report">' +
                '<div class="safetea-report-header">' +
                    '<h3><i class="fas fa-shield-alt"></i> SafeTea Report</h3>' +
                    (userName ? '<p>Date Safety Details for ' + escapeHtmlSafe(userName) + '</p>' : '') +
                '</div>' +
                '<div class="safetea-report-body">' +
                    photoHtml +
                    rows +
                '</div>' +
                '<div class="safetea-report-footer">' +
                    '<span>' + (shareCode ? 'Report #' + shareCode + ' | ' : '') + (createdAt ? 'Generated ' + formatDateTime(createdAt) : '') + '</span>' +
                '</div>' +
            '</div>';
    }

    window.viewSafeTeaReport = function() {
        // Switch to datecheck tab so dc-report is visible
        if (typeof switchHubTab === 'function') {
            switchHubTab('datecheck');
        }

        var reportDiv = document.getElementById('dc-report');
        if (!reportDiv) return;

        if (reportDiv.style.display === 'block') {
            reportDiv.style.display = 'none';
            return;
        }

        reportDiv.style.display = 'block';
        reportDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

        if (activeDateData) {
            // First try to fetch full report from API
            var dateId = activeDateData.id;
            if (dateId) {
                fetch('/api/dates/report?id=' + dateId, { headers: authHeaders() })
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (data && data.report) {
                            renderSafeTeaReport(data.report);
                        } else {
                            // Fallback: render from activeDateData
                            renderSafeTeaReport(activeDateData);
                        }
                    })
                    .catch(function() {
                        renderSafeTeaReport(activeDateData);
                    });
            } else {
                renderSafeTeaReport(activeDateData);
            }
        }
    };

    window.shareDateLink = function() {
        var code = activeDateData && (activeDateData.share_code || activeDateData.shareCode);
        if (!code) { if (typeof showToast === 'function') showToast('No active date link available'); return; }
        var url = 'https://www.getsafetea.app/date-status?code=' + code;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(function() { if (typeof showToast === 'function') showToast('Share link copied!'); });
        }
    };

    window.shareReportSMS = function() {
        if (!activeDateData) { if (typeof showToast === 'function') showToast('No active date to share'); return; }
        var c = activeDateData;
        var name = c.dateName || c.date_name || 'Someone';
        var venue = c.venueName || c.venue_name || '';
        var address = c.venueAddress || c.venue_address || '';
        var transport = c.transportation || '';
        var timeStr = c.scheduledTime || c.scheduled_time;
        var dateTime = timeStr ? formatDateTime(timeStr) : '';
        var code = c.shareCode || c.share_code || '';
        var trackUrl = 'https://www.getsafetea.app/date-status?code=' + code;

        var msg = 'SafeTea Report\n';
        msg += 'Meeting: ' + name + '\n';
        if (venue) msg += 'Where: ' + venue + '\n';
        if (address) msg += 'Address: ' + address + '\n';
        if (dateTime) msg += 'When: ' + dateTime + '\n';
        if (transport) msg += 'Getting there: ' + transport + '\n';
        msg += '\nTrack live: ' + trackUrl;
        msg += '\nSent via SafeTea';

        window.open('sms:?body=' + encodeURIComponent(msg), '_blank');
        if (typeof showToast === 'function') showToast('Opening messaging app...');
    };

    window.shareReportInbox = function() {
        if (!activeDateData) { if (typeof showToast === 'function') showToast('No active date to share'); return; }
        var modal = document.createElement('div');
        modal.id = 'dc-share-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:200;display:flex;align-items:center;justify-content:center';
        modal.innerHTML =
            '<div style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:24px;max-width:440px;width:90%">' +
                '<h3 style="color:#fff;margin-bottom:16px"><i class="fas fa-envelope" style="color:#E8A0B5"></i> Send Report to Inbox</h3>' +
                '<div style="margin-bottom:12px"><label style="display:block;font-size:12px;font-weight:600;color:#8080A0;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Search for a SafeTea user</label>' +
                '<input type="text" id="dc-share-search" placeholder="Search by name..." oninput="searchUsersForShare(this.value)" style="width:100%;padding:10px 12px;background:#141428;border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;font-size:14px;font-family:\'Inter\',sans-serif;outline:none"></div>' +
                '<div id="dc-share-results" style="max-height:200px;overflow-y:auto"></div>' +
                '<button onclick="document.getElementById(\'dc-share-modal\').remove()" style="margin-top:12px;width:100%;background:rgba(255,255,255,0.06);color:#8080A0;border:none;padding:10px;border-radius:10px;font-size:13px;cursor:pointer;font-family:\'Inter\',sans-serif"><i class="fas fa-times"></i> Cancel</button>' +
            '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    };

    window.searchUsersForShare = function(query) {
        var results = document.getElementById('dc-share-results');
        if (!query || query.length < 2) { results.innerHTML = '<p style="color:#8080A0;font-size:13px;text-align:center">Type at least 2 characters...</p>'; return; }
        fetch('/api/users/search?q=' + encodeURIComponent(query), { headers: authHeaders() })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data || !data.users || data.users.length === 0) {
                    results.innerHTML = '<p style="color:#8080A0;font-size:13px;text-align:center">No users found</p>';
                    return;
                }
                var html = '';
                data.users.forEach(function(u) {
                    html += '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:#1A1A2E;border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="sendReportInbox(' + u.id + ',\'' + escapeHtmlSafe(u.display_name || '') + '\')">' +
                        '<div style="width:32px;height:32px;border-radius:50%;background:#E8A0B5;display:flex;align-items:center;justify-content:center;font-weight:700;color:#1A1A2E;font-size:14px">' + (u.display_name ? u.display_name[0].toUpperCase() : '?') + '</div>' +
                        '<div><div style="color:#fff;font-weight:500;font-size:14px">' + escapeHtmlSafe(u.display_name || '') + '</div></div>' +
                        '<i class="fas fa-paper-plane" style="margin-left:auto;color:#E8A0B5"></i></div>';
                });
                results.innerHTML = html;
            })
            .catch(function() { results.innerHTML = '<p style="color:#e74c3c;font-size:13px;text-align:center">Search failed</p>'; });
    };

    window.sendReportInbox = function(userId, userName) {
        if (!activeDateData) return;
        fetch('/api/dates/report', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ checkoutId: activeDateData.id, shareMethod: 'inbox', recipientUserId: userId })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data && data.success) {
                if (typeof showToast === 'function') showToast('SafeTea Report sent to ' + userName + '\'s inbox!');
                var modal = document.getElementById('dc-share-modal');
                if (modal) modal.remove();
            } else {
                if (typeof showToast === 'function') showToast(data.error || 'Failed to send to inbox');
            }
        })
        .catch(function() { if (typeof showToast === 'function') showToast('Failed to send to inbox'); });
    };

    window.closeReport = function() {
        var report = document.getElementById('dc-report');
        if (report) report.style.display = 'none';
    };

    // Transportation details toggle
    var transportSelect = document.getElementById('dc-transportation');
    if (transportSelect) {
        transportSelect.addEventListener('change', function() {
            var wrap = document.getElementById('dc-transport-details-wrap');
            if (wrap) wrap.style.display = this.value ? 'block' : 'none';
        });
    }

    // ============ IDENTITY VERIFICATION ============
    window.startIdentityVerification = function() {
        fetch('/api/auth/verify/identity', {
            method: 'POST',
            headers: authHeaders()
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.verificationUrl) {
                window.open(data.verificationUrl, '_blank');
            } else if (data.error) {
                if (typeof showToast === 'function') showToast(data.error);
            } else {
                if (typeof showToast === 'function') showToast('Identity verification initiated. Check your email.');
            }
        })
        .catch(function() { if (typeof showToast === 'function') showToast('Verification failed. Please try again.'); });
    };

    // ============ AVATAR CUSTOMIZATION ============
    window.onAvatarTypeChange = function(type) {
        document.getElementById('custom-name-input').style.display = type === 'custom' ? 'block' : 'none';
        document.getElementById('generated-name-input').style.display = type === 'generated' ? 'block' : 'none';
        var uploadInput = document.getElementById('upload-avatar-input');
        if (uploadInput) uploadInput.style.display = type === 'upload' ? 'block' : 'none';

        if (type === 'upload') {
            var user = getUser();
            var isPaid = user && (user.subscription_tier === 'pro' || user.subscription_tier === 'premium' || user.subscription_tier === 'plus');
            var gate = document.getElementById('upload-avatar-gate');
            var form = document.getElementById('upload-avatar-form');
            if (gate) gate.style.display = isPaid ? 'none' : 'block';
            if (form) form.style.display = isPaid ? 'block' : 'none';
        }
    };

    window.generateRandomName = function() {
        fetch('/api/users/generate-avatar', { headers: { 'Authorization': 'Bearer ' + getToken() } })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var display = document.getElementById('generated-name-display');
                if (display && data.display_name) display.textContent = data.display_name;
            })
            .catch(function() {
                var names = ['TeaLover', 'SafeSipper', 'GuardianGal', 'BoldBrew', 'WatchfulEye', 'TrustedTea', 'ShieldSis'];
                var display = document.getElementById('generated-name-display');
                if (display) display.textContent = names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 99);
            });
    };

    window.handleAvatarUpload = function(event) {
        var file = event.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(e) {
            var previewImg = document.getElementById('avatar-preview-img');
            var previewDiv = document.getElementById('avatar-upload-preview');
            if (previewImg) previewImg.src = e.target.result;
            if (previewDiv) previewDiv.style.display = 'block';
        };
        reader.readAsDataURL(file);
    };

    // ============ UPGRADE / PREMIUM ============
    var upgradeInterval = 'monthly'; // default billing interval

    window.showUpgradePrompt = function() {
        // Remove existing modal if open
        var existing = document.getElementById('upgrade-modal');
        if (existing) existing.remove();

        var user = getUser();
        var currentTier = (user && user.subscription_tier || 'free').toLowerCase();

        var modal = document.createElement('div');
        modal.id = 'upgrade-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
        modal.onclick = function(e) { if (e.target === modal) modal.remove(); };

        var isYearly = upgradeInterval === 'yearly';
        var plusPrice = isYearly ? '$49.99' : '$5.99';
        var plusPer = isYearly ? '/yr' : '/mo';
        var proPrice = isYearly ? '$89.99' : '$9.99';
        var proPer = isYearly ? '/yr' : '/mo';
        var saveBadge = isYearly ? ' <span style="color:#2ecc71;font-size:11px;font-weight:600">Save 30%</span>' : '';

        var html = '<div style="background:#1A1A2E;border:1px solid rgba(255,255,255,0.1);border-radius:16px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;padding:32px 24px">';
        html += '<div style="text-align:center;margin-bottom:20px">';
        html += '<h2 style="color:#fff;font-size:22px;margin-bottom:6px">Upgrade Your SafeTea</h2>';
        html += '<p style="color:#8080A0;font-size:14px">Unlock premium safety features</p>';
        html += '</div>';

        // Billing toggle
        var moStyle = !isYearly ? 'background:#E8A0B5;color:#1A1A2E;font-weight:600' : 'background:transparent;color:#8080A0';
        var yrStyle = isYearly ? 'background:#E8A0B5;color:#1A1A2E;font-weight:600' : 'background:transparent;color:#8080A0';
        html += '<div style="display:flex;justify-content:center;margin-bottom:20px">';
        html += '<div style="display:inline-flex;background:#22223A;border-radius:10px;padding:3px;border:1px solid rgba(255,255,255,0.06)">';
        html += '<button onclick="upgradeInterval=\'monthly\';showUpgradePrompt()" style="padding:8px 20px;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;' + moStyle + '">Monthly</button>';
        html += '<button onclick="upgradeInterval=\'yearly\';showUpgradePrompt()" style="padding:8px 20px;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;' + yrStyle + '">Yearly' + (isYearly ? '' : ' <span style="color:#2ecc71;font-size:10px">Save 30%</span>') + '</button>';
        html += '</div></div>';

        // SafeTea+ card
        var plusActive = currentTier === 'plus';
        html += '<div style="background:#22223A;border:' + (plusActive ? '2px solid #E8A0B5' : '1px solid rgba(255,255,255,0.06)') + ';border-radius:12px;padding:20px;margin-bottom:12px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
        html += '<div><h3 style="color:#fff;font-size:16px;margin:0">SafeTea+ <span style="background:linear-gradient(135deg,#f27059,#E8A0B5);color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;margin-left:6px">POPULAR</span></h3></div>';
        html += '<div style="color:#fff;font-size:22px;font-weight:800">' + plusPrice + '<span style="font-size:13px;font-weight:400;color:#8080A0">' + plusPer + '</span>' + saveBadge + '</div>';
        html += '</div>';
        html += '<div style="color:#A0A0C0;font-size:13px;line-height:1.8">';
        html += '<div><i class="fas fa-check" style="color:#E8A0B5;width:16px;margin-right:6px"></i>Date Check-In/Out with SafeWalk</div>';
        html += '<div><i class="fas fa-check" style="color:#E8A0B5;width:16px;margin-right:6px"></i>SafeTea Reports & Sharing</div>';
        html += '<div><i class="fas fa-check" style="color:#E8A0B5;width:16px;margin-right:6px"></i>Name Watch Alerts</div>';
        html += '<div><i class="fas fa-check" style="color:#E8A0B5;width:16px;margin-right:6px"></i>SMS Notifications</div>';
        html += '</div>';
        if (plusActive) {
            html += '<div style="margin-top:14px;text-align:center;padding:10px;background:rgba(232,160,181,0.1);border-radius:8px;color:#E8A0B5;font-weight:600;font-size:13px"><i class="fas fa-check-circle"></i> Current Plan</div>';
        } else {
            html += '<button onclick="startCheckout(\'plus\')" style="width:100%;margin-top:14px;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#f27059,#E8A0B5);color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Upgrade to SafeTea+</button>';
        }
        html += '</div>';

        // SafeTea Pro card
        var proActive = currentTier === 'pro';
        html += '<div style="background:#22223A;border:' + (proActive ? '2px solid #9b59b6' : '1px solid rgba(255,255,255,0.06)') + ';border-radius:12px;padding:20px;margin-bottom:16px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
        html += '<div><h3 style="color:#fff;font-size:16px;margin:0">SafeTea Pro <span style="background:linear-gradient(135deg,#9b59b6,#8e44ad);color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;margin-left:6px">BEST VALUE</span></h3></div>';
        html += '<div style="color:#fff;font-size:22px;font-weight:800">' + proPrice + '<span style="font-size:13px;font-weight:400;color:#8080A0">' + proPer + '</span>' + saveBadge + '</div>';
        html += '</div>';
        html += '<div style="color:#A0A0C0;font-size:13px;line-height:1.8">';
        html += '<div><i class="fas fa-check" style="color:#9b59b6;width:16px;margin-right:6px"></i>Everything in SafeTea+</div>';
        html += '<div><i class="fas fa-check" style="color:#9b59b6;width:16px;margin-right:6px"></i>Photo Verification</div>';
        html += '<div><i class="fas fa-check" style="color:#9b59b6;width:16px;margin-right:6px"></i>Safety Resource Hub</div>';
        html += '<div><i class="fas fa-check" style="color:#9b59b6;width:16px;margin-right:6px"></i>Priority Support</div>';
        html += '</div>';
        if (proActive) {
            html += '<div style="margin-top:14px;text-align:center;padding:10px;background:rgba(155,89,182,0.1);border-radius:8px;color:#9b59b6;font-weight:600;font-size:13px"><i class="fas fa-check-circle"></i> Current Plan</div>';
        } else {
            html += '<button onclick="startCheckout(\'pro\')" style="width:100%;margin-top:14px;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#9b59b6,#8e44ad);color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Upgrade to SafeTea Pro</button>';
        }
        html += '</div>';

        // Close button
        html += '<button onclick="document.getElementById(\'upgrade-modal\').remove()" style="width:100%;padding:10px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;background:transparent;color:#8080A0;font-size:13px;cursor:pointer;font-family:inherit">Maybe Later</button>';
        html += '</div>';

        modal.innerHTML = html;
        document.body.appendChild(modal);
    };

    window.startCheckout = function(plan) {
        // Find the button that was clicked and show loading state
        var modal = document.getElementById('upgrade-modal');
        if (modal) {
            var buttons = modal.querySelectorAll('button');
            buttons.forEach(function(b) { b.disabled = true; b.style.opacity = '0.6'; });
        }

        fetch('/api/subscriptions/checkout', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ plan: plan, interval: upgradeInterval })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.url) {
                window.location.href = data.url;
            } else {
                if (typeof showToast === 'function') showToast(data.error || 'Failed to start checkout');
                if (modal) {
                    var buttons = modal.querySelectorAll('button');
                    buttons.forEach(function(b) { b.disabled = false; b.style.opacity = '1'; });
                }
            }
        })
        .catch(function() {
            if (typeof showToast === 'function') showToast('Network error — please try again');
            if (modal) {
                var buttons = modal.querySelectorAll('button');
                buttons.forEach(function(b) { b.disabled = false; b.style.opacity = '1'; });
            }
        });
    };

    // ============ INBOX / MESSAGING ============
    var currentThreadUserId = null;
    var inboxLoaded = false;

    window.openComposeModal = function() {
        var modal = document.getElementById('compose-modal');
        if (modal) modal.style.display = 'flex';
    };

    window.closeComposeModal = function() {
        var modal = document.getElementById('compose-modal');
        if (modal) modal.style.display = 'none';
    };

    var composeRecipientId = null;
    window.searchUsersForCompose = function(query) {
        var results = document.getElementById('compose-search-results');
        if (!query || query.length < 2) { results.innerHTML = ''; return; }

        fetch('/api/users/search?q=' + encodeURIComponent(query), { headers: { 'Authorization': 'Bearer ' + getToken() } })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data.users || data.users.length === 0) {
                    results.innerHTML = '<p style="color:#8080A0;font-size:12px">No users found</p>';
                    return;
                }
                var html = '';
                data.users.forEach(function(u) {
                    html += '<div onclick="selectComposeRecipient(' + u.id + ',\'' + escapeHtmlSafe(u.display_name || u.email) + '\')" style="padding:8px 12px;cursor:pointer;border-radius:6px;color:#fff;font-size:13px" onmouseover="this.style.background=\'rgba(232,160,181,0.1)\'" onmouseout="this.style.background=\'none\'">' + escapeHtmlSafe(u.display_name || u.email) + '</div>';
                });
                results.innerHTML = html;
            })
            .catch(function() { results.innerHTML = ''; });
    };

    window.selectComposeRecipient = function(id, name) {
        composeRecipientId = id;
        document.getElementById('compose-search-results').innerHTML = '';
        document.getElementById('compose-search').value = '';
        document.getElementById('compose-selected').style.display = 'block';
        document.getElementById('compose-selected-name').textContent = name;
    };

    window.clearComposeRecipient = function() {
        composeRecipientId = null;
        document.getElementById('compose-selected').style.display = 'none';
    };

    window.sendComposeMessage = function() {
        if (!composeRecipientId) { if (typeof showToast === 'function') showToast('Select a recipient'); return; }
        var body = document.getElementById('compose-body').value.trim();
        if (!body) { if (typeof showToast === 'function') showToast('Write a message'); return; }

        var btn = document.getElementById('compose-send-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'; }

        fetch('/api/messages', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ recipient_id: composeRecipientId, content: body })
        })
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
        .then(function(res) {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message'; }
            if (!res.ok) {
                if (typeof showToast === 'function') showToast(res.data.error || 'Failed to send');
                return;
            }
            if (typeof showToast === 'function') showToast('Message sent!');
            document.getElementById('compose-body').value = '';
            clearComposeRecipient();
            closeComposeModal();
            loadConversations();
            // Open the thread with the recipient
            openConversation(composeRecipientId);
        })
        .catch(function() {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message'; }
            if (typeof showToast === 'function') showToast('Network error — try again');
        });
    };

    // Load conversations list
    window.loadConversations = function() {
        var container = document.getElementById('inbox-conversations');
        if (!container) return;

        fetch('/api/messages', { headers: authHeaders() })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var convos = data.conversations || [];
                if (convos.length === 0) {
                    container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#8080A0"><i class="fas fa-envelope-open" style="font-size:32px;display:block;margin-bottom:12px;color:#E8A0B5"></i><p style="font-size:14px;margin:0">No conversations yet</p><p style="font-size:12px;margin-top:4px">Send a message to get started!</p></div>';
                    return;
                }
                var html = '';
                convos.forEach(function(c) {
                    var name = c.other_custom_name || c.other_name || 'User';
                    var initials = name.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
                    var color = c.other_avatar_color || '#E8A0B5';
                    var preview = c.last_message || '';
                    if (preview.length > 50) preview = preview.substring(0, 50) + '...';
                    var time = formatConvoTime(c.last_message_at);
                    var unread = parseInt(c.unread_count) || 0;
                    var isActive = currentThreadUserId === c.other_user_id;

                    html += '<div class="convo-item' + (isActive ? ' active' : '') + '" onclick="openConversation(' + c.other_user_id + ')">';
                    html += '<div class="convo-avatar" style="background:' + color + '">' + escapeHtmlSafe(initials) + '</div>';
                    html += '<div class="convo-info">';
                    html += '<div class="convo-name">' + escapeHtmlSafe(name);
                    if (unread > 0) html += ' <span class="convo-unread">' + unread + '</span>';
                    html += '</div>';
                    html += '<div class="convo-preview">' + escapeHtmlSafe(preview) + '</div>';
                    html += '</div>';
                    html += '<div class="convo-time">' + escapeHtmlSafe(time) + '</div>';
                    html += '</div>';
                });
                container.innerHTML = html;
            })
            .catch(function() {
                container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#8080A0"><p style="font-size:14px">Failed to load conversations</p><button onclick="loadConversations()" style="margin-top:8px;background:rgba(232,160,181,0.15);color:#E8A0B5;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px">Retry</button></div>';
            });
    };

    // Open a conversation thread
    window.openConversation = function(userId) {
        currentThreadUserId = userId;
        var thread = document.getElementById('inbox-thread');
        if (!thread) return;

        thread.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#8080A0"><i class="fas fa-spinner fa-spin" style="margin-right:8px"></i> Loading...</div>';

        // Highlight active convo
        document.querySelectorAll('.convo-item').forEach(function(el) { el.classList.remove('active'); });
        var items = document.querySelectorAll('.convo-item');
        items.forEach(function(el) {
            if (el.getAttribute('onclick') && el.getAttribute('onclick').indexOf(userId) !== -1) el.classList.add('active');
        });

        fetch('/api/messages/' + userId, { headers: authHeaders() })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var other = data.otherUser || {};
                var msgs = data.messages || [];
                var otherName = other.custom_display_name || other.display_name || 'User';
                var otherColor = other.avatar_color || '#E8A0B5';
                var otherInitials = otherName.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
                var me = getUser();
                var myId = me ? me.id : null;

                var html = '<div class="thread-header">';
                html += '<div class="convo-avatar" style="background:' + otherColor + ';width:36px;height:36px;font-size:13px">' + escapeHtmlSafe(otherInitials) + '</div>';
                html += '<div class="thread-header-name">' + escapeHtmlSafe(otherName) + '</div>';
                html += '</div>';

                html += '<div class="thread-messages" id="thread-messages">';
                if (msgs.length === 0) {
                    html += '<div style="text-align:center;color:#8080A0;padding:40px;font-size:14px">No messages yet — say hello!</div>';
                } else {
                    msgs.forEach(function(m) {
                        var isSent = m.sender_id === myId;
                        html += '<div class="msg-bubble ' + (isSent ? 'sent' : 'received') + '">';
                        html += escapeHtmlSafe(m.content);
                        html += '<div class="msg-time" style="font-size:10px;color:#8080A0;margin-top:4px">' + formatMsgTime(m.created_at) + '</div>';
                        html += '</div>';
                    });
                }
                html += '</div>';

                html += '<div class="thread-input">';
                html += '<input type="text" id="thread-reply-input" placeholder="Type a message..." onkeydown="if(event.key===\'Enter\')sendThreadReply()">';
                html += '<button onclick="sendThreadReply()"><i class="fas fa-paper-plane"></i></button>';
                html += '</div>';

                thread.innerHTML = html;

                // Scroll to bottom
                var msgContainer = document.getElementById('thread-messages');
                if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;

                // Refresh sidebar to clear unread badges
                loadConversations();
            })
            .catch(function() {
                thread.innerHTML = '<div style="text-align:center;padding:40px;color:#8080A0"><p>Failed to load messages</p><button onclick="openConversation(' + userId + ')" style="margin-top:8px;background:rgba(232,160,181,0.15);color:#E8A0B5;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px">Retry</button></div>';
            });
    };

    // Send reply in thread
    window.sendThreadReply = function() {
        if (!currentThreadUserId) return;
        var input = document.getElementById('thread-reply-input');
        if (!input) return;
        var content = input.value.trim();
        if (!content) return;

        input.disabled = true;

        fetch('/api/messages', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ recipient_id: currentThreadUserId, content: content })
        })
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
        .then(function(res) {
            input.disabled = false;
            if (!res.ok) {
                if (typeof showToast === 'function') showToast(res.data.error || 'Failed to send');
                return;
            }
            input.value = '';
            // Append the new message to the thread
            var msgContainer = document.getElementById('thread-messages');
            if (msgContainer) {
                var div = document.createElement('div');
                div.className = 'msg-bubble sent';
                div.innerHTML = escapeHtmlSafe(content) + '<div class="msg-time" style="font-size:10px;color:#8080A0;margin-top:4px">Just now</div>';
                msgContainer.appendChild(div);
                msgContainer.scrollTop = msgContainer.scrollHeight;
            }
            // Refresh conversation list
            loadConversations();
        })
        .catch(function() {
            input.disabled = false;
            if (typeof showToast === 'function') showToast('Network error — try again');
        });
    };

    // Update unread badge in nav
    window.updateInboxBadge = function() {
        fetch('/api/messages/unread/count', { headers: authHeaders() })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var count = data.unread || 0;
                var badge = document.getElementById('inbox-badge');
                if (badge) {
                    badge.textContent = count;
                    badge.style.display = count > 0 ? 'inline-block' : 'none';
                }
            })
            .catch(function() {});
    };

    // Time formatting helpers
    function formatConvoTime(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        var now = new Date();
        var diff = now - d;
        if (diff < 60000) return 'now';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
        if (diff < 604800000) return Math.floor(diff / 86400000) + 'd';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    function formatMsgTime(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    // ============ SAVE AVATAR ============
    window.saveAvatar = function() {
        var type = document.querySelector('input[name="avatar-type"]:checked');
        if (!type) return;
        var avatarType = type.value;

        var payload = { avatar_type: avatarType };

        if (avatarType === 'custom') {
            var customName = document.getElementById('edit-custom-name').value.trim();
            if (!customName) { if (typeof showToast === 'function') showToast('Enter a custom display name'); return; }
            payload.custom_display_name = customName;
        } else if (avatarType === 'generated') {
            var genName = document.getElementById('generated-name-display').textContent;
            if (!genName || genName === 'Click generate...') { if (typeof showToast === 'function') showToast('Generate a name first'); return; }
            payload.custom_display_name = genName;
        } else if (avatarType === 'upload') {
            var previewImg = document.getElementById('avatar-preview-img');
            if (previewImg && previewImg.src && previewImg.src.startsWith('data:')) {
                payload.avatar_url = previewImg.src;
            }
        }

        // Get selected color
        var activeColor = document.querySelector('.color-swatch.active');
        if (activeColor) payload.avatar_color = activeColor.getAttribute('data-color');

        fetch('/api/users/profile', {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify(payload)
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.user) {
                localStorage.setItem(USER_KEY, JSON.stringify(data.user));
                renderProfile(data.user);
                if (typeof showToast === 'function') showToast('Avatar saved!');
            } else if (data.error) {
                if (typeof showToast === 'function') showToast(data.error);
            }
        })
        .catch(function() { if (typeof showToast === 'function') showToast('Failed to save avatar'); });
    };

    // ============ SAVE PROFILE ============
    window.saveProfile = function() {
        var name = document.getElementById('edit-name').value.trim();
        var city = document.getElementById('edit-city').value.trim();
        var bio = document.getElementById('edit-bio').value.trim();

        var payload = {};
        if (name) payload.display_name = name;
        if (city) payload.city = city;
        if (bio !== undefined) payload.bio = bio;

        if (Object.keys(payload).length === 0) {
            if (typeof showToast === 'function') showToast('No changes to save');
            return;
        }

        fetch('/api/users/profile', {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify(payload)
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.user) {
                localStorage.setItem(USER_KEY, JSON.stringify(data.user));
                renderProfile(data.user);
                if (typeof showToast === 'function') showToast('Profile saved!');
            } else if (data.error) {
                if (typeof showToast === 'function') showToast(data.error);
            }
        })
        .catch(function() { if (typeof showToast === 'function') showToast('Failed to save profile'); });
    };

    // ============ CHANGE PASSWORD ============
    window.changePassword = function() {
        var current = document.getElementById('current-password').value;
        var newPw = document.getElementById('new-password').value;
        var confirm = document.getElementById('confirm-password').value;

        if (!current || !newPw) { if (typeof showToast === 'function') showToast('Fill in all password fields'); return; }
        if (newPw.length < 8) { if (typeof showToast === 'function') showToast('New password must be at least 8 characters'); return; }
        if (newPw !== confirm) { if (typeof showToast === 'function') showToast('Passwords do not match'); return; }

        fetch('/api/auth/change-password', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ currentPassword: current, newPassword: newPw })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                if (typeof showToast === 'function') showToast('Password updated!');
                document.getElementById('current-password').value = '';
                document.getElementById('new-password').value = '';
                document.getElementById('confirm-password').value = '';
            } else {
                if (typeof showToast === 'function') showToast(data.error || 'Failed to change password');
            }
        })
        .catch(function() { if (typeof showToast === 'function') showToast('Failed to change password'); });
    };

    // ============ ALERTS TAB — GEO ALERTS ============
    var tabAlertLat = null;
    var tabAlertLon = null;

    window.detectTabLocation = function() {
        var loading = document.getElementById('tab-alerts-loading');
        var prompt = document.getElementById('tab-alerts-prompt');
        if (loading) loading.style.display = 'block';
        if (prompt) prompt.style.display = 'none';

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function(pos) {
                    tabAlertLat = pos.coords.latitude;
                    tabAlertLon = pos.coords.longitude;
                    fetchTabAlerts();
                },
                function() {
                    if (loading) loading.style.display = 'none';
                    if (prompt) prompt.style.display = 'block';
                    if (typeof showToast === 'function') showToast('Location access denied. Enable it in your browser settings.');
                },
                { timeout: 10000 }
            );
        } else {
            if (loading) loading.style.display = 'none';
            if (prompt) prompt.style.display = 'block';
            if (typeof showToast === 'function') showToast('Geolocation not supported by your browser');
        }
    };

    window.refreshTabAlerts = function() {
        if (tabAlertLat && tabAlertLon) fetchTabAlerts();
    };

    function fetchTabAlerts() {
        var loading = document.getElementById('tab-alerts-loading');
        var summaryEl = document.getElementById('tab-alerts-summary');
        var listEl = document.getElementById('tab-alerts-list');
        var emptyEl = document.getElementById('tab-alerts-empty');
        var promptEl = document.getElementById('tab-alerts-prompt');

        if (loading) loading.style.display = 'block';
        if (summaryEl) summaryEl.style.display = 'none';
        if (listEl) listEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'none';
        if (promptEl) promptEl.style.display = 'none';

        var radius = document.getElementById('tab-alert-radius');
        var days = document.getElementById('tab-alert-days');
        var r = radius ? radius.value : '2';
        var d = days ? days.value : '30';

        fetch('/api/alerts/area?lat=' + tabAlertLat + '&lon=' + tabAlertLon + '&radius=' + r + '&days=' + d + '&limit=30', {
            headers: { 'Authorization': 'Bearer ' + getToken() }
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (loading) loading.style.display = 'none';

            if (!data.alerts || data.alerts.length === 0) {
                if (emptyEl) emptyEl.style.display = 'block';
                return;
            }

            if (summaryEl) {
                summaryEl.style.display = 'block';
                summaryEl.innerHTML = '<div style="background:rgba(232,160,181,0.08);border:1px solid rgba(232,160,181,0.15);border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:14px;color:#F0D0C0">' +
                    '<strong>' + data.total + '</strong> safety incident' + (data.total !== 1 ? 's' : '') +
                    ' within <strong>' + data.radius_miles + ' mi</strong> in the last <strong>' + data.days_back + ' days</strong></div>';
            }

            if (listEl) {
                listEl.style.display = 'block';
                var html = '';
                data.alerts.forEach(function(alert) {
                    var cat = CATEGORY_MAP[alert.crime_type] || { label: alert.crime_type, severity: 'medium', icon: '\u26A0\uFE0F' };
                    var dist = parseFloat(alert.distance_miles).toFixed(2);
                    var timeAgo = getTimeAgoFromDate(alert.occurred_at);
                    var sevStyle = cat.severity === 'high' ? 'border-left:3px solid #e74c3c' : 'border-left:3px solid #f1c40f';
                    html += '<div style="background:#1A1A2E;border-radius:8px;padding:12px 16px;margin-bottom:8px;' + sevStyle + '">';
                    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
                    html += '<span style="font-size:16px">' + cat.icon + '</span>';
                    html += '<strong style="color:#fff;font-size:14px">' + escapeHtmlSafe(cat.label) + '</strong>';
                    html += '<span style="margin-left:auto;color:#8080A0;font-size:12px">' + dist + ' mi away</span>';
                    html += '</div>';
                    html += '<div style="color:#8080A0;font-size:12px">' + timeAgo;
                    if (alert.description) html += ' — ' + escapeHtmlSafe(alert.description.substring(0, 100));
                    html += '</div></div>';
                });
                listEl.innerHTML = html;
            }
        })
        .catch(function() {
            if (loading) loading.style.display = 'none';
            if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.innerHTML = '<p style="color:#8080A0;text-align:center;padding:16px">Unable to load alerts. Please try again.</p>'; }
        });
    }

    // ============ COLOR SWATCHES ============
    (function initColorSwatches() {
        var container = document.getElementById('color-swatches');
        if (!container) return;
        var colors = ['#E8A0B5', '#C77DBA', '#9B59B6', '#3498DB', '#1ABC9C', '#2ECC71', '#F39C12', '#E74C3C', '#6C7B95', '#D35400'];
        var user = getUser();
        var current = (user && user.avatar_color) || '#E8A0B5';
        colors.forEach(function(c) {
            var el = document.createElement('div');
            el.className = 'color-swatch' + (c === current ? ' active' : '');
            el.setAttribute('data-color', c);
            el.style.cssText = 'width:32px;height:32px;border-radius:50%;background:' + c + ';cursor:pointer;border:3px solid ' + (c === current ? '#fff' : 'transparent') + ';display:inline-block;margin-right:8px';
            el.onclick = function() {
                container.querySelectorAll('.color-swatch').forEach(function(s) { s.classList.remove('active'); s.style.borderColor = 'transparent'; });
                el.classList.add('active');
                el.style.borderColor = '#fff';
            };
            container.appendChild(el);
        });
    })();

    // ==================== NAME WATCH ====================
    window.initNameWatch = function() {
        var user = getUser();
        var tier = (user && user.subscription_tier || 'free').toLowerCase();
        var wall = document.getElementById('nw-upgrade-wall');
        var content = document.getElementById('nw-content');

        if (tier === 'free') {
            if (wall) wall.style.display = 'block';
            if (content) content.style.display = 'none';
        } else {
            if (wall) wall.style.display = 'none';
            if (content) content.style.display = 'block';
            loadWatchedNames();
        }
    };

    function loadWatchedNames() {
        fetch('/api/namewatch', { headers: authHeaders() })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var list = document.getElementById('nw-list');
                if (!list) return;
                if (!data || !data.names || data.names.length === 0) {
                    list.innerHTML = '<div style="text-align:center;padding:20px;color:#8080A0"><i class="fas fa-eye-slash" style="font-size:24px;display:block;margin-bottom:8px"></i>No names being watched yet. Add one above.</div>';
                    return;
                }
                var h = '';
                data.names.forEach(function(n) {
                    h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-bottom:8px">';
                    h += '<div><i class="fas fa-eye" style="color:#E8A0B5;margin-right:8px"></i><strong style="color:#fff">' + escapeHtmlSafe(n.name) + '</strong>';
                    h += '<span style="color:#8080A0;font-size:12px;margin-left:8px">' + (n.match_count || 0) + ' mentions</span></div>';
                    h += '<button onclick="removeWatchedName(' + n.id + ')" style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:14px;padding:4px 8px"><i class="fas fa-trash"></i></button>';
                    h += '</div>';
                });
                list.innerHTML = h;

                // Load matches
                if (data.matches && data.matches.length > 0) {
                    var mh = '<h4 style="color:#fff;margin-bottom:12px"><i class="fas fa-bell" style="color:#E8A0B5"></i> Recent Mentions</h4>';
                    data.matches.forEach(function(m) {
                        mh += '<div style="padding:10px 14px;background:rgba(232,160,181,0.06);border:1px solid rgba(232,160,181,0.15);border-radius:8px;margin-bottom:6px;font-size:13px">';
                        mh += '<strong style="color:#E8A0B5">' + escapeHtmlSafe(m.matched_name) + '</strong>';
                        mh += '<span style="color:#8080A0"> mentioned in a post</span>';
                        mh += '<span style="color:#555;font-size:11px;display:block;margin-top:2px">' + new Date(m.created_at).toLocaleString() + '</span>';
                        mh += '</div>';
                    });
                    var matchDiv = document.getElementById('nw-matches');
                    if (matchDiv) matchDiv.innerHTML = mh;
                }
            }).catch(function() {});
    }

    window.addWatchedName = function() {
        var input = document.getElementById('nw-input');
        var name = input.value.trim();
        if (!name) { showToast('Enter a name to watch', true); return; }
        if (name.length < 2) { showToast('Name must be at least 2 characters', true); return; }

        fetch('/api/namewatch', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ name: name })
        }).then(function(r) { return r.json(); })
          .then(function(data) {
              if (data && data.success) {
                  showToast('Now watching "' + name + '"');
                  input.value = '';
                  loadWatchedNames();
              } else {
                  showToast(data.error || 'Failed to add name', true);
              }
          }).catch(function() { showToast('Failed to add name', true); });
    };

    window.removeWatchedName = function(id) {
        if (!confirm('Stop watching this name?')) return;
        fetch('/api/namewatch', {
            method: 'DELETE',
            headers: authHeaders(),
            body: JSON.stringify({ id: id })
        }).then(function(r) { return r.json(); })
          .then(function(data) {
              if (data && data.success) {
                  showToast('Name removed');
                  loadWatchedNames();
              } else {
                  showToast(data.error || 'Failed to remove', true);
              }
          }).catch(function() { showToast('Failed to remove name', true); });
    };

    // ============ INIT ============
    loadProfile();
    loadVerificationStatus();
    loadWatchZones();
    initAlertsTab();
    updateInboxBadge();

    // Handle Stripe checkout success redirect
    (function checkUpgradeSuccess() {
        var params = new URLSearchParams(window.location.search);
        if (params.get('upgrade') === 'success') {
            // Refresh user data from server to get updated tier
            fetch('/api/auth/me', { headers: authHeaders() })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data && (data.user || data.id)) {
                        var u = data.user || data;
                        localStorage.setItem('safetea_user', JSON.stringify(u));
                    }
                })
                .catch(function() {});
            if (typeof showToast === 'function') {
                setTimeout(function() { showToast('Welcome to your upgraded SafeTea! All premium features are now unlocked.'); }, 500);
            }
            // Clean URL
            window.history.replaceState({}, '', '/dashboard.html' + (params.get('tab') ? '?tab=' + params.get('tab') : ''));
        }
    })();

})();

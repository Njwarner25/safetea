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

    // ============ SUSPENSION/BAN CHECK ============
    if (token) {
        fetch('/api/moderation/status', { headers: { 'Authorization': 'Bearer ' + token } })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.status === 'suspended' || data.status === 'banned') {
                    showSuspensionScreen(data);
                }
            })
            .catch(function() {});
    }

    function showSuspensionScreen(data) {
        var isPermanent = data.status === 'banned';
        var overlay = document.createElement('div');
        overlay.id = 'suspension-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#1A1A2E;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';

        var endsText = '';
        if (!isPermanent && data.days_remaining !== null) {
            endsText = '<p style="color:#8080A0;margin:8px 0 0;">Suspension ends: ' +
                new Date(data.ends_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) +
                ' (' + data.days_remaining + ' day' + (data.days_remaining !== 1 ? 's' : '') + ' remaining)</p>';
        }

        var appealHtml = '';
        if (data.can_appeal) {
            appealHtml = '<button onclick="openAppealForm(' + data.violation_id + ')" style="display:block;width:100%;padding:14px;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;margin-top:20px;font-family:Inter,sans-serif;">Appeal This Decision</button>';
        } else if (data.appeal_status === 'denied') {
            appealHtml = '<p style="color:#e74c3c;font-size:13px;margin-top:16px;">Your appeal has been reviewed and denied. This decision is final.</p>';
        } else if (data.appeal_status === 'pending') {
            appealHtml = '<p style="color:#E8A0B5;font-size:13px;margin-top:16px;">Your appeal is being reviewed.</p>';
        }

        overlay.innerHTML = '<div style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:20px;padding:40px 32px;max-width:440px;width:100%;text-align:center;">' +
            '<div style="font-size:48px;margin-bottom:16px;">' + (isPermanent ? '🚫' : '⏸️') + '</div>' +
            '<h2 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 12px;">' +
                (isPermanent ? 'Account Permanently Banned' : 'Account Suspended') + '</h2>' +
            '<p style="color:#F0D0C0;font-size:15px;margin:0 0 16px;">Your SafeTea account has been ' +
                (isPermanent ? 'permanently banned' : 'suspended for 30 days') +
                ' for violating community guidelines.</p>' +
            '<div style="background:rgba(231,76,60,0.1);border:1px solid rgba(231,76,60,0.2);border-radius:10px;padding:16px;margin:16px 0;text-align:left;">' +
                '<p style="color:#e74c3c;font-weight:600;font-size:13px;margin:0 0 6px;">Reason:</p>' +
                '<p style="color:#ccc;font-size:14px;margin:0;">' + (data.reason || 'Violation of community guidelines') + '</p>' +
            '</div>' +
            endsText +
            (data.can_appeal ? '<p style="color:#8080A0;font-size:13px;margin-top:12px;">You may appeal this decision within 7 days.</p>' : '') +
            appealHtml +
            '<button onclick="localStorage.clear();window.location.href=\'/login\'" style="display:block;width:100%;padding:12px;background:transparent;color:#8080A0;border:1px solid rgba(255,255,255,0.1);border-radius:10px;font-size:14px;cursor:pointer;margin-top:12px;font-family:Inter,sans-serif;">Log Out</button>' +
        '</div>' +
        '<div id="appeal-form-container" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;align-items:center;justify-content:center;padding:24px;">' +
            '<div style="background:#22223A;border-radius:20px;padding:32px 28px;max-width:440px;width:100%;">' +
                '<h3 style="color:#fff;font-size:18px;margin:0 0 12px;">Appeal Your ' + (isPermanent ? 'Ban' : 'Suspension') + '</h3>' +
                '<p style="color:#8080A0;font-size:13px;margin:0 0 16px;">Explain why you believe this decision should be reversed. You may only submit one appeal.</p>' +
                '<textarea id="appeal-text" maxlength="1000" placeholder="Write your appeal..." style="width:100%;height:120px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;padding:14px;font-size:14px;font-family:Inter,sans-serif;resize:none;box-sizing:border-box;"></textarea>' +
                '<p style="color:#666;font-size:12px;margin:4px 0 16px;text-align:right;"><span id="appeal-char-count">0</span>/1000</p>' +
                '<div style="display:flex;gap:12px;">' +
                    '<button onclick="closeAppealForm()" style="flex:1;padding:12px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;background:transparent;color:#ccc;font-size:14px;cursor:pointer;font-family:Inter,sans-serif;">Cancel</button>' +
                    '<button id="submit-appeal-btn" onclick="submitAppeal()" style="flex:1;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;">Submit Appeal</button>' +
                '</div>' +
                '<p id="appeal-msg" style="font-size:13px;margin:12px 0 0;text-align:center;display:none;"></p>' +
            '</div>' +
        '</div>';

        document.body.appendChild(overlay);
    }

    window._appealViolationId = null;

    window.openAppealForm = function(violationId) {
        window._appealViolationId = violationId;
        var container = document.getElementById('appeal-form-container');
        if (container) container.style.display = 'flex';
        var textarea = document.getElementById('appeal-text');
        if (textarea) {
            textarea.oninput = function() {
                var ct = document.getElementById('appeal-char-count');
                if (ct) ct.textContent = textarea.value.length;
            };
        }
    };

    window.closeAppealForm = function() {
        var container = document.getElementById('appeal-form-container');
        if (container) container.style.display = 'none';
    };

    window.submitAppeal = function() {
        var text = document.getElementById('appeal-text').value.trim();
        var msg = document.getElementById('appeal-msg');
        var btn = document.getElementById('submit-appeal-btn');

        if (!text || text.length < 10) {
            msg.textContent = 'Please write at least 10 characters.';
            msg.style.color = '#e74c3c';
            msg.style.display = 'block';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Submitting...';

        fetch('/api/moderation/appeal', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ violation_id: window._appealViolationId, text: text })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            btn.disabled = false;
            btn.textContent = 'Submit Appeal';
            if (data.success) {
                if (data.appeal.status === 'approved') {
                    msg.textContent = 'Appeal approved! Your account has been reinstated.';
                    msg.style.color = '#2ecc71';
                    msg.style.display = 'block';
                    setTimeout(function() { window.location.reload(); }, 2000);
                } else {
                    msg.textContent = 'Appeal denied: ' + (data.appeal.reason || 'The original decision stands.');
                    msg.style.color = '#e74c3c';
                    msg.style.display = 'block';
                }
            } else {
                msg.textContent = data.error || 'Failed to submit appeal.';
                msg.style.color = '#e74c3c';
                msg.style.display = 'block';
            }
        })
        .catch(function() {
            btn.disabled = false;
            btn.textContent = 'Submit Appeal';
            msg.textContent = 'Network error. Try again.';
            msg.style.color = '#e74c3c';
            msg.style.display = 'block';
        });
    };

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

        // Home upgrade card — show only for free users
        var upgradeCard = document.getElementById('home-upgrade-card');
        if (upgradeCard) upgradeCard.style.display = isPaid ? 'none' : 'block';

        // User avatar in nav
        var navAvatar = document.querySelector('.user-avatar');
        if (navAvatar) {
            navAvatar.textContent = initial;
            if (user.avatar_color) navAvatar.style.background = user.avatar_color;
        }

        // Show admin panel link for admin/moderator users
        var adminLink = document.getElementById('admin-link');
        if (adminLink) {
            adminLink.style.display = (user.role === 'admin' || user.role === 'moderator') ? 'inline-block' : 'none';
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
                    updateVerifyStep('didit', data.steps.didit);
                    updateVerifyStep('phone', data.steps.phone);
                }

                // Social media status
                var socialStatus = document.getElementById('verify-social-status');
                var socialStep = document.getElementById('verify-step-social');
                var socialIcon = socialStep ? socialStep.querySelector('.verify-icon') : null;
                if (socialStatus) {
                    // We don't have social count from status endpoint, show generic
                    socialStatus.textContent = 'Link accounts on verify page';
                    socialStatus.style.color = '#8080A0';
                }

                // Trust score display
                var trustEl = document.getElementById('dash-trust-score');
                var trustVal = document.getElementById('dash-trust-value');
                var trustBar = document.getElementById('dash-trust-bar');
                if (trustEl && typeof data.trustScore !== 'undefined') {
                    trustEl.style.display = 'block';
                    var score = data.trustScore || 0;
                    if (trustVal) {
                        trustVal.textContent = score;
                        trustVal.style.color = score >= 70 ? '#2ecc71' : score >= 40 ? '#f1c40f' : '#e74c3c';
                    }
                    if (trustBar) trustBar.style.width = Math.min(100, score) + '%';
                }

                var banner = document.getElementById('verification-banner');
                if (banner && data.verified && data.diditVerified) {
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
                setVerifyStatus('didit', 'Unable to check');
                setVerifyStatus('phone', 'Unable to check');
                setVerifyStatus('social', 'Unable to check');
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

    // ============ PHOTO VERIFICATION (Enhanced Multi-Photo) ============
    var pvPhotos = [null, null, null, null]; // Up to 4 base64 data URLs
    var pvActiveSlot = 0;

    window.pvAddPhoto = function(slot) {
        pvActiveSlot = slot;
        document.getElementById('pv-file-input').click();
    };

    window.pvHandleFile = function(input) {
        var file = input.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { if (typeof showToast === 'function') showToast('Photo must be under 10MB'); return; }

        var reader = new FileReader();
        reader.onload = function(e) {
            pvPhotos[pvActiveSlot] = e.target.result;
            pvRenderGrid();
        };
        reader.readAsDataURL(file);
        input.value = '';
    };

    window.pvRemovePhoto = function(slot, ev) {
        ev.stopPropagation();
        pvPhotos[slot] = null;
        pvRenderGrid();
    };

    function pvRenderGrid() {
        var grid = document.getElementById('pv-photo-grid');
        if (!grid) return;
        var slots = grid.querySelectorAll('.pv-slot');
        var count = 0;
        for (var i = 0; i < 4; i++) {
            var slot = slots[i];
            if (pvPhotos[i]) {
                count++;
                slot.innerHTML = '<img src="' + pvPhotos[i] + '" style="width:100%;height:100%;object-fit:cover;border-radius:10px">' +
                    '<div onclick="pvRemovePhoto(' + i + ', event)" style="position:absolute;top:4px;right:4px;width:22px;height:22px;background:rgba(0,0,0,0.7);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;font-size:12px">&times;</div>';
                slot.style.border = '2px solid rgba(232,160,181,0.4)';
            } else {
                slot.innerHTML = '<i class="fas fa-plus" style="font-size:22px;color:rgba(232,160,181,' + (count > 0 || i === 0 ? '1' : '0.4') + ')"></i><span style="font-size:10px;color:#8080A0;margin-top:4px">Add</span>';
                slot.style.border = '2px dashed rgba(232,160,181,' + (i === 0 ? '0.3' : '0.15') + ')';
            }
        }
        var btn = document.getElementById('pv-analyze-btn');
        if (btn) btn.disabled = count === 0;
    }

    function pvUpdateStep(stepId, status) {
        var el = document.getElementById(stepId);
        if (!el) return;
        if (status === 'done') {
            el.style.color = '#2ecc71';
            el.querySelector('i').className = 'fas fa-check-circle';
        } else if (status === 'active') {
            el.style.color = '#E8A0B5';
            el.querySelector('i').className = 'fas fa-spinner fa-spin';
        } else if (status === 'skip') {
            el.style.color = '#555';
            el.querySelector('i').className = 'fas fa-minus-circle';
        }
    }

    window.runPhotoVerification = function() {
        var images = [];
        for (var i = 0; i < 4; i++) {
            if (pvPhotos[i]) images.push(pvPhotos[i]);
        }
        if (images.length === 0) { if (typeof showToast === 'function') showToast('Upload at least one photo'); return; }

        // Show progress
        document.getElementById('pv-upload-section').style.display = 'none';
        document.getElementById('pv-progress-section').style.display = 'block';
        document.getElementById('pv-report-section').style.display = 'none';
        document.getElementById('pv-progress-bar').style.width = '10%';

        // Reset steps
        ['pv-step-ai', 'pv-step-consistency', 'pv-step-screenshot', 'pv-step-report'].forEach(function(s) {
            var el = document.getElementById(s);
            if (el) { el.style.color = '#555'; el.querySelector('i').className = 'fas fa-circle'; el.querySelector('i').style.fontSize = '8px'; }
        });

        pvUpdateStep('pv-step-ai', 'active');

        // Animate progress during API call
        var progress = 10;
        var progressInterval = setInterval(function() {
            progress = Math.min(progress + 3, 85);
            document.getElementById('pv-progress-bar').style.width = progress + '%';
            if (progress >= 25 && progress < 30) pvUpdateStep('pv-step-ai', 'done');
            if (progress >= 30 && progress < 35) pvUpdateStep('pv-step-consistency', 'active');
            if (progress >= 50 && progress < 55) pvUpdateStep('pv-step-consistency', 'done');
            if (progress >= 55 && progress < 60) pvUpdateStep('pv-step-screenshot', 'active');
            if (progress >= 70 && progress < 75) pvUpdateStep('pv-step-screenshot', 'done');
            if (progress >= 75 && progress < 80) pvUpdateStep('pv-step-report', 'active');
        }, 500);

        fetch('/api/photos/verify', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ images: images })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            clearInterval(progressInterval);
            document.getElementById('pv-progress-bar').style.width = '100%';
            pvUpdateStep('pv-step-ai', 'done');
            pvUpdateStep('pv-step-consistency', images.length >= 2 ? 'done' : 'skip');
            pvUpdateStep('pv-step-screenshot', 'done');
            pvUpdateStep('pv-step-report', 'done');

            setTimeout(function() {
                document.getElementById('pv-progress-section').style.display = 'none';
                if (data.error) {
                    if (data.upgrade) {
                        pvShowUpgrade();
                    } else {
                        pvShowError(data.error);
                    }
                } else {
                    pvShowReport(data);
                }
            }, 800);
        })
        .catch(function(err) {
            clearInterval(progressInterval);
            document.getElementById('pv-progress-section').style.display = 'none';
            pvShowError('Analysis failed. Please try again.');
        });
    };

    function pvShowUpgrade() {
        var section = document.getElementById('pv-report-section');
        section.style.display = 'block';
        section.innerHTML = '<div style="text-align:center;padding:40px 20px;background:#22223A;border-radius:12px;border:1px solid rgba(232,160,181,0.15)">' +
            '<i class="fas fa-lock" style="font-size:36px;color:#E8A0B5;display:block;margin-bottom:16px"></i>' +
            '<h3 style="color:#fff;margin-bottom:8px">SafeTea+ Required</h3>' +
            '<p style="color:#8080A0;font-size:14px;margin-bottom:20px">Photo Verification is available with SafeTea+ ($7.99/mo)</p>' +
            '<button onclick="switchTab(\'settings\')" style="background:linear-gradient(135deg,#E8A0B5,#9b59b6);color:#fff;border:none;padding:12px 32px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer">Upgrade to SafeTea+</button>' +
            '<br><button onclick="pvReset()" style="background:none;border:none;color:#8080A0;margin-top:12px;cursor:pointer;font-size:13px">Go Back</button></div>';
    }

    function pvShowError(msg) {
        var section = document.getElementById('pv-report-section');
        section.style.display = 'block';
        section.innerHTML = '<div style="text-align:center;padding:30px;background:#22223A;border-radius:12px;border:1px solid rgba(231,76,60,0.2)">' +
            '<i class="fas fa-exclamation-circle" style="font-size:28px;color:#e74c3c;margin-bottom:12px;display:block"></i>' +
            '<p style="color:#FF6B6B;font-size:14px">' + escapeHtmlSafe(msg) + '</p>' +
            '<button onclick="pvReset()" style="background:#E8A0B5;color:#fff;border:none;padding:10px 24px;border-radius:8px;margin-top:12px;cursor:pointer;font-size:13px;font-weight:500">Try Again</button></div>';
    }

    function pvShowReport(data) {
        var section = document.getElementById('pv-report-section');
        section.style.display = 'block';

        var riskConfig = {
            low: { emoji: '🟢', label: 'LOW RISK', color: '#2ecc71', bg: 'rgba(46,204,113,0.08)', border: 'rgba(46,204,113,0.3)' },
            moderate: { emoji: '🟡', label: 'MODERATE RISK', color: '#f1c40f', bg: 'rgba(241,196,15,0.08)', border: 'rgba(241,196,15,0.3)' },
            high: { emoji: '🔴', label: 'HIGH RISK', color: '#e74c3c', bg: 'rgba(231,76,60,0.08)', border: 'rgba(231,76,60,0.3)' }
        };
        var rc = riskConfig[data.overallRisk] || riskConfig.low;

        var html = '';

        // Overall risk header
        html += '<div style="text-align:center;padding:24px;background:' + rc.bg + ';border:1px solid ' + rc.border + ';border-radius:14px;margin-bottom:20px">';
        html += '<div style="font-size:14px;color:#8080A0;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Verification Report</div>';
        html += '<div style="font-size:28px;margin-bottom:4px">' + rc.emoji + '</div>';
        html += '<div style="font-size:20px;font-weight:800;color:' + rc.color + '">' + rc.label + '</div>';
        html += '</div>';

        // Layer 1: AI Generation
        var aiLayer = data.layers && data.layers.aiGeneration;
        if (aiLayer && aiLayer.length > 0) {
            html += '<div style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;margin-bottom:12px">';
            html += '<h4 style="color:#fff;font-size:14px;margin-bottom:10px">🤖 AI Generation Check</h4>';
            for (var a = 0; a < aiLayer.length; a++) {
                var ai = aiLayer[a];
                if (ai.error) {
                    html += '<p style="color:#8080A0;font-size:13px">Photo ' + (a + 1) + ': Analysis unavailable</p>';
                    continue;
                }
                var aiIcon = ai.likelyAIGenerated ? '🔴' : (ai.filterDetected && ai.filterType !== 'none') ? '⚠️' : '✅';
                var aiColor = ai.likelyAIGenerated ? '#e74c3c' : (ai.filterDetected && ai.filterType !== 'none') ? '#f1c40f' : '#2ecc71';
                if (aiLayer.length > 1) html += '<div style="font-size:11px;color:#555;margin-bottom:2px">Photo ' + (a + 1) + '</div>';
                html += '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">';
                html += '<span>' + aiIcon + '</span>';
                html += '<div><span style="color:' + aiColor + ';font-weight:600;font-size:13px">' + escapeHtmlSafe(ai.summary || 'Analysis complete') + '</span>';
                if (ai.confidence) html += '<span style="color:#555;font-size:11px;margin-left:6px">(' + Math.round(ai.confidence * 100) + '% confidence)</span>';
                if (ai.artifactsFound && ai.artifactsFound.length > 0) {
                    html += '<div style="margin-top:4px">';
                    ai.artifactsFound.forEach(function(art) {
                        html += '<div style="color:#8080A0;font-size:12px">• ' + escapeHtmlSafe(art) + '</div>';
                    });
                    html += '</div>';
                }
                html += '</div></div>';
            }
            html += '</div>';
        }

        // Layer 2: Consistency
        var conLayer = data.layers && data.layers.consistency;
        if (conLayer && !conLayer.skipped) {
            html += '<div style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;margin-bottom:12px">';
            html += '<h4 style="color:#fff;font-size:14px;margin-bottom:10px">👤 Consistency Check</h4>';
            if (conLayer.error) {
                html += '<p style="color:#8080A0;font-size:13px">Consistency analysis unavailable</p>';
            } else {
                var conIcon = conLayer.samePerson === true ? '✅' : conLayer.samePerson === false ? '🔴' : '⚠️';
                var conColor = conLayer.samePerson === true ? '#2ecc71' : conLayer.samePerson === false ? '#e74c3c' : '#f1c40f';
                html += '<div style="display:flex;align-items:flex-start;gap:8px">';
                html += '<span>' + conIcon + '</span>';
                html += '<div><span style="color:' + conColor + ';font-weight:600;font-size:13px">' + escapeHtmlSafe(conLayer.summary || '') + '</span>';
                if (conLayer.confidence) html += '<span style="color:#555;font-size:11px;margin-left:6px">(' + Math.round(conLayer.confidence * 100) + '% confidence)</span>';
                if (conLayer.discrepancies && conLayer.discrepancies.length > 0) {
                    html += '<div style="margin-top:6px">';
                    conLayer.discrepancies.forEach(function(d) { html += '<div style="color:#8080A0;font-size:12px">• ' + escapeHtmlSafe(d) + '</div>'; });
                    html += '</div>';
                }
                if (conLayer.matchingFeatures && conLayer.matchingFeatures.length > 0) {
                    html += '<div style="margin-top:4px;color:#555;font-size:11px">Matching: ' + conLayer.matchingFeatures.map(function(f) { return escapeHtmlSafe(f); }).join(', ') + '</div>';
                }
                html += '</div></div>';
            }
            html += '</div>';
        } else if (conLayer && conLayer.skipped) {
            html += '<div style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;margin-bottom:12px">';
            html += '<h4 style="color:#fff;font-size:14px;margin-bottom:6px">👤 Consistency Check</h4>';
            html += '<p style="color:#555;font-size:13px">Upload 2+ photos to compare facial consistency</p></div>';
        }

        // Layer 3: Screenshot Analysis
        var ssLayer = data.layers && data.layers.screenshot;
        if (ssLayer && ssLayer.length > 0) {
            html += '<div style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;margin-bottom:12px">';
            html += '<h4 style="color:#fff;font-size:14px;margin-bottom:10px">📱 Screenshot Analysis</h4>';
            for (var s = 0; s < ssLayer.length; s++) {
                var ss = ssLayer[s];
                var ssIcon = ss.overallRisk === 'high' ? '🔴' : ss.overallRisk === 'moderate' ? '🟡' : '✅';
                var ssColor = ss.overallRisk === 'high' ? '#e74c3c' : ss.overallRisk === 'moderate' ? '#f1c40f' : '#2ecc71';
                if (ss.platform && ss.platform !== 'unknown') {
                    html += '<div style="font-size:11px;color:#555;margin-bottom:2px">Platform: ' + escapeHtmlSafe(ss.platform) + '</div>';
                }
                html += '<div style="color:' + ssColor + ';font-weight:600;font-size:13px;margin-bottom:6px">' + ssIcon + ' ' + escapeHtmlSafe(ss.summary || '') + '</div>';
                if (ss.photoRedFlags && ss.photoRedFlags.length > 0) {
                    ss.photoRedFlags.forEach(function(f) { html += '<div style="color:#8080A0;font-size:12px">• ' + escapeHtmlSafe(f) + '</div>'; });
                }
                if (ss.bioRedFlags && ss.bioRedFlags.length > 0) {
                    ss.bioRedFlags.forEach(function(f) { html += '<div style="color:#8080A0;font-size:12px">• ' + escapeHtmlSafe(f) + '</div>'; });
                }
                if (ss.messageRedFlags && ss.messageRedFlags.length > 0) {
                    ss.messageRedFlags.forEach(function(f) { html += '<div style="color:#8080A0;font-size:12px">• ' + escapeHtmlSafe(f) + '</div>'; });
                }
                if (ss.positiveSignals && ss.positiveSignals.length > 0) {
                    html += '<div style="margin-top:4px">';
                    ss.positiveSignals.forEach(function(p) { html += '<div style="color:#2ecc71;font-size:12px">✓ ' + escapeHtmlSafe(p) + '</div>'; });
                    html += '</div>';
                }
            }
            html += '</div>';
        }

        // Layer 4: Reverse Image Search (coming soon)
        html += '<div style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;margin-bottom:12px">';
        html += '<h4 style="color:#fff;font-size:14px;margin-bottom:6px">🔍 Reverse Image Search</h4>';
        html += '<p style="color:#555;font-size:13px;margin-bottom:6px">Coming soon — we\'re building the ability to check if these photos appear elsewhere online.</p>';
        html += '<p style="color:#8080A0;font-size:12px">Manual check: <a href="https://images.google.com" target="_blank" style="color:#E8A0B5">Google Images</a> · <a href="https://tineye.com" target="_blank" style="color:#E8A0B5">TinEye</a></p>';
        html += '</div>';

        // Recommendations
        if (data.recommendations && data.recommendations.length > 0) {
            html += '<div style="background:rgba(232,160,181,0.06);border:1px solid rgba(232,160,181,0.12);border-radius:12px;padding:16px;margin-bottom:12px">';
            html += '<h4 style="color:#E8A0B5;font-size:14px;margin-bottom:8px">💡 Recommendations</h4>';
            data.recommendations.forEach(function(r) {
                html += '<div style="color:#8080A0;font-size:13px;padding:4px 0;line-height:1.5">• ' + escapeHtmlSafe(r) + '</div>';
            });
            html += '</div>';
        }

        // Disclaimer
        html += '<div style="background:rgba(241,196,15,0.06);border:1px solid rgba(241,196,15,0.1);border-radius:10px;padding:12px 14px;margin-bottom:16px">';
        html += '<p style="color:#8080A0;font-size:11px;margin:0;line-height:1.5">⚠️ <strong style="color:#f1c40f">AI-Generated Analysis</strong> — This report was generated by an automated system and may not be fully accurate. Use your own judgment alongside these results.</p>';
        html += '</div>';

        // Usage info
        if (data.checksRemaining !== undefined) {
            html += '<div style="text-align:center;color:#555;font-size:12px;margin-bottom:12px">' + data.checksUsed + '/' + data.checksLimit + ' checks used this month · ' + data.checksRemaining + ' remaining</div>';
        }

        // Action buttons
        html += '<div style="display:flex;gap:10px;margin-top:16px">';
        html += '<button onclick="pvReset()" style="flex:1;background:#22223A;color:#E8A0B5;border:1px solid rgba(232,160,181,0.2);padding:12px;border-radius:10px;font-size:14px;font-weight:500;cursor:pointer">New Check</button>';
        html += '</div>';

        section.innerHTML = html;

        // Update usage counter on main screen
        if (data.checksRemaining !== undefined) {
            var counter = document.getElementById('pv-checks-remaining');
            if (counter) counter.textContent = data.checksRemaining;
        }
    }

    window.pvReset = function() {
        pvPhotos = [null, null, null, null];
        document.getElementById('pv-upload-section').style.display = 'block';
        document.getElementById('pv-progress-section').style.display = 'none';
        document.getElementById('pv-report-section').style.display = 'none';
        pvRenderGrid();
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
        row.innerHTML = '<input type="text" placeholder="Name" class="dc-contact-name"><input type="tel" placeholder="Phone" class="dc-contact-phone"><input type="email" placeholder="Email" class="dc-contact-email"><button class="dc-contact-remove" onclick="this.parentElement.remove()" title="Remove">&times;</button>';
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

        // Gather trusted contacts (name + phone + email)
        var contacts = [];
        document.querySelectorAll('#dc-contacts-list .dc-contact-row').forEach(function(row) {
            var name = row.querySelector('.dc-contact-name').value.trim();
            var phone = row.querySelector('.dc-contact-phone').value.trim();
            var email = row.querySelector('.dc-contact-email') ? row.querySelector('.dc-contact-email').value.trim() : '';
            if (name && phone) contacts.push({ name: name, phone: phone, email: email || undefined });
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
            body: JSON.stringify({ checkoutId: dateId })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.error) { if (typeof showToast === 'function') showToast(data.error); return; }
            if (typeof showToast === 'function') showToast('Checked in safely! Your contacts have been notified.');
            if (activeDateTimer) clearInterval(activeDateTimer);

            // Show completed date card with save/delete options
            var active = document.getElementById('dc-active');
            var homeActive = document.getElementById('home-active-date');
            if (active) active.style.display = 'none';
            if (homeActive) homeActive.style.display = 'none';
            showCompletedDate(activeDateData);
            activeDateData = null;
        })
        .catch(function() { if (typeof showToast === 'function') showToast('Check-in failed. Please try again.'); });
    };

    function showCompletedDate(date) {
        // Remove any existing completed card
        var existing = document.getElementById('dc-completed');
        if (existing) existing.remove();

        var card = document.createElement('div');
        card.id = 'dc-completed';
        card.className = 'datecheck-card';
        card.style.cssText = 'border:1px solid rgba(46,204,113,0.3);background:rgba(46,204,113,0.05);margin-bottom:16px';
        card.innerHTML =
            '<div style="text-align:center;margin-bottom:16px">' +
                '<div style="font-size:48px;margin-bottom:8px">&#10004;&#65039;</div>' +
                '<h3 style="color:#2ecc71;font-weight:700;margin:0 0 4px">Checked In Safely</h3>' +
                '<p style="color:#8080A0;font-size:13px;margin:0">Your trusted contacts have been notified.</p>' +
            '</div>' +
            '<div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:12px;margin-bottom:16px">' +
                '<div style="color:#fff;font-weight:600;font-size:15px">' + (date.date_name || date.dateName || 'Date') + '</div>' +
                '<div style="color:#8080A0;font-size:13px;margin-top:2px">' + (date.venue_name || date.venueName || '') + '</div>' +
                '<div style="color:#8080A0;font-size:12px;margin-top:2px">' + new Date(date.created_at || date.createdAt || Date.now()).toLocaleDateString() + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px">' +
                '<button class="dc-btn dc-btn-success" style="flex:1" onclick="saveDateRecord(' + date.id + ')"><i class="fas fa-bookmark"></i> Save Date</button>' +
                '<button class="dc-btn dc-btn-outline" style="flex:1;border-color:rgba(231,76,60,0.3);color:#e74c3c" onclick="deleteDateRecord(' + date.id + ')"><i class="fas fa-trash-alt"></i> Delete</button>' +
            '</div>' +
            '<button class="dc-btn dc-btn-outline" style="margin-top:8px" onclick="dismissCompletedDate()"><i class="fas fa-times"></i> Dismiss</button>';

        // Insert before the form
        var form = document.getElementById('dc-form');
        if (form && form.parentNode) {
            form.parentNode.insertBefore(card, form);
        }
    }

    window.saveDateRecord = function(checkoutId) {
        if (typeof showToast === 'function') showToast('Date saved to your history!');
        dismissCompletedDate();
    };

    window.deleteDateRecord = function(checkoutId) {
        if (!confirm('Delete this date record permanently? This cannot be undone.')) return;
        fetch('/api/dates/delete', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ checkoutId: checkoutId })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.error) { if (typeof showToast === 'function') showToast(data.error); return; }
            if (typeof showToast === 'function') showToast('Date record deleted.');
            dismissCompletedDate();
            // Refresh history if visible
            if (typeof loadDateHistory === 'function') loadDateHistory();
        })
        .catch(function() { if (typeof showToast === 'function') showToast('Failed to delete. Please try again.'); });
    };

    window.dismissCompletedDate = function() {
        var completed = document.getElementById('dc-completed');
        var form = document.getElementById('dc-form');
        if (completed) completed.remove();
        if (form) form.style.display = 'block';
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
                    // Open share sheet with emergency info
                    if (data.shareData && navigator.share) {
                        var sd = data.shareData;
                        var text = 'SAFETEA SOS ALERT\n\n' +
                            (sd.displayName || 'A SafeTea user') + ' triggered an emergency SOS.\n\n' +
                            (sd.gpsLink ? 'GPS: ' + sd.gpsLink + '\n' : '') +
                            'LIVE TRACKING: ' + sd.trackingUrl + '\n\n' +
                            'What to do:\n1. Open the tracking link\n2. Try to contact them\n3. If no response, call 911\n\nSent via SafeTea';
                        navigator.share({ title: 'SafeTea SOS Alert', text: text }).catch(function() {});
                    }
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
        // Redirect to the dedicated verification page with selfie camera flow
        window.location.href = '/verify.html';
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
        var plusPrice = isYearly ? '$66.99' : '$7.99';
        var plusPer = isYearly ? '/yr' : '/mo';
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

        // SafeTea+ card (single paid tier)
        var plusActive = currentTier === 'plus' || currentTier === 'pro' || currentTier === 'premium';
        html += '<div style="background:#22223A;border:' + (plusActive ? '2px solid #E8A0B5' : '1px solid rgba(255,255,255,0.06)') + ';border-radius:12px;padding:20px;margin-bottom:16px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
        html += '<div><h3 style="color:#fff;font-size:16px;margin:0">SafeTea+ <span style="background:linear-gradient(135deg,#f27059,#E8A0B5);color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;margin-left:6px">BEST VALUE</span></h3></div>';
        html += '<div style="color:#fff;font-size:22px;font-weight:800">' + plusPrice + '<span style="font-size:13px;font-weight:400;color:#8080A0">' + plusPer + '</span>' + saveBadge + '</div>';
        html += '</div>';
        html += '<div style="color:#A0A0C0;font-size:13px;line-height:1.8">';
        html += '<div><i class="fas fa-check" style="color:#E8A0B5;width:16px;margin-right:6px"></i>Know who you\'re meeting — background & identity checks</div>';
        html += '<div><i class="fas fa-check" style="color:#E8A0B5;width:16px;margin-right:6px"></i>SOS tools — Fake Call, Record & Alert, one-tap 911</div>';
        html += '<div><i class="fas fa-check" style="color:#E8A0B5;width:16px;margin-right:6px"></i>Date Check-In with live GPS tracking for contacts</div>';
        html += '<div><i class="fas fa-check" style="color:#E8A0B5;width:16px;margin-right:6px"></i>Name Watch — get alerts when someone is mentioned</div>';
        html += '<div><i class="fas fa-check" style="color:#E8A0B5;width:16px;margin-right:6px"></i>SMS notifications to your trusted circle</div>';
        html += '<div><i class="fas fa-check" style="color:#E8A0B5;width:16px;margin-right:6px"></i>AI photo verification — catch catfish before you meet</div>';
        html += '<div><i class="fas fa-check" style="color:#E8A0B5;width:16px;margin-right:6px"></i>Priority support from the SafeTea team</div>';
        html += '</div>';
        if (plusActive) {
            html += '<div style="margin-top:14px;text-align:center;padding:10px;background:rgba(232,160,181,0.1);border-radius:8px;color:#E8A0B5;font-weight:600;font-size:13px"><i class="fas fa-check-circle"></i> Current Plan</div>';
        } else {
            html += '<button onclick="startCheckout(\'plus\')" style="width:100%;margin-top:14px;padding:14px;border:none;border-radius:10px;background:linear-gradient(135deg,#f27059,#E8A0B5);color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">Subscribe to SafeTea+ — ' + plusPrice + plusPer + '</button>';
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
                var me = getUser();
                var myId = me ? me.id : null;
                convos.forEach(function(c) {
                    var isSysConvo = (c.other_user_id === myId) || c.is_system;
                    var name = isSysConvo ? 'SafeTea Alerts' : (c.other_custom_name || c.other_name || 'User');
                    var initials = isSysConvo ? '\uD83D\uDD14' : name.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
                    var color = isSysConvo ? '#E8A0B5' : (c.other_avatar_color || '#E8A0B5');
                    var preview = c.last_message || '';
                    if (preview.length > 50) preview = preview.substring(0, 50) + '...';
                    var time = formatConvoTime(c.last_message_at);
                    var unread = parseInt(c.unread_count) || 0;
                    var isActive = currentThreadUserId === c.other_user_id;

                    html += '<div class="convo-item' + (isActive ? ' active' : '') + '" onclick="openConversation(' + c.other_user_id + ')">';
                    html += '<div class="convo-avatar" style="background:' + color + ';font-size:' + (isSysConvo ? '18px' : '14px') + '">' + (isSysConvo ? '\uD83D\uDD14' : escapeHtmlSafe(initials)) + '</div>';
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
                var isSystemThread = data.is_system || false;
                var me = getUser();
                var myId = me ? me.id : null;

                // Detect system thread (self-conversation)
                if (parseInt(userId) === myId) isSystemThread = true;

                var otherName = isSystemThread ? 'SafeTea Alerts' : (other.custom_display_name || other.display_name || 'User');
                var otherColor = other.avatar_color || '#E8A0B5';
                var otherInitials = isSystemThread ? '\uD83D\uDD14' : otherName.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();

                var html = '<div class="thread-header">';
                html += '<div class="convo-avatar" style="background:' + otherColor + ';width:36px;height:36px;font-size:' + (isSystemThread ? '18px' : '13px') + '">' + (isSystemThread ? '\uD83D\uDD14' : escapeHtmlSafe(otherInitials)) + '</div>';
                html += '<div class="thread-header-name">' + escapeHtmlSafe(otherName) + '</div>';
                html += '</div>';

                html += '<div class="thread-messages" id="thread-messages">';
                if (msgs.length === 0) {
                    html += '<div style="text-align:center;color:#8080A0;padding:40px;font-size:14px">' + (isSystemThread ? 'No alerts yet. You\'ll see Name Watch and system notifications here.' : 'No messages yet \u2014 say hello!') + '</div>';
                } else {
                    msgs.forEach(function(m) {
                        if (isSystemThread) {
                            html += '<div class="msg-bubble received" style="background:rgba(232,160,181,0.08);border-left:3px solid #E8A0B5;position:relative">';
                            html += escapeHtmlSafe(m.content);
                            html += '<div class="msg-time" style="font-size:10px;color:#8080A0;margin-top:4px">' + formatMsgTime(m.created_at);
                            html += ' <span class="msg-delete-btn" onclick="event.stopPropagation();deleteMessage(' + m.id + ')" title="Delete" style="cursor:pointer;opacity:0.4;margin-left:6px;font-size:11px">&times;</span>';
                            html += '</div></div>';
                        } else {
                            var isSent = m.sender_id === myId;
                            html += '<div class="msg-bubble ' + (isSent ? 'sent' : 'received') + '" style="position:relative">';
                            html += escapeHtmlSafe(m.content);
                            html += '<div class="msg-time" style="font-size:10px;color:#8080A0;margin-top:4px">' + formatMsgTime(m.created_at);
                            html += ' <span class="msg-delete-btn" onclick="event.stopPropagation();deleteMessage(' + m.id + ')" title="Delete" style="cursor:pointer;opacity:0.4;margin-left:6px;font-size:11px">&times;</span>';
                            html += '</div></div>';
                        }
                    });
                }
                html += '</div>';

                // No reply box for system threads
                if (!isSystemThread) {
                    html += '<div class="thread-input">';
                    html += '<input type="text" id="thread-reply-input" placeholder="Type a message..." onkeydown="if(event.key===\'Enter\')sendThreadReply()">';
                    html += '<button onclick="sendThreadReply()"><i class="fas fa-paper-plane"></i></button>';
                    html += '</div>';
                }

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

    // Delete a message
    window.deleteMessage = function(msgId) {
        if (!confirm('Delete this message?')) return;
        fetch('/api/messages?id=' + msgId, {
            method: 'DELETE',
            headers: authHeaders()
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                if (currentThreadUserId) openConversation(currentThreadUserId);
                loadConversations();
            } else {
                if (typeof showToast === 'function') showToast(data.error || 'Failed to delete');
            }
        })
        .catch(function() {
            if (typeof showToast === 'function') showToast('Network error');
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

    // ============ TOGGLE CHANGE PASSWORD ============
    window.toggleChangePassword = function() {
        var form = document.getElementById('change-password-form');
        var chevron = document.getElementById('pw-chevron');
        if (form.style.display === 'none' || !form.style.display) {
            form.style.display = 'flex';
            chevron.style.transform = 'rotate(180deg)';
        } else {
            form.style.display = 'none';
            chevron.style.transform = 'rotate(0deg)';
        }
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

    // ============ SUBSCRIPTION MANAGEMENT ============
    window.loadSubscriptionStatus = function() {
        var section = document.getElementById('subscription-section');
        if (!section) return;
        var user = getUser();
        var isPaid = user && (user.subscription_tier === 'plus' || user.subscription_tier === 'pro' || user.subscription_tier === 'premium');
        if (!isPaid) { section.style.display = 'none'; return; }
        section.style.display = 'block';

        fetch('/api/subscriptions/status', { headers: authHeaders() })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var statusText = document.getElementById('sub-status-text');
                var cancelNotice = document.getElementById('sub-cancel-notice');
                var cancelBtn = document.getElementById('btn-cancel-sub');
                var endDate = document.getElementById('sub-end-date');

                if (data.cancel_at_period_end) {
                    var end = data.current_period_end ? new Date(data.current_period_end * 1000).toLocaleDateString() : 'end of billing period';
                    if (statusText) statusText.textContent = 'Cancels on ' + end;
                    if (cancelNotice) { cancelNotice.style.display = 'block'; }
                    if (endDate) endDate.textContent = end;
                    if (cancelBtn) cancelBtn.style.display = 'none';
                } else if (data.current_period_end) {
                    var renew = new Date(data.current_period_end * 1000).toLocaleDateString();
                    if (statusText) statusText.textContent = 'Renews on ' + renew;
                    if (cancelNotice) cancelNotice.style.display = 'none';
                    if (cancelBtn) cancelBtn.style.display = 'block';
                } else {
                    if (statusText) statusText.textContent = 'Active';
                    if (cancelBtn) cancelBtn.style.display = 'block';
                }
            })
            .catch(function() {});
    };

    window.cancelSubscription = function() {
        if (!confirm('Are you sure you want to cancel your SafeTea+ subscription? You\'ll keep access until the end of your current billing period.')) return;

        var btn = document.getElementById('btn-cancel-sub');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cancelling...'; }

        fetch('/api/subscriptions/cancel', {
            method: 'POST',
            headers: authHeaders()
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-times-circle"></i> Cancel Subscription'; }
            if (data.cancel_at_period_end) {
                if (typeof showToast === 'function') showToast('Subscription cancelled — access continues until end of billing period');
                loadSubscriptionStatus();
            } else if (data.error) {
                if (typeof showToast === 'function') showToast(data.error);
            }
        })
        .catch(function() {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-times-circle"></i> Cancel Subscription'; }
            if (typeof showToast === 'function') showToast('Failed to cancel — try again');
        });
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

    // ============ UTILITY: apiFetch ============
    function apiFetch(endpoint, options) {
        options = options || {};
        var headers = { 'Content-Type': 'application/json' };
        var t = getToken();
        if (t) headers['Authorization'] = 'Bearer ' + t;
        if (options.headers) {
            for (var k in options.headers) headers[k] = options.headers[k];
        }
        return fetch('/api' + endpoint, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body
        }).then(function(res) {
            if (res.status === 401) {
                localStorage.removeItem(TOKEN_KEY);
                localStorage.removeItem(USER_KEY);
                window.location.href = '/login';
                return null;
            }
            var ct = res.headers.get('content-type') || '';
            if (ct.indexOf('application/json') === -1) return null;
            return res.json();
        });
    }

    function getPlusBadgeHtml(tier) {
        if (!tier || tier === 'free') return '';
        return ' <span style="display:inline-block;background:linear-gradient(135deg,#f27059,#E8A0B5);color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;vertical-align:middle;letter-spacing:0.5px;text-transform:uppercase">PLUS</span>';
    }
    window.getPlusBadgeHtml = getPlusBadgeHtml;

    // ==================== WATERMARK UTILITY ====================
    function addWatermark(dataUrl, callback) {
        var u = getUser();
        var userId = u ? u.id : '';
        var text = userId ? 'SafeTea #' + userId : 'SafeTea';
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Transparent repeating diagonal watermark across entire image
            var fontSize = Math.max(18, Math.round(img.width * 0.045));
            ctx.font = '700 ' + fontSize + 'px Inter, sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Rotate -30 degrees and tile across entire canvas
            ctx.save();
            ctx.translate(img.width / 2, img.height / 2);
            ctx.rotate(-30 * Math.PI / 180);

            var textW = ctx.measureText(text).width;
            var spacingX = textW + 80;
            var spacingY = fontSize * 3.5;
            var diag = Math.sqrt(img.width * img.width + img.height * img.height);

            for (var y = -diag; y < diag; y += spacingY) {
                for (var x = -diag; x < diag; x += spacingX) {
                    ctx.fillText(text, x, y);
                }
            }
            ctx.restore();

            callback(canvas.toDataURL('image/jpeg', 0.92));
        };
        img.onerror = function() { callback(dataUrl); };
        img.src = dataUrl;
    }
    window.addWatermark = addWatermark;

    // ==================== INVISIBLE TEXT WATERMARK ====================
    // Embeds viewer's user ID as near-invisible tiled text across the image.
    // Survives screenshots, JPEG compression, and resizing.
    // To decode: amplify contrast — text becomes readable.
    // Used by enterprise leak-tracking products (same technique).

    // Debug mode: add ?wmdebug=1 to URL to make watermark bright red and obvious
    var WM_DEBUG = window.location.search.indexOf('wmdebug=1') !== -1;

    function wmApplyText(ctx, w, h, userId) {
        var text = 'ST:' + userId;
        // Scale font by DPR so text appears consistent size regardless of screen density
        var dpr = window.devicePixelRatio || 1;
        var fontSize = Math.round(22 * dpr);
        var spacingY = Math.round(48 * dpr);
        var spacingX = Math.round(140 * dpr);

        var pat = document.createElement('canvas');
        pat.width = w; pat.height = h;
        var pCtx = pat.getContext('2d');
        pCtx.font = 'bold ' + fontSize + 'px monospace';
        pCtx.textBaseline = 'top';
        pCtx.fillStyle = WM_DEBUG ? '#ff0000' : '#ffffff';
        pCtx.rotate(-0.06);
        var margin = Math.round(60 * dpr);
        for (var y = -margin; y < h + margin; y += spacingY) {
            for (var x = -margin; x < w + margin; x += spacingX) {
                pCtx.fillText(text, x, y);
            }
        }
        ctx.save();
        ctx.globalAlpha = WM_DEBUG ? 0.5 : 0.08;
        ctx.drawImage(pat, 0, 0);
        ctx.restore();
        if (WM_DEBUG) console.log('[WM DEBUG] Watermark drawn — text:', text, 'fontSize:', fontSize, 'canvas:', w + 'x' + h, 'dpr:', dpr);
    }

    // Legacy function name kept for stegoEmbed compatibility
    function wmApply(px, w, h, userId) {
        // No-op — text watermark is applied via canvas context, not pixel data
        // See wmApplyText() which is called on the context directly
    }

    function stegoEmbed(dataUrl, userId, callback) {
        var img = new Image();
        if (dataUrl && dataUrl.indexOf('data:') !== 0) {
            img.crossOrigin = 'anonymous';
        }
        img.onload = function() {
            var w = img.width, h = img.height;
            var canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            wmApplyText(ctx, w, h, userId);
            callback(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = function() { callback(dataUrl); };
        img.src = dataUrl;
    }
    window.stegoEmbed = stegoEmbed;

    // IntersectionObserver: lazy-process photo post canvases when they enter viewport
    // Embeds invisible text watermark at exact CSS×DPR resolution so canvas buffer = screenshot pixels
    function initStegoObserver() {
        if (!window.IntersectionObserver) return;
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (!entry.isIntersecting) return;
                var el = entry.target;
                if (el.dataset.stegoProcessed) return;
                el.dataset.stegoProcessed = '1';
                observer.unobserve(el);

                var src = el.dataset.stegoSrc;
                if (!src) return;
                var u = getUser();
                var uid = u ? parseInt(u.id) || 0 : 0;

                var imgEl = new Image();
                // No crossOrigin needed — we only DRAW to the canvas (never getImageData/toDataURL).
                // Setting crossOrigin on hosts without CORS headers causes images to fail loading entirely.
                imgEl.onload = function() {
                    var canvas = el;
                    var dpr = window.devicePixelRatio || 1;

                    // Calculate CSS display dimensions from container + image aspect ratio
                    var parentEl = canvas.parentElement;
                    var containerW = (parentEl ? parentEl.clientWidth : 0) || 500;
                    var maxCssH = 300;
                    var imgRatio = imgEl.naturalWidth / imgEl.naturalHeight;

                    var cssW = containerW;
                    var cssH = Math.round(containerW / imgRatio);
                    if (cssH > maxCssH) {
                        cssH = maxCssH;
                        cssW = Math.round(maxCssH * imgRatio);
                        if (cssW > containerW) cssW = containerW;
                    }

                    canvas.style.width = cssW + 'px';
                    canvas.style.height = cssH + 'px';
                    canvas.style.maxHeight = 'none';
                    canvas.style.maxWidth = '100%';

                    var bufW = Math.round(cssW * dpr);
                    var bufH = Math.round(cssH * dpr);
                    canvas.width = bufW;
                    canvas.height = bufH;

                    var ctx = canvas.getContext('2d');
                    ctx.drawImage(imgEl, 0, 0, bufW, bufH);

                    // Apply invisible text watermark (survives screenshots + JPEG)
                    wmApplyText(ctx, bufW, bufH, uid);

                    // In debug mode, also draw a big obvious banner directly on the canvas
                    if (WM_DEBUG) {
                        ctx.save();
                        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
                        ctx.fillRect(0, 0, bufW, Math.round(32 * dpr));
                        ctx.font = 'bold ' + Math.round(20 * dpr) + 'px monospace';
                        ctx.fillStyle = '#ffffff';
                        ctx.textBaseline = 'top';
                        ctx.fillText('WATERMARK ACTIVE — Viewer ID: ' + uid, Math.round(8 * dpr), Math.round(6 * dpr));
                        ctx.restore();
                    }

                    canvas.style.opacity = '1';
                    // Hide the loading spinner, show success badge
                    var spinner = canvas.parentElement ? canvas.parentElement.querySelector('.stego-spinner') : null;
                    if (spinner) spinner.innerHTML = WM_DEBUG
                        ? '<span style="background:rgba(255,0,0,0.8);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">WM: uid=' + uid + '</span>'
                        : '';
                    console.log('[SafeTea WM] Text watermark applied — uid:', uid, 'canvas:', bufW + 'x' + bufH, 'dpr:', dpr);
                };
                imgEl.onerror = function(e) {
                    console.error('[SafeTea WM] Image FAILED to load:', src ? src.substring(0, 80) + '...' : 'null');
                    // Show error on spinner
                    var spinner = el.parentElement ? el.parentElement.querySelector('.stego-spinner') : null;
                    if (spinner) spinner.innerHTML = '<span style="color:#e74c3c;font-size:11px"><i class="fas fa-times-circle"></i> Load failed</span>';
                    // Fallback: show original image as regular <img> tag
                    var fallback = document.createElement('img');
                    fallback.src = src;
                    fallback.style.cssText = 'width:100%;max-height:300px;object-fit:cover;border-radius:10px;display:block';
                    if (el.parentElement) el.parentElement.insertBefore(fallback, el);
                    el.style.display = 'none';
                };
                imgEl.src = src;
            });
        }, { rootMargin: '200px' });
        window._stegoObserver = observer;
    }
    initStegoObserver();

    // Observe new stego canvases after feed renders
    function observeStegoCanvases(container) {
        if (!window._stegoObserver) return;
        var canvases = (container || document).querySelectorAll('canvas[data-stego-src]:not([data-stego-processed])');
        canvases.forEach(function(c) { window._stegoObserver.observe(c); });
    }
    window.observeStegoCanvases = observeStegoCanvases;

    function canModifyPost(post) {
        var u = getUser();
        return u && (String(post.user_id) === String(u.id) || u.role === 'admin' || u.role === 'moderator');
    }

    // ==================== VOTE SYSTEM (LIKE / DISLIKE) ====================
    var _voteDebounce = {};
    window.votePost = function(postId, voteType) {
        if (_voteDebounce[postId]) return;
        _voteDebounce[postId] = true;
        setTimeout(function() { delete _voteDebounce[postId]; }, 300);

        var likeBtn = document.getElementById('like-btn-' + postId);
        var dislikeBtn = document.getElementById('dislike-btn-' + postId);
        var likeIcon = likeBtn ? likeBtn.querySelector('i') : null;
        var dislikeIcon = dislikeBtn ? dislikeBtn.querySelector('i') : null;
        var isLiked = likeIcon && likeIcon.classList.contains('fas');
        var isDisliked = dislikeIcon && dislikeIcon.classList.contains('fas');

        if (voteType === 'like') {
            var method = isLiked ? 'DELETE' : 'POST';
            apiFetch('/posts/like?id=' + postId, { method: method }).then(function(data) {
                if (!data) return;
                var lc = document.getElementById('like-count-' + postId);
                var dc = document.getElementById('dislike-count-' + postId);
                if (lc) lc.textContent = data.like_count;
                if (dc && data.dislike_count !== undefined) dc.textContent = data.dislike_count;
                if (data.liked) {
                    if (likeIcon) { likeIcon.classList.remove('far'); likeIcon.classList.add('fas'); }
                    if (likeBtn) likeBtn.style.color = '#E8A0B5';
                    if (dislikeIcon) { dislikeIcon.classList.remove('fas'); dislikeIcon.classList.add('far'); }
                    if (dislikeBtn) dislikeBtn.style.color = '#8080A0';
                } else {
                    if (likeIcon) { likeIcon.classList.remove('fas'); likeIcon.classList.add('far'); }
                    if (likeBtn) likeBtn.style.color = '#8080A0';
                }
                if (likeBtn) { likeBtn.style.transform = 'scale(1.2)'; setTimeout(function() { likeBtn.style.transform = ''; }, 200); }
            });
        } else if (voteType === 'dislike') {
            var method2 = isDisliked ? 'DELETE' : 'POST';
            apiFetch('/posts/dislike?id=' + postId, { method: method2 }).then(function(data) {
                if (!data) return;
                var lc = document.getElementById('like-count-' + postId);
                var dc = document.getElementById('dislike-count-' + postId);
                if (lc) lc.textContent = data.like_count;
                if (dc) dc.textContent = data.dislike_count;
                if (data.disliked) {
                    if (dislikeIcon) { dislikeIcon.classList.remove('far'); dislikeIcon.classList.add('fas'); }
                    if (dislikeBtn) dislikeBtn.style.color = '#E8A0B5';
                    if (likeIcon) { likeIcon.classList.remove('fas'); likeIcon.classList.add('far'); }
                    if (likeBtn) likeBtn.style.color = '#8080A0';
                } else {
                    if (dislikeIcon) { dislikeIcon.classList.remove('fas'); dislikeIcon.classList.add('far'); }
                    if (dislikeBtn) dislikeBtn.style.color = '#8080A0';
                }
                if (dislikeBtn) { dislikeBtn.style.transform = 'scale(1.2)'; setTimeout(function() { dislikeBtn.style.transform = ''; }, 200); }
            });
        }
    };

    // Backwards compat wrapper
    window.toggleLike = function(postId) { window.votePost(postId, 'like'); };

    // ==================== EXPANDABLE REPLIES ====================
    window.toggleReplies = function(postId) {
        var container = document.getElementById('replies-' + postId);
        if (!container) return;
        if (container.style.display === 'block') { container.style.display = 'none'; return; }
        container.style.display = 'block';
        container.innerHTML = '<div style="color:#8080A0;font-size:12px;padding:8px"><i class="fas fa-spinner fa-spin"></i> Loading replies...</div>';

        apiFetch('/posts/replies?id=' + postId).then(function(data) {
            var html = '';
            var replies = (data && data.replies) ? data.replies : [];
            var showAll = replies.length <= 3;
            var visible = showAll ? replies : replies.slice(0, 3);
            visible.forEach(function(r) {
                var rName = r.display_name || 'Anonymous';
                html += '<div style="display:flex;gap:10px;margin-bottom:8px;padding:6px 0">' +
                    '<div style="width:26px;height:26px;border-radius:50%;background:' + hubGetAvatarColor(rName) + ';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0">' + rName[0].toUpperCase() + '</div>' +
                    '<div style="flex:1"><span style="color:#fff;font-size:12px;font-weight:600">' + escapeHtmlSafe(rName) + '</span> <span style="color:#8080A0;font-size:10px">' + getTimeAgoFromDate(r.created_at) + '</span>' +
                    '<div style="color:#ccc;font-size:13px;margin-top:2px">' + escapeHtmlSafe(r.body) + '</div></div>' +
                '</div>';
            });
            if (!showAll) {
                html += '<button onclick="showAllReplies(' + postId + ')" id="expand-replies-' + postId + '" style="background:none;border:none;color:#E8A0B5;font-size:12px;cursor:pointer;padding:4px 0;margin-bottom:8px">View all ' + replies.length + ' replies</button>';
                html += '<div id="all-replies-' + postId + '" style="display:none">';
                replies.slice(3).forEach(function(r) {
                    var rName = r.display_name || 'Anonymous';
                    html += '<div style="display:flex;gap:10px;margin-bottom:8px;padding:6px 0">' +
                        '<div style="width:26px;height:26px;border-radius:50%;background:' + hubGetAvatarColor(rName) + ';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0">' + rName[0].toUpperCase() + '</div>' +
                        '<div style="flex:1"><span style="color:#fff;font-size:12px;font-weight:600">' + escapeHtmlSafe(rName) + '</span> <span style="color:#8080A0;font-size:10px">' + getTimeAgoFromDate(r.created_at) + '</span>' +
                        '<div style="color:#ccc;font-size:13px;margin-top:2px">' + escapeHtmlSafe(r.body) + '</div></div>' +
                    '</div>';
                });
                html += '</div>';
            }
            if (replies.length === 0) {
                html += '<div style="color:#555;font-size:12px;margin-bottom:8px">No replies yet. Be the first!</div>';
            }
            // Compose box
            html += '<div style="display:flex;gap:8px;margin-top:10px">' +
                '<input type="text" id="reply-input-' + postId + '" placeholder="Write a reply..." style="flex:1;background:#141428;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px 12px;color:#fff;font-family:\'Inter\',sans-serif;font-size:13px;outline:none" onfocus="this.style.borderColor=\'#E8A0B5\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.08)\'" onkeydown="if(event.key===\'Enter\')submitPostReply(' + postId + ')">' +
                '<button onclick="submitPostReply(' + postId + ')" style="background:linear-gradient(135deg,#E8A0B5,#C77DBA);color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif">Reply</button>' +
            '</div>';
            container.innerHTML = html;
            var inp = document.getElementById('reply-input-' + postId);
            if (inp) inp.focus();
        });
    };

    window.showAllReplies = function(postId) {
        var el = document.getElementById('all-replies-' + postId);
        var btn = document.getElementById('expand-replies-' + postId);
        if (el) el.style.display = 'block';
        if (btn) btn.style.display = 'none';
    };

    window.submitPostReply = function(postId) {
        var input = document.getElementById('reply-input-' + postId);
        if (!input || !input.value.trim()) return;
        var text = input.value.trim();
        input.disabled = true;
        apiFetch('/posts/replies?id=' + postId, {
            method: 'POST',
            body: JSON.stringify({ body: text })
        }).then(function(data) {
            if (data && data.id) {
                var container = document.getElementById('replies-' + postId);
                if (container) container.style.display = 'none';
                window.toggleReplies(postId);
                // Update reply count in action bar
                var countEl = document.getElementById('reply-count-' + postId);
                if (countEl) countEl.textContent = parseInt(countEl.textContent || 0) + 1;
                showToast('Reply posted!');
            } else if (data && data.error) {
                showToast(data.error, true);
                input.disabled = false;
            }
        }).catch(function() { showToast('Failed to reply', true); input.disabled = false; });
    };

    // ==================== BUMP POST ====================
    window.bumpPost = function(postId) {
        apiFetch('/posts/bump?id=' + postId, { method: 'POST' }).then(function(data) {
            if (!data) return;
            if (data.error) {
                showToast(data.error, true);
                return;
            }
            var countEl = document.getElementById('bump-count-' + postId);
            var btn = document.getElementById('bump-btn-' + postId);
            if (countEl) countEl.textContent = data.bump_count;
            if (btn) { btn.style.color = '#E8A0B5'; btn.style.transform = 'scale(1.2)'; setTimeout(function() { btn.style.transform = ''; }, 200); }
            if (data.trending) showToast('This post is now trending!');
            else showToast('Post bumped!');
        }).catch(function() { showToast('Failed to bump post', true); });
    };

    // ==================== THREE-DOT MENU ====================
    window.showPostMenu = function(postId, isOwner, feed) {
        // Close any existing menu
        var existing = document.getElementById('post-menu-' + postId);
        if (existing) { existing.remove(); return; }
        document.querySelectorAll('[id^="post-menu-"]').forEach(function(m) { m.remove(); });

        var menuHtml = '<div id="post-menu-' + postId + '" style="position:absolute;right:0;top:24px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.1);border-radius:10px;min-width:160px;z-index:100;box-shadow:0 8px 24px rgba(0,0,0,0.4);overflow:hidden">';
        if (isOwner) {
            menuHtml += '<button onclick="editPostFromMenu(' + postId + ',\'' + (feed || 'community') + '\');document.getElementById(\'post-menu-' + postId + '\').remove()" style="display:block;width:100%;text-align:left;padding:12px 16px;background:none;border:none;color:#fff;font-size:13px;cursor:pointer;font-family:inherit" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-pencil-alt" style="width:18px;color:#E8A0B5"></i> Edit Post</button>';
            menuHtml += '<button onclick="deletePost(' + postId + ',\'' + (feed || 'community') + '\');document.getElementById(\'post-menu-' + postId + '\').remove()" style="display:block;width:100%;text-align:left;padding:12px 16px;background:none;border:none;color:#e74c3c;font-size:13px;cursor:pointer;font-family:inherit" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-trash" style="width:18px"></i> Delete Post</button>';
        } else {
            menuHtml += '<button onclick="showReportModal(' + postId + ');document.getElementById(\'post-menu-' + postId + '\').remove()" style="display:block;width:100%;text-align:left;padding:12px 16px;background:none;border:none;color:#e74c3c;font-size:13px;cursor:pointer;font-family:inherit" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-flag" style="width:18px"></i> Report Post</button>';
        }
        menuHtml += '</div>';

        var wrapper = document.getElementById('menu-anchor-' + postId);
        if (wrapper) {
            wrapper.innerHTML = menuHtml;
            // Close menu when clicking outside
            setTimeout(function() {
                document.addEventListener('click', function closeMenu(e) {
                    var menu = document.getElementById('post-menu-' + postId);
                    if (menu && !menu.contains(e.target) && !wrapper.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                });
            }, 10);
        }
    };

    window.editPostFromMenu = function(postId, feed) {
        var postEl = document.getElementById('post-' + postId);
        if (!postEl) return;
        var bodyEl = postEl.querySelector('[data-post-body]');
        var body = bodyEl ? bodyEl.textContent : '';
        editPost(postId, body, feed);
    };

    // ==================== REPORT MODAL ====================
    window.showReportModal = function(postId) {
        var modal = document.createElement('div');
        modal.className = 'dc-share-modal';
        modal.id = 'report-post-modal';
        modal.innerHTML =
            '<div class="dc-share-modal-content" style="max-width:420px">' +
                '<h3 style="color:#fff;margin-bottom:4px"><i class="fas fa-flag" style="color:#e74c3c"></i> Report Post</h3>' +
                '<p style="color:#8080A0;font-size:13px;margin-bottom:20px">Help keep our community safe. Select a reason below.</p>' +
                '<div id="report-reasons" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">' +
                    reportReasonOption('inappropriate', 'Inappropriate Content') +
                    reportReasonOption('harassment', 'Harassment or Bullying') +
                    reportReasonOption('spam', 'Spam') +
                    reportReasonOption('fake_identity', 'Fake Identity') +
                    reportReasonOption('doxxing', 'Doxxing / Sharing Private Info') +
                    reportReasonOption('false_info', 'False Information') +
                    reportReasonOption('threats', 'Threats') +
                    reportReasonOption('other', 'Other') +
                '</div>' +
                '<textarea id="report-details" rows="3" placeholder="Additional details (optional)..." style="width:100%;padding:12px;background:#141428;border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;font-size:13px;resize:vertical;font-family:inherit;margin-bottom:16px"></textarea>' +
                '<button id="report-submit-btn" class="dc-btn dc-btn-primary" style="background:linear-gradient(135deg,#e74c3c,#c0392b);width:100%" onclick="submitReport(' + postId + ')"><i class="fas fa-flag"></i> Submit Report</button>' +
                '<button class="dc-btn dc-btn-outline" style="margin-top:8px;width:100%" onclick="document.getElementById(\'report-post-modal\').remove()">Cancel</button>' +
            '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    };

    function reportReasonOption(value, label) {
        return '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#141428;border:1px solid rgba(255,255,255,0.06);border-radius:8px;cursor:pointer;transition:border-color 0.2s" onmouseover="this.style.borderColor=\'rgba(232,160,181,0.3)\'" onmouseout="if(!this.querySelector(\'input\').checked)this.style.borderColor=\'rgba(255,255,255,0.06)\'">' +
            '<input type="radio" name="report-reason" value="' + value + '" style="accent-color:#E8A0B5" onclick="this.closest(\'label\').style.borderColor=\'#E8A0B5\';document.querySelectorAll(\'#report-reasons label\').forEach(function(l){if(!l.querySelector(\'input\').checked)l.style.borderColor=\'rgba(255,255,255,0.06)\'})">' +
            '<span style="color:#ccc;font-size:13px">' + label + '</span>' +
        '</label>';
    }

    window.submitReport = function(postId) {
        var reason = document.querySelector('input[name="report-reason"]:checked');
        if (!reason) { showToast('Please select a reason', true); return; }
        var details = document.getElementById('report-details').value.trim();
        var btn = document.getElementById('report-submit-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        apiFetch('/posts/report', {
            method: 'POST',
            body: JSON.stringify({ post_id: postId, reason: reason.value, details: details || null })
        }).then(function(data) {
            if (data && data.status === 'reported') {
                showToast('Report submitted. Thank you for keeping our community safe.');
                var modal = document.getElementById('report-post-modal');
                if (modal) modal.remove();
                // If post was auto-hidden (3+ reports), show placeholder
                if (data.report_count >= 3) {
                    var postEl = document.getElementById('post-' + postId);
                    if (postEl) {
                        postEl.style.opacity = '0.4';
                        postEl.innerHTML = '<div style="text-align:center;padding:20px;color:#8080A0"><i class="fas fa-eye-slash" style="font-size:20px;margin-bottom:8px;display:block"></i>This post has been hidden due to community reports.</div>';
                    }
                }
            } else {
                showToast((data && data.error) || 'Failed to submit report', true);
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-flag"></i> Submit Report';
            }
        }).catch(function() {
            showToast('Failed to submit report', true);
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-flag"></i> Submit Report';
        });
    };

    // ==================== HUB TAB SWITCHER ====================
    window.switchHubTab = function(sub) {
        document.querySelectorAll('.hub-tab').forEach(function(btn) {
            btn.style.background = '#22223A';
            btn.style.color = '#8080A0';
            btn.style.border = '1px solid rgba(255,255,255,0.08)';
        });
        var activeBtn = document.querySelector('.hub-tab[data-hubsub="' + sub + '"]');
        if (activeBtn) {
            activeBtn.style.background = '#E8A0B5';
            activeBtn.style.color = '#1A1A2E';
            activeBtn.style.border = 'none';
        }
        document.querySelectorAll('.hub-sub').forEach(function(s) {
            s.style.display = 'none';
            s.classList.remove('active');
        });
        var target = document.getElementById('hub-' + sub);
        if (target) {
            target.style.display = 'block';
            target.classList.add('active');
        }
        if (sub === 'namewatch' && typeof initNameWatch === 'function') initNameWatch();
        if (sub === 'datecheck' && typeof initDateCheck === 'function') initDateCheck();
        if (sub === 'search') { if (typeof initSearchTabs === 'function') initSearchTabs(); initAreaAlerts(); }
        if (sub === 'referral') hubLoadReferralPosts();
        if (sub === 'growreferral') loadGrowReferral();
        if (sub === 'sororityrooms') initSororityRooms();
        if (sub === 'roomview') loadRoomView();
    };

    // ==================== COMMUNITY MENTIONS ====================
    window.loadCommunityMentions = function() {
        var name = document.getElementById('bg-name') ? document.getElementById('bg-name').value.trim() : '';
        var container = document.getElementById('community-mentions-results');
        if (!name || !container) {
            showToast('Enter a name in the Background Check form first.', true);
            return;
        }

        container.innerHTML = '<div style="text-align:center;padding:16px;color:#8080A0"><i class="fas fa-spinner fa-spin"></i> Searching community posts...</div>';

        apiFetch('/posts?feed=community&limit=50').then(function(posts) {
            if (!posts || posts.length === 0) {
                container.innerHTML = '<p style="color:#8080A0;font-size:13px;text-align:center;padding:12px">No community posts to search.</p>';
                return;
            }

            var searchTerms = name.toLowerCase().split(/\s+/);
            var matches = posts.filter(function(p) {
                var content = ((p.body || '') + ' ' + (p.title || '')).toLowerCase();
                return searchTerms.some(function(term) { return term.length >= 2 && content.indexOf(term) !== -1; });
            });

            if (matches.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:16px"><i class="fas fa-check-circle" style="color:#2ecc71;font-size:28px;display:block;margin-bottom:8px"></i><p style="color:#8080A0;font-size:13px">No community posts mention "' + escapeHtmlSafe(name) + '".</p></div>';
                return;
            }

            container.innerHTML = '<p style="color:#E8A0B5;font-size:13px;font-weight:600;margin-bottom:12px">' + matches.length + ' post(s) mention "' + escapeHtmlSafe(name) + '"</p>' +
                matches.slice(0, 10).map(function(p) {
                    var highlighted = escapeHtmlSafe(p.body || '');
                    searchTerms.forEach(function(term) {
                        if (term.length >= 2) {
                            var regex = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
                            highlighted = highlighted.replace(regex, '<span style="background:rgba(231,76,60,0.2);color:#e74c3c;padding:1px 3px;border-radius:3px;font-weight:600">$1</span>');
                        }
                    });
                    return '<div style="background:#1A1A2E;border-radius:10px;padding:14px;margin-bottom:8px">' +
                        '<div style="font-size:12px;color:#666;margin-bottom:6px">' + getTimeAgoFromDate(p.created_at) + (p.city ? ' &bull; ' + escapeHtmlSafe(p.city) : '') + '</div>' +
                        '<div style="font-size:13px;color:#ccc;line-height:1.5">' + highlighted + '</div>' +
                    '</div>';
                }).join('');
        }).catch(function() {
            container.innerHTML = '<p style="color:#e74c3c;font-size:13px">Failed to search community posts.</p>';
        });
    };

    // ==================== TEA TALK (Community Posts) ====================
    function hubFormatBody(text) {
        if (!text) return '';
        var escaped = escapeHtmlSafe(text);
        escaped = escaped.replace(/\b([A-Z][a-z]+\s[A-Z]\.)/g, '<span style="color:#E8A0B5;font-weight:600">$1</span>');
        return escaped;
    }

    function hubGetCategoryBadge(category) {
        var map = {
            experience: '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:rgba(232,160,181,0.15);color:#E8A0B5">Experience</span>',
            warning: '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:rgba(231,76,60,0.15);color:#e74c3c">Warning</span>',
            question: '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:rgba(91,160,208,0.15);color:#5BA0D0">Question</span>',
            positive: '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:rgba(46,204,113,0.15);color:#2ecc71">Positive</span>',
            general: '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:rgba(232,160,181,0.15);color:#E8A0B5">General</span>',
            referral: '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:rgba(46,204,113,0.15);color:#2ecc71">Referral</span>'
        };
        return map[category] || '';
    }

    function hubGetAvatarColor(name) {
        var colors = ['#6c7b95','#E8A0B5','#2ecc71','#9b59b6','#e085c2','#6ec2e2','#B48CD2','#1abc9c','#e74c3c','#3498db'];
        var hash = 0;
        for (var i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    }

    function hubRenderPost(post) {
        var authorName = post.author_name || 'Anonymous';
        var initial = authorName[0].toUpperCase();
        var avatarColor = hubGetAvatarColor(authorName);
        var cityHtml = post.city ? ' <span style="display:inline-flex;align-items:center;gap:4px;background:rgba(232,160,181,0.15);color:#E8A0B5;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;margin-left:8px"><i class="fas fa-map-marker-alt"></i> ' + escapeHtmlSafe(post.city) + '</span>' : '';
        var badgeHtml = hubGetCategoryBadge(post.category);
        var replyCount = post.reply_count || 0;
        var likeCount = parseInt(post.like_count) || 0;
        var dislikeCount = parseInt(post.dislike_count) || 0;
        var bumpCount = parseInt(post.bump_count) || 0;
        var userLiked = post.user_liked === true || post.user_liked === 't';
        var userDisliked = post.user_disliked === true || post.user_disliked === 't';
        var userBumped = post.user_bumped === true || post.user_bumped === 't';
        var canMod = canModifyPost(post);
        // Deprioritize posts with high dislike ratio
        var deprioritized = dislikeCount >= 5 && dislikeCount > likeCount * 2;
        var trendingBadge = bumpCount >= 5 ? ' <span style="font-size:10px;color:#f39c12;font-weight:600">TRENDING</span>' : '';

        return '<div id="post-' + post.id + '" style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin-bottom:12px' + (deprioritized ? ';opacity:0.5' : '') + '">' +
            '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
                '<div style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;flex-shrink:0;background:' + avatarColor + '">' + initial + '</div>' +
                '<div style="flex:1">' +
                    '<div style="font-weight:600;font-size:14px;color:#fff">' + escapeHtmlSafe(authorName) + getPlusBadgeHtml(post.author_tier) + ' ' + badgeHtml + trendingBadge + '</div>' +
                    '<div style="font-size:12px;color:#666;margin-top:2px">' + getTimeAgoFromDate(post.created_at) + cityHtml + '</div>' +
                '</div>' +
            '</div>' +
            '<div data-post-body style="font-size:14px;line-height:1.6;color:#ccc;margin-bottom:16px">' + hubFormatBody(post.body) + '</div>' +
            (post.image_url ? '<div style="margin-bottom:12px;position:relative"><canvas data-stego-src="' + escapeHtmlSafe(post.image_url) + '" style="width:100%;max-height:300px;object-fit:cover;border-radius:10px;opacity:0;transition:opacity 0.3s;display:block"></canvas><div class="stego-spinner" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#8080A0;font-size:12px"><i class="fas fa-spinner fa-spin"></i></div></div>' : '') +
            // Action bar
            '<div style="display:flex;align-items:center;gap:4px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04)">' +
                '<button id="like-btn-' + post.id + '" onclick="votePost(' + post.id + ',\'like\')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;transition:all 0.2s;color:' + (userLiked ? '#E8A0B5' : '#8080A0') + '" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="' + (userLiked ? 'fas' : 'far') + ' fa-thumbs-up"></i> <span id="like-count-' + post.id + '">' + likeCount + '</span></button>' +
                '<button id="dislike-btn-' + post.id + '" onclick="votePost(' + post.id + ',\'dislike\')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;transition:all 0.2s;color:' + (userDisliked ? '#E8A0B5' : '#8080A0') + '" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="' + (userDisliked ? 'fas' : 'far') + ' fa-thumbs-down"></i> <span id="dislike-count-' + post.id + '">' + dislikeCount + '</span></button>' +
                '<button onclick="toggleReplies(' + post.id + ')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;transition:all 0.2s;color:#8080A0" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-comment"></i> <span id="reply-count-' + post.id + '">' + replyCount + '</span></button>' +
                '<button id="bump-btn-' + post.id + '" onclick="bumpPost(' + post.id + ')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;transition:all 0.2s;color:' + (userBumped ? '#E8A0B5' : '#8080A0') + '" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-arrow-up"></i> <span id="bump-count-' + post.id + '">' + bumpCount + '</span></button>' +
                '<div style="margin-left:auto;display:flex;align-items:center;gap:2px">' +
                    (canMod ? '<button onclick="deletePost(' + post.id + ',\'community\')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;color:#8080A0;transition:all 0.2s" onmouseover="this.style.color=\'#e74c3c\';this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.color=\'#8080A0\';this.style.background=\'none\'" title="Delete post"><i class="fas fa-trash-alt"></i></button>' : '') +
                    '<button onclick="showReportModal(' + post.id + ')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;color:#8080A0;transition:all 0.2s" onmouseover="this.style.color=\'#e74c3c\';this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.color=\'#8080A0\';this.style.background=\'none\'" title="Report post"><i class="fas fa-flag"></i></button>' +
                    '<div style="position:relative" id="menu-anchor-' + post.id + '">' +
                        '<button onclick="showPostMenu(' + post.id + ',' + canMod + ',\'community\')" style="background:none;border:none;font-size:14px;cursor:pointer;padding:6px 10px;border-radius:6px;color:#8080A0;transition:all 0.2s" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-ellipsis-h"></i></button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            // Reply container (hidden by default)
            '<div id="replies-' + post.id + '" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.04)"></div>' +
        '</div>';
    }

    function hubLoadCommunityPosts() {
        var container = document.getElementById('hub-community-posts');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#8080A0"><i class="fas fa-spinner fa-spin"></i> Loading discussions...</div>';
        apiFetch('/posts?feed=community&limit=20').then(function(posts) {
            if (!posts || posts.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:40px;color:#8080A0"><i class="fas fa-comments" style="font-size:32px;display:block;margin-bottom:12px"></i><p>No discussions yet</p><small>Be the first to start a conversation!</small></div>';
                return;
            }
            var html = '';
            posts.forEach(function(post) { html += hubRenderPost(post); });
            container.innerHTML = html;
            observeStegoCanvases(container);
        }).catch(function() {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#8080A0"><i class="fas fa-exclamation-triangle"></i> Could not load discussions</div>';
        });
    }

    window.hubSubmitCommunityPost = function() {
        var body = document.getElementById('hub-community-body').value.trim();
        var category = document.getElementById('hub-community-category').value;
        var city = document.getElementById('hub-community-city') ? document.getElementById('hub-community-city').value.trim() : '';
        if (!body) { showToast('Please write something before posting.', true); return; }
        var btn = document.getElementById('hub-community-submit');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';
        apiFetch('/posts', {
            method: 'POST',
            body: JSON.stringify({ title: body.substring(0, 80), body: body, category: category, city: city || null, feed: 'community' })
        }).then(function(data) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Post';
            if (data && data.type === 'full_name_detected') {
                showFullNameBlockModal(data.names, data.suggestion);
                return;
            }
            if (data && data.error) { showToast(data.error, true); return; }
            document.getElementById('hub-community-body').value = '';
            if (document.getElementById('hub-community-city')) document.getElementById('hub-community-city').value = '';
            if (document.getElementById('hub-community-category')) document.getElementById('hub-community-category').value = 'general';
            showToast('Post shared!');
            hubLoadCommunityPosts();
        }).catch(function() {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Post';
            showToast('Failed to submit post.', true);
        });
    };

    // ==================== FULL NAME BLOCK MODAL ====================
    window.showFullNameBlockModal = function(names, suggestion) {
        var existing = document.getElementById('fullname-block-modal');
        if (existing) existing.remove();
        var nameList = (names || []).map(function(n) { return '<strong style="color:#E8A0B5">' + n + '</strong>'; }).join(', ');
        var modal = document.createElement('div');
        modal.id = 'fullname-block-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;';
        modal.innerHTML = '<div style="background:#22223A;border-radius:16px;padding:32px;max-width:440px;width:100%;text-align:center;border:1px solid rgba(232,160,181,0.2)">'
            + '<div style="font-size:48px;margin-bottom:16px">&#9888;&#65039;</div>'
            + '<h3 style="color:#fff;font-size:20px;margin-bottom:12px">Full Name Detected</h3>'
            + '<p style="color:#C8C8E0;font-size:14px;line-height:1.6;margin-bottom:16px">Your post contains a full name: ' + nameList + '</p>'
            + '<p style="color:#C8C8E0;font-size:14px;line-height:1.6;margin-bottom:8px">To protect privacy, please use <strong style="color:#E8A0B5">first name + last initial</strong> instead.</p>'
            + (suggestion ? '<div style="background:#1A1A2E;border-radius:10px;padding:12px;margin:16px 0;border-left:3px solid #E8A0B5;text-align:left"><span style="color:#8080A0;font-size:12px;display:block;margin-bottom:4px">Suggested edit:</span><span style="color:#fff;font-size:14px">' + suggestion + '</span></div>' : '')
            + '<p style="color:#8080A0;font-size:12px;margin-bottom:20px">Read our <a href="/guidelines" style="color:#E8A0B5" target="_blank">Community Guidelines</a> for more info.</p>'
            + '<div style="display:flex;gap:10px;justify-content:center">'
            + '<button onclick="document.getElementById(\'fullname-block-modal\').remove()" style="background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;border:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">Edit My Post</button>'
            + '<button onclick="document.getElementById(\'fullname-block-modal\').remove();var ta=document.getElementById(\'hub-community-body\');if(ta)ta.value=\'\'" style="background:rgba(255,255,255,0.06);color:#C8C8E0;border:1px solid rgba(255,255,255,0.1);padding:12px 24px;border-radius:10px;font-size:14px;font-weight:500;cursor:pointer;font-family:Inter,sans-serif">Cancel Post</button>'
            + '</div></div>';
        document.body.appendChild(modal);
    };

    // ==================== REFER A GOOD ONE ====================
    var referralPhotoData = null;

    window.handleReferralPhoto = function(input) {
        if (input.files && input.files[0]) {
            var file = input.files[0];
            if (file.size > 5 * 1024 * 1024) {
                showToast('Photo must be under 5MB', true);
                input.value = '';
                return;
            }
            var reader = new FileReader();
            reader.onload = function(e) {
                addWatermark(e.target.result, function(watermarked) {
                    referralPhotoData = watermarked;
                    var preview = document.getElementById('hub-referral-photo-preview');
                    var img = document.getElementById('hub-referral-photo-img');
                    if (img) img.src = watermarked;
                    if (preview) preview.style.display = 'inline-block';
                });
            };
            reader.readAsDataURL(file);
        }
    };

    window.removeReferralPhoto = function() {
        referralPhotoData = null;
        var preview = document.getElementById('hub-referral-photo-preview');
        var input = document.getElementById('hub-referral-photo');
        if (preview) preview.style.display = 'none';
        if (input) input.value = '';
    };

    function hubRenderReferral(post) {
        var authorName = post.author_name || 'Anonymous';
        var initial = authorName[0].toUpperCase();
        var avatarColor = hubGetAvatarColor(authorName);
        var personName = post.title || 'Unknown';
        var replyCount = post.reply_count || 0;
        var likeCount = parseInt(post.like_count) || 0;
        var dislikeCount = parseInt(post.dislike_count) || 0;
        var bumpCount = parseInt(post.bump_count) || 0;
        var userLiked = post.user_liked === true || post.user_liked === 't';
        var userDisliked = post.user_disliked === true || post.user_disliked === 't';
        var userBumped = post.user_bumped === true || post.user_bumped === 't';
        var canMod = canModifyPost(post);

        return '<div id="post-' + post.id + '" style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin-bottom:12px">' +
            '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
                '<div style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;flex-shrink:0;background:' + avatarColor + '">' + initial + '</div>' +
                '<div>' +
                    '<div style="font-weight:600;font-size:14px;color:#fff">' + escapeHtmlSafe(authorName) + getPlusBadgeHtml(post.author_tier) + '</div>' +
                    '<div style="font-size:11px;color:#2ecc71"><i class="fas fa-star"></i> Recommender</div>' +
                '</div>' +
            '</div>' +
            '<div style="background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.15);border-radius:10px;padding:14px;margin-bottom:12px">' +
                '<div style="font-size:18px;font-weight:700;color:#2ecc71">' + escapeHtmlSafe(personName) + '</div>' +
                (post.city ? '<span style="font-size:11px;color:#8080A0;background:#141428;padding:2px 8px;border-radius:20px;margin-top:6px;display:inline-block">' + escapeHtmlSafe(post.city) + '</span>' : '') +
            '</div>' +
            (post.image_url ? '<div style="margin-bottom:12px;position:relative"><canvas data-stego-src="' + escapeHtmlSafe(post.image_url) + '" style="width:100%;max-height:300px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,0.06);opacity:0;transition:opacity 0.3s;display:block"></canvas><div class="stego-spinner" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#8080A0;font-size:12px"><i class="fas fa-spinner fa-spin"></i></div></div>' : '') +
            '<div data-post-body style="font-size:14px;line-height:1.6;color:#ccc;font-style:italic;margin-bottom:12px">"' + escapeHtmlSafe(post.body) + '"</div>' +
            // Ask About Him button
            (post.user_id ? '<div style="margin-bottom:12px"><button onclick="hubContactPoster(' + post.user_id + ', \'' + escapeHtmlSafe(authorName).replace(/'/g, "\\'") + '\')" style="background:linear-gradient(135deg,#E8A0B5,#C77DBA);color:#fff;border:none;padding:8px 16px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px"><i class="fas fa-envelope"></i> Ask About Him</button></div>' : '') +
            // Unified action bar
            '<div style="display:flex;align-items:center;gap:4px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04)">' +
                '<button id="like-btn-' + post.id + '" onclick="votePost(' + post.id + ',\'like\')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;transition:all 0.2s;color:' + (userLiked ? '#E8A0B5' : '#8080A0') + '" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="' + (userLiked ? 'fas' : 'far') + ' fa-thumbs-up"></i> <span id="like-count-' + post.id + '">' + likeCount + '</span></button>' +
                '<button id="dislike-btn-' + post.id + '" onclick="votePost(' + post.id + ',\'dislike\')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;transition:all 0.2s;color:' + (userDisliked ? '#E8A0B5' : '#8080A0') + '" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="' + (userDisliked ? 'fas' : 'far') + ' fa-thumbs-down"></i> <span id="dislike-count-' + post.id + '">' + dislikeCount + '</span></button>' +
                '<button onclick="toggleReplies(' + post.id + ')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;transition:all 0.2s;color:#8080A0" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-comment"></i> <span id="reply-count-' + post.id + '">' + replyCount + '</span></button>' +
                '<button id="bump-btn-' + post.id + '" onclick="bumpPost(' + post.id + ')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;transition:all 0.2s;color:' + (userBumped ? '#E8A0B5' : '#8080A0') + '" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-arrow-up"></i> <span id="bump-count-' + post.id + '">' + bumpCount + '</span></button>' +
                '<div style="margin-left:auto;display:flex;align-items:center;gap:2px">' +
                    (canMod ? '<button onclick="deletePost(' + post.id + ',\'referral\')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;color:#8080A0;transition:all 0.2s" onmouseover="this.style.color=\'#e74c3c\';this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.color=\'#8080A0\';this.style.background=\'none\'" title="Delete post"><i class="fas fa-trash-alt"></i></button>' : '') +
                    '<button onclick="showReportModal(' + post.id + ')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;color:#8080A0;transition:all 0.2s" onmouseover="this.style.color=\'#e74c3c\';this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.color=\'#8080A0\';this.style.background=\'none\'" title="Report post"><i class="fas fa-flag"></i></button>' +
                    '<div style="position:relative" id="menu-anchor-' + post.id + '">' +
                        '<button onclick="showPostMenu(' + post.id + ',' + canMod + ',\'referral\')" style="background:none;border:none;font-size:14px;cursor:pointer;padding:6px 10px;border-radius:6px;color:#8080A0;transition:all 0.2s" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-ellipsis-h"></i></button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            // Reply container (hidden by default)
            '<div id="replies-' + post.id + '" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.04)"></div>' +
        '</div>';
    }

    function hubLoadReferralPosts() {
        var container = document.getElementById('hub-referral-posts');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#8080A0"><i class="fas fa-spinner fa-spin"></i> Loading referrals...</div>';
        apiFetch('/posts?feed=referral&limit=20').then(function(posts) {
            if (!posts || posts.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:40px;color:#8080A0"><i class="fas fa-heart" style="font-size:32px;display:block;margin-bottom:12px"></i><p>No referrals yet</p><small>Be the first to recommend a good guy!</small></div>';
                return;
            }
            var html = '';
            posts.forEach(function(post) { html += hubRenderReferral(post); });
            container.innerHTML = html;
            observeStegoCanvases(container);
        }).catch(function() {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#8080A0"><i class="fas fa-exclamation-triangle"></i> Could not load referrals</div>';
        });
    }

    window.hubSubmitReferral = function() {
        var name = document.getElementById('hub-referral-name').value.trim();
        var city = document.getElementById('hub-referral-city') ? document.getElementById('hub-referral-city').value.trim() : '';
        var relation = document.getElementById('hub-referral-relation') ? document.getElementById('hub-referral-relation').value : '';
        var body = document.getElementById('hub-referral-body').value.trim();
        if (!name || !body) { showToast('Please fill in the name and your recommendation.', true); return; }
        apiFetch('/posts', {
            method: 'POST',
            body: JSON.stringify({ title: name, body: body + (relation && relation !== 'How do you know him?' ? ' [' + relation + ']' : ''), category: 'referral', city: city || null, feed: 'referral', image_url: referralPhotoData || null })
        }).then(function(data) {
            if (data && data.error) { showToast(data.error, true); return; }
            document.getElementById('hub-referral-name').value = '';
            if (document.getElementById('hub-referral-city')) document.getElementById('hub-referral-city').value = '';
            document.getElementById('hub-referral-body').value = '';
            if (document.getElementById('hub-referral-relation')) document.getElementById('hub-referral-relation').selectedIndex = 0;
            removeReferralPhoto();
            showToast('Referral submitted!');
            hubLoadReferralPosts();
        }).catch(function() {
            showToast('Failed to submit referral.', true);
        });
    };

    window.hubContactPoster = function(posterId, posterName) {
        var modal = document.createElement('div');
        modal.className = 'dc-share-modal';
        modal.id = 'hub-contact-modal';
        modal.innerHTML =
            '<div class="dc-share-modal-content">' +
                '<h3 style="color:#fff;margin-bottom:16px"><i class="fas fa-envelope" style="color:#E8A0B5"></i> Ask About Him</h3>' +
                '<p style="color:#8080A0;font-size:13px;margin-bottom:12px">Send a message to <strong style="color:#fff">' + escapeHtmlSafe(posterName) + '</strong> about their referral.</p>' +
                '<div class="dc-form-group">' +
                    '<textarea id="hub-contact-message" rows="4" placeholder="Hi! I saw your referral and would love to know more..." style="width:100%;padding:12px;background:#2A2A44;border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;font-size:14px;resize:vertical;font-family:inherit"></textarea>' +
                '</div>' +
                '<button id="hub-contact-send-btn" class="dc-btn dc-btn-primary" onclick="hubSendContactMessage(' + posterId + ', \'' + escapeHtmlSafe(posterName).replace(/'/g, "\\'") + '\')"><i class="fas fa-paper-plane"></i> Send Message</button>' +
                '<button class="dc-btn dc-btn-outline" style="margin-top:8px" onclick="document.getElementById(\'hub-contact-modal\').remove()"><i class="fas fa-times"></i> Cancel</button>' +
            '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    };

    window.hubSendContactMessage = function(posterId, posterName) {
        var textarea = document.getElementById('hub-contact-message');
        var content = textarea.value.trim();
        if (!content) { showToast('Please type a message.', true); return; }

        var btn = document.getElementById('hub-contact-send-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        apiFetch('/messages', {
            method: 'POST',
            body: JSON.stringify({ recipient_id: posterId, content: content })
        }).then(function(data) {
            if (data && (data.message || data.id)) {
                showToast('Message sent to ' + posterName + '!');
                var modal = document.getElementById('hub-contact-modal');
                if (modal) modal.remove();
            } else {
                showToast((data && data.error) || 'Failed to send message', true);
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';
            }
        }).catch(function() {
            showToast('Failed to send message.', true);
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';
        });
    };

    // ==================== POST EDIT / DELETE ====================
    function reloadFeed(feed) {
        if (feed === 'community') hubLoadCommunityPosts();
        else if (feed === 'referral') hubLoadReferralPosts();
    }

    window.deletePost = function(postId, feed) {
        if (!confirm('Are you sure you want to delete this post?')) return;
        apiFetch('/posts/' + postId, { method: 'DELETE' }).then(function(data) {
            if (data && data.message) {
                showToast('Post deleted');
                reloadFeed(feed);
            } else {
                showToast((data && data.error) || 'Failed to delete post', true);
            }
        }).catch(function() { showToast('Failed to delete post', true); });
    };

    window.editPost = function(postId, currentBody, feed) {
        var modal = document.createElement('div');
        modal.className = 'dc-share-modal';
        modal.id = 'edit-post-modal';
        modal.innerHTML =
            '<div class="dc-share-modal-content">' +
                '<h3 style="color:#fff;margin-bottom:16px"><i class="fas fa-pencil-alt" style="color:#E8A0B5"></i> Edit Post</h3>' +
                '<textarea id="edit-post-body" rows="6" style="width:100%;padding:12px;background:#2A2A44;border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;font-size:14px;resize:vertical;font-family:inherit">' + escapeHtmlSafe(currentBody) + '</textarea>' +
                '<button id="edit-post-save-btn" class="dc-btn dc-btn-primary" style="margin-top:12px" onclick="saveEditPost(' + postId + ', \'' + feed + '\')"><i class="fas fa-check"></i> Save Changes</button>' +
                '<button class="dc-btn dc-btn-outline" style="margin-top:8px" onclick="document.getElementById(\'edit-post-modal\').remove()"><i class="fas fa-times"></i> Cancel</button>' +
            '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    };

    window.saveEditPost = function(postId, feed) {
        var body = document.getElementById('edit-post-body').value.trim();
        if (!body) { showToast('Post cannot be empty', true); return; }
        var btn = document.getElementById('edit-post-save-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        apiFetch('/posts/' + postId, {
            method: 'PUT',
            body: JSON.stringify({ title: body.substring(0, 60), body: body })
        }).then(function(data) {
            if (data && data.message) {
                showToast('Post updated');
                var modal = document.getElementById('edit-post-modal');
                if (modal) modal.remove();
                reloadFeed(feed);
            } else {
                showToast((data && data.error) || 'Failed to update post', true);
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> Save Changes';
            }
        }).catch(function() {
            showToast('Failed to update post', true);
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Save Changes';
        });
    };

    // ==================== INVITE & EARN (Growth Referral) ====================
    window.loadGrowReferral = function() {
        apiFetch('/referral').then(function(data) {
            if (!data) return;
            renderGrowReferral(data);
        }).catch(function(err) {
            console.error('Error loading referral data:', err);
        });
    };

    function renderGrowReferral(data) {
        var urlEl = document.getElementById('grow-share-url');
        if (urlEl && data.shareUrl) urlEl.value = data.shareUrl;

        var countEl = document.getElementById('grow-ref-count');
        if (countEl) countEl.textContent = data.count || 0;

        var count = data.referralCount || data.count || 0;
        var progressBar = document.getElementById('grow-progress-bar');
        var progressText = document.getElementById('grow-progress-text');
        if (progressBar) progressBar.style.width = Math.min(100, (count / 5) * 100) + '%';
        if (progressText) progressText.textContent = count + ' / 5';

        var dots = document.querySelectorAll('.grow-dot');
        dots.forEach(function(dot, i) {
            dot.style.background = i < count ? '#E8A0B5' : '#333';
        });

        var rewardIcon = document.getElementById('grow-reward-icon');
        var rewardSubtitle = document.getElementById('grow-reward-subtitle');
        var claimBtn = document.getElementById('grow-claim-btn');
        var claimedBanner = document.getElementById('grow-claimed-banner');
        var claimedDetail = document.getElementById('grow-claimed-detail');

        if (data.rewardClaimed) {
            if (rewardIcon) { rewardIcon.className = 'fas fa-check-circle'; rewardIcon.style.color = '#2ecc71'; }
            if (rewardSubtitle) rewardSubtitle.textContent = 'You claimed your free month!';
            if (claimBtn) claimBtn.style.display = 'none';
            if (claimedBanner) {
                claimedBanner.style.display = 'block';
                if (data.rewardExpiresAt && claimedDetail) {
                    var exp = new Date(data.rewardExpiresAt);
                    var daysLeft = Math.max(0, Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24)));
                    claimedDetail.textContent = daysLeft + ' days of SafeTea+ remaining';
                }
            }
        } else if (data.rewardReady) {
            if (rewardIcon) { rewardIcon.className = 'fas fa-gift'; rewardIcon.style.color = '#f27059'; }
            if (rewardSubtitle) rewardSubtitle.textContent = 'You did it! Claim your free month now.';
            if (claimBtn) claimBtn.style.display = 'inline-block';
            if (claimedBanner) claimedBanner.style.display = 'none';
        } else {
            var needed = 5 - count;
            if (rewardIcon) { rewardIcon.className = 'fas fa-gift'; rewardIcon.style.color = '#E8A0B5'; }
            if (rewardSubtitle) rewardSubtitle.textContent = needed + ' more friend' + (needed !== 1 ? 's' : '') + ' needed to unlock';
            if (claimBtn) claimBtn.style.display = 'none';
            if (claimedBanner) claimedBanner.style.display = 'none';
        }

        var totalStat = document.getElementById('grow-total-stat');
        var totalBrought = document.getElementById('grow-total-brought');
        if (count > 0 && totalStat) {
            totalStat.style.display = 'block';
            if (totalBrought) totalBrought.innerHTML = '<i class="fas fa-users"></i> Total women you\'ve brought in: <strong>' + count + '</strong>';
        }

        var friendsList = document.getElementById('grow-friends-list');
        if (data.referrals && data.referrals.length > 0 && friendsList) {
            friendsList.innerHTML = data.referrals.map(function(r) {
                var joinDate = new Date(r.created_at).toLocaleDateString();
                var rInitial = (r.display_name || 'U').charAt(0).toUpperCase();
                return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04)">'
                    + '<div style="width:32px;height:32px;border-radius:50%;background:rgba(232,160,181,0.15);color:#E8A0B5;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">' + rInitial + '</div>'
                    + '<div style="flex:1"><div style="font-size:13px;color:#fff">' + (r.display_name || 'Anonymous') + '</div>'
                    + '<div style="font-size:11px;color:#8080A0">Joined ' + joinDate + '</div></div></div>';
            }).join('');
        } else if (friendsList) {
            friendsList.innerHTML = '<div style="text-align:center;padding:20px;color:#8080A0;font-size:13px">No referrals yet. Share your link to get started!</div>';
        }
    }

    window.claimGrowReward = function() {
        var btn = document.getElementById('grow-claim-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Claiming...'; }
        apiFetch('/referral', {
            method: 'POST',
            body: JSON.stringify({ action: 'claim' })
        }).then(function(data) {
            if (data && data.success) {
                showToast('Reward claimed! Enjoy 1 month of free SafeTea+!');
                loadGrowReferral();
                apiFetch('/auth/me').then(function(d) {
                    if (d && d.user) {
                        localStorage.setItem(USER_KEY, JSON.stringify(d.user));
                    }
                }).catch(function() {});
            } else {
                showToast((data && data.error) || 'Could not claim reward', true);
                if (btn) { btn.disabled = false; btn.textContent = 'Claim'; }
            }
        }).catch(function() {
            showToast('Error claiming reward', true);
            if (btn) { btn.disabled = false; btn.textContent = 'Claim'; }
        });
    };

    window.copyReferralLink = function() {
        var urlEl = document.getElementById('grow-share-url');
        if (urlEl && urlEl.value && urlEl.value !== 'Loading...') {
            navigator.clipboard.writeText(urlEl.value).then(function() {
                showToast('Link copied!');
            }).catch(function() {
                urlEl.select();
                document.execCommand('copy');
                showToast('Link copied!');
            });
        }
    };

    window.shareReferralSMS = function() {
        var urlEl = document.getElementById('grow-share-url');
        if (urlEl && urlEl.value) {
            var msg = 'Hey! Check out SafeTea \u2014 it helps women stay safe while dating. Join my community: ' + urlEl.value;
            var isMob = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            if (isMob) {
                window.open('sms:?&body=' + encodeURIComponent(msg));
            } else if (navigator.share) {
                navigator.share({ title: 'SafeTea', text: msg, url: urlEl.value }).catch(function() {});
            } else {
                navigator.clipboard.writeText(msg).then(function() { showToast('Message copied! Paste in your messaging app.'); });
            }
        }
    };

    window.shareReferralNative = function() {
        var urlEl = document.getElementById('grow-share-url');
        if (urlEl && urlEl.value && navigator.share) {
            navigator.share({
                title: 'SafeTea - Date Smarter. Stay Safer.',
                text: 'Join SafeTea \u2014 a private community where women protect each other in the dating world.',
                url: urlEl.value
            }).catch(function() {});
        } else {
            copyReferralLink();
        }
    };

    // ==================== DID YOU KNOW ====================
    var DID_YOU_KNOW_FACTS = [
        // Violence & safety stats
        { fact: '1 in 3 women worldwide have experienced physical or sexual violence.', source: 'World Health Organization' },
        { fact: '57% of women who have been murdered were killed by a current or former intimate partner.', source: 'CDC' },
        { fact: 'Women are 5 times more likely than men to experience intimate partner violence.', source: 'Bureau of Justice Statistics' },
        { fact: 'On average, more than 3 women are murdered by their husbands or boyfriends every day in the U.S.', source: 'Bureau of Justice Statistics' },
        { fact: '1 in 4 women will experience domestic violence in their lifetime.', source: 'NCADV' },
        { fact: 'Nearly half of all women in the US have experienced some form of sexual violence.', source: 'CDC NISVS' },
        { fact: 'Intimate partner violence accounts for 15% of all violent crime in the U.S.', source: 'Bureau of Justice Statistics' },
        { fact: 'Women experience 2 million injuries from intimate partner violence each year in the U.S.', source: 'CDC' },
        { fact: 'Only 12% of sexual assaults are reported to police.', source: 'RAINN' },
        { fact: 'On average, it takes a victim 7 attempts to leave an abusive relationship before they leave for good.', source: 'National Domestic Violence Hotline' },
        { fact: 'Every 68 seconds, an American is sexually assaulted.', source: 'RAINN' },
        { fact: 'Women ages 18-24 are most commonly abused by an intimate partner.', source: 'Bureau of Justice Statistics' },
        { fact: '72% of all murder-suicides involve an intimate partner; 94% of the victims are women.', source: 'Violence Policy Center' },
        { fact: 'Stalking affects 1 in 6 women at some point in their lives — compared to 1 in 19 men.', source: 'Bureau of Justice Statistics' },
        { fact: 'Nearly 3 out of 4 stalking victims know their stalker in some capacity.', source: 'Bureau of Justice Statistics' },
        { fact: 'Women are 70% more likely to experience violence on a first date than men.', source: 'Journal of Interpersonal Violence' },
        { fact: '43% of dating college women reported experiencing violent and abusive dating behaviors.', source: 'Liz Claiborne Inc. Study' },
        { fact: 'Domestic violence is the leading cause of injury to women between the ages of 15 and 44.', source: 'U.S. Surgeon General' },
        { fact: '10 million people are physically abused by an intimate partner every year in the U.S.', source: 'NCADV' },
        { fact: 'Women who are abused are 8 times more likely to be killed if there is a firearm in the home.', source: 'American Journal of Public Health' },
        { fact: 'Over 20,000 calls are placed to domestic violence hotlines daily in the U.S.', source: 'NNEDV' },
        { fact: '1 in 7 women has been stalked by an intimate partner to the point of feeling very fearful.', source: 'CDC NISVS' },
        { fact: '38 million U.S. women have experienced intimate partner physical violence in their lifetime.', source: 'CDC NISVS' },
        { fact: 'Homicide is the 5th leading cause of death for women ages 20-44 in the U.S.', source: 'CDC WISQARS' },
        { fact: 'Digital abuse is the most common form of dating abuse among young people.', source: 'Love Is Respect' },
        { fact: 'Having a safety plan can reduce risk of injury by 60%.', source: 'Journal of Interpersonal Violence' },
        { fact: 'Sharing date details with a friend before meeting someone new is the #1 safety tip from law enforcement.', source: 'National Crime Prevention Council' },
        { fact: 'Abusers who strangle their partners are 10 times more likely to eventually kill them.', source: 'Journal of Emergency Medicine' },
        { fact: 'Women experience about 4.8 million intimate partner-related physical assaults per year.', source: 'CDC' },
        { fact: '1 in 5 women has been the victim of attempted or completed rape in her lifetime.', source: 'CDC NISVS' },
        // Dating safety tips
        { fact: 'Always meet a first date in a public place — never at your home or theirs.', source: 'National Sexual Violence Resource Center' },
        { fact: 'Trust your gut: women who acted on early warning signs were 3x less likely to be victimized.', source: 'The Gift of Fear, Gavin de Becker' },
        { fact: 'Love bombing — excessive flattery and attention early on — is the #1 predictor of future emotional abuse.', source: 'Journal of Personality and Social Psychology' },
        { fact: '53% of online daters admit to lying on their profile. Reverse-image search photos before meeting.', source: 'Pew Research Center' },
        { fact: 'Sharing your live location with a trusted friend during dates can be a lifesaver — literally.', source: 'National Crime Prevention Council' },
        { fact: 'If someone pressures you to move off a dating app to text immediately, it can be a red flag for controlling behavior.', source: 'Love Is Respect' },
        { fact: 'Coercive control — isolation, monitoring, and manipulation — is now a criminal offense in many states.', source: 'National Network to End Domestic Violence' },
        { fact: '85% of domestic violence victims return to their abuser at least once. Support, don\'t judge.', source: 'National Domestic Violence Hotline' },
        { fact: 'Financial abuse occurs in 99% of domestic violence cases — it\'s the #1 reason victims stay.', source: 'National Network to End Domestic Violence' },
        { fact: 'A person who disrespects your boundaries on small things will likely disrespect them on big things too.', source: 'Love Is Respect' },
        // Technology & digital safety
        { fact: 'Nearly 1 in 4 young adults has had a partner check their phone without permission.', source: 'Pew Research Center' },
        { fact: 'Stalkerware — hidden tracking apps — is installed on an estimated 1 million phones in the U.S. each year.', source: 'Coalition Against Stalkerware' },
        { fact: 'Disable location metadata on your photos before sharing them with someone you don\'t fully trust.', source: 'Electronic Frontier Foundation' },
        { fact: '70% of catfishing victims report emotional or financial harm. Always verify who you\'re talking to.', source: 'FBI Internet Crime Report' },
        { fact: 'Image-based abuse ("revenge porn") is a crime in 48 states and the District of Columbia.', source: 'Cyber Civil Rights Initiative' },
        { fact: 'Sextortion scams increased 300% from 2021 to 2023. Never share intimate images with someone you haven\'t met.', source: 'FBI IC3 Report' },
        // Empowerment & resources
        { fact: 'The National Domestic Violence Hotline is available 24/7: call 1-800-799-7233 or text START to 88788.', source: 'NDVH' },
        { fact: 'Safety planning is the single most effective tool for reducing harm. SafeTea\'s Date Check-In is your digital safety plan.', source: 'SafeTea' },
        { fact: 'You are never responsible for someone else\'s abusive behavior — no matter what they tell you.', source: 'National Domestic Violence Hotline' },
        { fact: 'Communities that talk openly about dating violence see 40% higher reporting rates and faster interventions.', source: 'Journal of Community Psychology' },
        { fact: 'Background checks can reveal undisclosed criminal history — 1 in 8 online daters has a prior record.', source: 'Journal of Forensic Sciences' },
        { fact: 'Women who use safety apps report feeling 60% more confident going on dates.', source: 'Dating Safety Alliance Survey' }
    ];

    function initDidYouKnow() {
        // Rotate every 6 hours (21600000 ms)
        var sixHourIndex = Math.floor(Date.now() / 21600000) % DID_YOU_KNOW_FACTS.length;
        var item = DID_YOU_KNOW_FACTS[sixHourIndex];

        // Community tab version
        var factEl = document.getElementById('dyk-fact');
        var sourceEl = document.getElementById('dyk-source');
        if (factEl) factEl.textContent = item.fact;
        if (sourceEl) sourceEl.textContent = 'Source: ' + item.source;

        // Home page version
        var homeFact = document.getElementById('home-dyk-fact');
        var homeSource = document.getElementById('home-dyk-source');
        if (homeFact) homeFact.textContent = item.fact;
        if (homeSource) homeSource.textContent = 'Source: ' + item.source;
    }

    // ============ INIT ============
    loadProfile();
    loadVerificationStatus();
    loadWatchZones();
    initAlertsTab();
    updateInboxBadge();
    loadSubscriptionStatus();
    initDidYouKnow();
    if (typeof initRecordProtect === 'function') initRecordProtect();

    // Handle Stripe checkout success redirect
    // ==================== SORORITY ROOMS ====================
    var currentRoomId = null;
    var currentRoomData = null;
    var currentRoomFeedType = 'tea_talk';

    window.initSororityRooms = function() {
        loadMyRooms();
    };

    function loadMyRooms() {
        var container = document.getElementById('sr-my-rooms');
        var emptyState = document.getElementById('sr-empty-state');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#8080A0"><i class="fas fa-spinner fa-spin"></i> Loading your rooms...</div>';
        if (emptyState) emptyState.style.display = 'none';

        apiFetch('/rooms/my-rooms').then(function(data) {
            if (!data || !data.rooms || data.rooms.length === 0) {
                container.innerHTML = '';
                if (emptyState) emptyState.style.display = 'block';
                return;
            }
            if (emptyState) emptyState.style.display = 'none';
            var html = '';
            data.rooms.forEach(function(room) {
                var pendingBadge = (room.my_role === 'admin' || room.my_role === 'co_admin') && parseInt(room.pending_count) > 0
                    ? '<span style="background:#e74c3c;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:8px">' + room.pending_count + ' pending</span>'
                    : '';
                var roleBadge = room.my_role === 'admin' ? '<span style="color:#f39c12;font-size:10px;font-weight:600;margin-left:6px"><i class="fas fa-crown"></i> Admin</span>' :
                    room.my_role === 'co_admin' ? '<span style="color:#9b59b6;font-size:10px;font-weight:600;margin-left:6px"><i class="fas fa-star"></i> Co-Admin</span>' : '';
                html += '<div onclick="openRoom(' + room.id + ')" style="display:flex;align-items:center;gap:14px;background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:16px 18px;margin-bottom:10px;cursor:pointer;transition:all 0.2s" onmouseover="this.style.transform=\'translateY(-1px)\';this.style.borderColor=\'rgba(155,89,182,0.3)\'" onmouseout="this.style.transform=\'none\';this.style.borderColor=\'rgba(255,255,255,0.06)\'">' +
                    '<div style="width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#fff;background:linear-gradient(135deg,' + (room.color_primary || '#9b59b6') + ',' + (room.color_secondary || '#8e44ad') + ');flex-shrink:0">' + escapeHtmlSafe(room.greek_letters) + '</div>' +
                    '<div style="flex:1;min-width:0">' +
                        '<div style="font-weight:600;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtmlSafe(room.name) + roleBadge + pendingBadge + '</div>' +
                        '<div style="font-size:12px;color:#8080A0;margin-top:2px">' + (room.chapter || room.university || room.scope) + ' &middot; ' + room.member_count + ' ' + (room.member_count == 1 ? 'member' : 'members') + '</div>' +
                    '</div>' +
                    '<i class="fas fa-chevron-right" style="color:#8080A0;font-size:14px;flex-shrink:0"></i>' +
                '</div>';
            });
            container.innerHTML = html;
        }).catch(function() {
            container.innerHTML = '<p style="color:#e74c3c;font-size:13px;text-align:center">Failed to load rooms.</p>';
        });
    }

    window.openRoom = function(roomId) {
        currentRoomId = roomId;
        currentRoomFeedType = 'tea_talk';
        switchHubTab('roomview');
    };

    function loadRoomView() {
        if (!currentRoomId) return;
        apiFetch('/rooms/details?id=' + currentRoomId).then(function(data) {
            if (!data || !data.room) { showToast('Room not found', true); return; }
            currentRoomData = data;
            var room = data.room;
            var myRole = data.myRole;

            // Header
            document.getElementById('rv-logo').textContent = room.greek_letters || '';
            document.getElementById('rv-logo').style.background = 'linear-gradient(135deg,' + (room.color_primary || '#9b59b6') + ',' + (room.color_secondary || '#8e44ad') + ')';
            document.getElementById('rv-name').textContent = room.name;
            document.getElementById('rv-chapter').textContent = [room.chapter, room.university].filter(Boolean).join(' — ') || '';
            document.getElementById('rv-member-count').innerHTML = '<i class="fas fa-users"></i> ' + data.memberCount + ' ' + (data.memberCount == 1 ? 'member' : 'members');
            var scopeLabels = { chapter: 'Chapter', university: 'University', regional: 'Regional', national: 'National' };
            document.getElementById('rv-scope').innerHTML = '<i class="fas fa-globe"></i> ' + (scopeLabels[room.scope] || 'Chapter');

            // Info panel
            document.getElementById('rv-description').textContent = room.description || 'No description set.';
            document.getElementById('rv-invite-code').value = room.invite_code;

            // Members list
            var membersHtml = '<h4 style="color:#fff;font-size:13px;margin-bottom:10px"><i class="fas fa-users" style="color:#9b59b6"></i> Members (' + data.members.length + ')</h4>';
            data.members.slice(0, 20).forEach(function(m) {
                var mBadge = m.role === 'admin' ? ' <i class="fas fa-crown" style="color:#f39c12;font-size:10px"></i>' : m.role === 'co_admin' ? ' <i class="fas fa-star" style="color:#9b59b6;font-size:10px"></i>' : '';
                membersHtml += '<div style="display:flex;align-items:center;gap:10px;padding:6px 0">' +
                    '<div style="width:28px;height:28px;border-radius:50%;background:' + hubGetAvatarColor(m.display_name || '') + ';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">' + (m.display_name || '?')[0].toUpperCase() + '</div>' +
                    '<span style="color:#ccc;font-size:13px">' + escapeHtmlSafe(m.display_name || 'Anonymous') + mBadge + '</span>' +
                '</div>';
            });
            if (data.members.length > 20) membersHtml += '<div style="color:#8080A0;font-size:12px;padding:4px 0">+ ' + (data.members.length - 20) + ' more</div>';
            document.getElementById('rv-members-list').innerHTML = membersHtml;

            // Admin panel
            var adminPanel = document.getElementById('rv-admin-panel');
            var leaveBtn = document.getElementById('rv-leave-btn');
            if (myRole === 'admin' || myRole === 'co_admin') {
                adminPanel.style.display = 'block';
                renderPendingMembers(data.pending);
                leaveBtn.style.display = myRole === 'admin' ? 'none' : 'block';
            } else {
                adminPanel.style.display = 'none';
                leaveBtn.style.display = 'block';
            }

            // Load feed
            switchRoomFeedTab(currentRoomFeedType);
        }).catch(function() {
            showToast('Failed to load room', true);
        });
    }

    function renderPendingMembers(pending) {
        var el = document.getElementById('rv-pending-list');
        if (!pending || pending.length === 0) {
            el.innerHTML = '<div style="color:#8080A0;font-size:12px">No pending requests.</div>';
            return;
        }
        var html = '<h5 style="color:#f39c12;font-size:12px;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px"><i class="fas fa-clock"></i> Pending Requests (' + pending.length + ')</h5>';
        pending.forEach(function(m) {
            html += '<div style="display:flex;align-items:center;gap:10px;background:rgba(241,196,15,0.06);border:1px solid rgba(241,196,15,0.15);border-radius:10px;padding:10px 12px;margin-bottom:8px">' +
                '<div style="width:32px;height:32px;border-radius:50%;background:' + hubGetAvatarColor(m.display_name || '') + ';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff">' + (m.display_name || '?')[0].toUpperCase() + '</div>' +
                '<div style="flex:1">' +
                    '<div style="color:#fff;font-size:13px;font-weight:500">' + escapeHtmlSafe(m.display_name || 'Anonymous') + '</div>' +
                    '<div style="color:#8080A0;font-size:11px">' + getTimeAgoFromDate(m.requested_at) + '</div>' +
                '</div>' +
                '<button onclick="roomMemberAction(' + m.membership_id + ',\'approve\')" style="background:#2ecc71;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif">Approve</button>' +
                '<button onclick="roomMemberAction(' + m.membership_id + ',\'deny\')" style="background:none;border:1px solid rgba(231,76,60,0.3);color:#e74c3c;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif">Deny</button>' +
            '</div>';
        });
        el.innerHTML = html;
    }

    window.switchRoomFeedTab = function(type) {
        currentRoomFeedType = type;
        var teaBtn = document.getElementById('rv-tab-tea');
        var goodBtn = document.getElementById('rv-tab-good');
        if (type === 'tea_talk') {
            teaBtn.style.background = '#9b59b6'; teaBtn.style.color = '#fff'; teaBtn.style.border = 'none';
            goodBtn.style.background = '#22223A'; goodBtn.style.color = '#8080A0'; goodBtn.style.border = '1px solid rgba(255,255,255,0.08)';
        } else {
            goodBtn.style.background = '#2ecc71'; goodBtn.style.color = '#fff'; goodBtn.style.border = 'none';
            teaBtn.style.background = '#22223A'; teaBtn.style.color = '#8080A0'; teaBtn.style.border = '1px solid rgba(255,255,255,0.08)';
        }
        loadRoomFeed();
    };

    function loadRoomFeed() {
        var container = document.getElementById('rv-feed');
        if (!container || !currentRoomId) return;
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#8080A0"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

        apiFetch('/rooms/feed?roomId=' + currentRoomId + '&type=' + currentRoomFeedType + '&limit=20').then(function(data) {
            if (!data || !data.posts || data.posts.length === 0) {
                var emptyIcon = currentRoomFeedType === 'tea_talk' ? 'fa-mug-hot' : 'fa-thumbs-up';
                var emptyText = currentRoomFeedType === 'tea_talk' ? 'No tea yet. Be the first to spill!' : 'No good guys posted yet.';
                container.innerHTML = '<div style="text-align:center;padding:40px;color:#8080A0"><i class="fas ' + emptyIcon + '" style="font-size:24px;display:block;margin-bottom:8px;color:#9b59b6"></i>' + emptyText + '</div>';
                return;
            }
            var html = '';
            data.posts.forEach(function(post) { html += roomRenderPost(post); });
            container.innerHTML = html;
            observeStegoCanvases(container);
        }).catch(function() {
            container.innerHTML = '<p style="color:#e74c3c;font-size:13px;text-align:center">Failed to load feed.</p>';
        });
    }

    // Room post photo state
    var rvPostPhotoData = null;

    window.rvHandlePostPhoto = function(input) {
        var file = input.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { showToast('Photo must be under 5MB', true); return; }
        var reader = new FileReader();
        reader.onload = function(e) {
            addWatermark(e.target.result, function(watermarked) {
                rvPostPhotoData = watermarked;
                var preview = document.getElementById('rv-post-photo-preview');
                var img = document.getElementById('rv-post-photo-img');
                if (preview && img) { img.src = watermarked; preview.style.display = 'inline-block'; }
            });
        };
        reader.readAsDataURL(file);
        input.value = '';
    };

    window.rvRemovePostPhoto = function() {
        rvPostPhotoData = null;
        var preview = document.getElementById('rv-post-photo-preview');
        if (preview) preview.style.display = 'none';
    };

    function roomRenderPost(post) {
        var authorName = post.author_name || 'Anonymous';
        var initial = authorName[0].toUpperCase();
        var avatarColor = hubGetAvatarColor(authorName);
        var likeCount = parseInt(post.like_count) || 0;
        var dislikeCount = parseInt(post.dislike_count) || 0;
        var replyCount = parseInt(post.reply_count) || 0;
        var bumpCount = parseInt(post.bump_count) || 0;
        var userReaction = post.user_reaction || null;
        var likeActive = userReaction === 'like';
        var dislikeActive = userReaction === 'dislike';
        var pinnedHtml = post.pinned ? '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;background:rgba(241,196,15,0.15);color:#f1c40f;margin-left:8px"><i class="fas fa-thumbtack"></i> Pinned</span>' : '';
        var typeBadge = post.type === 'good_guys'
            ? '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;background:rgba(46,204,113,0.15);color:#2ecc71">Good Guy</span> '
            : '';
        var u = getUser();
        var isAuthor = u && post.author_id === u.id;
        var isSafeTeaAdmin = u && (u.role === 'admin' || u.role === 'moderator');

        var imageHtml = '';
        if (post.image_data) {
            imageHtml = '<div style="margin-bottom:14px;position:relative"><canvas data-stego-src="' + post.image_data + '" style="max-width:100%;max-height:300px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);opacity:0;transition:opacity 0.3s;display:block"></canvas><div class="stego-spinner" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#8080A0;font-size:12px"><i class="fas fa-spinner fa-spin"></i></div></div>';
        }

        var bumpLabel = bumpCount > 0 ? ' ' + bumpCount : '';

        return '<div id="rp-' + post.id + '" style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px;margin-bottom:10px">' +
            '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">' +
                '<div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;flex-shrink:0;background:' + avatarColor + '">' + initial + '</div>' +
                '<div style="flex:1">' +
                    '<div style="font-weight:600;font-size:13px;color:#fff">' + escapeHtmlSafe(authorName) + ' ' + typeBadge + pinnedHtml + '</div>' +
                    '<div style="font-size:11px;color:#666;margin-top:1px">' + getTimeAgoFromDate(post.created_at) + '</div>' +
                '</div>' +
            '</div>' +
            '<div style="font-size:14px;line-height:1.6;color:#ccc;margin-bottom:14px">' + hubFormatBody(post.body) + '</div>' +
            imageHtml +
            '<div style="display:flex;align-items:center;gap:4px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04)">' +
                '<button onclick="roomReact(' + post.id + ',\'like\')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;transition:all 0.2s;color:' + (likeActive ? '#E8A0B5' : '#8080A0') + '" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="' + (likeActive ? 'fas' : 'far') + ' fa-thumbs-up"></i> <span id="rl-' + post.id + '">' + likeCount + '</span></button>' +
                '<button onclick="roomReact(' + post.id + ',\'dislike\')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;transition:all 0.2s;color:' + (dislikeActive ? '#E8A0B5' : '#8080A0') + '" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="' + (dislikeActive ? 'fas' : 'far') + ' fa-thumbs-down"></i> <span id="rd-' + post.id + '">' + dislikeCount + '</span></button>' +
                '<button onclick="roomShowReplies(' + post.id + ')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;transition:all 0.2s;color:#8080A0" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-comment"></i> ' + replyCount + '</button>' +
                '<button onclick="roomBumpPost(' + post.id + ')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;transition:all 0.2s;color:' + (bumpCount > 0 ? '#f39c12' : '#8080A0') + '" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'" title="Bump this post to the top"><i class="fas fa-arrow-up"></i> <span id="rb-' + post.id + '">' + bumpCount + '</span></button>' +
                '<div style="margin-left:auto;display:flex;align-items:center;gap:2px">' +
                    '<button onclick="roomReportPost(' + post.id + ')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:6px 10px;border-radius:6px;color:#8080A0;transition:all 0.2s" onmouseover="this.style.color=\'#e74c3c\';this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.color=\'#8080A0\';this.style.background=\'none\'" title="Report post"><i class="fas fa-flag"></i></button>' +
                    '<div style="position:relative" id="room-menu-anchor-' + post.id + '">' +
                        '<button onclick="showRoomPostMenu(' + post.id + ',' + isAuthor + ',' + isSafeTeaAdmin + ')" style="background:none;border:none;font-size:14px;cursor:pointer;padding:6px 10px;border-radius:6px;color:#8080A0;transition:all 0.2s" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-ellipsis-h"></i></button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div id="rr-' + post.id + '" style="display:none;margin-top:12px;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px"></div>' +
        '</div>';
    }

    window.roomReact = function(postId, reaction) {
        apiFetch('/rooms/like?postId=' + postId, {
            method: 'POST',
            body: JSON.stringify({ reaction: reaction })
        }).then(function(data) {
            if (!data) return;
            // Refresh the feed to reflect accurate counts
            loadRoomFeed();
        });
    };

    window.roomBumpPost = function(postId) {
        apiFetch('/rooms/bump?postId=' + postId, { method: 'POST' }).then(function(data) {
            if (data && data.success) {
                showToast('Post bumped!');
                loadRoomFeed();
            }
        });
    };

    // Three-dot menu for room posts (matches community post menu style)
    window.showRoomPostMenu = function(postId, isAuthor, isAdmin) {
        var existing = document.getElementById('room-post-menu-' + postId);
        if (existing) { existing.remove(); return; }
        document.querySelectorAll('[id^="room-post-menu-"]').forEach(function(m) { m.remove(); });

        var menuHtml = '<div id="room-post-menu-' + postId + '" style="position:absolute;right:0;top:24px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.1);border-radius:10px;min-width:180px;z-index:100;box-shadow:0 8px 24px rgba(0,0,0,0.4);overflow:hidden">';
        if (!isAuthor) {
            menuHtml += '<button onclick="roomReportPost(' + postId + ');document.getElementById(\'room-post-menu-' + postId + '\').remove()" style="display:block;width:100%;text-align:left;padding:12px 16px;background:none;border:none;color:#e74c3c;font-size:13px;cursor:pointer;font-family:inherit" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-flag" style="width:18px"></i> Report Post</button>';
        }
        if (isAdmin) {
            menuHtml += '<button onclick="roomPinPost(' + postId + ');document.getElementById(\'room-post-menu-' + postId + '\').remove()" style="display:block;width:100%;text-align:left;padding:12px 16px;background:none;border:none;color:#f1c40f;font-size:13px;cursor:pointer;font-family:inherit" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-thumbtack" style="width:18px"></i> Pin / Unpin</button>';
        }
        if (isAuthor || isAdmin) {
            menuHtml += '<button onclick="roomDeletePost(' + postId + ');document.getElementById(\'room-post-menu-' + postId + '\').remove()" style="display:block;width:100%;text-align:left;padding:12px 16px;background:none;border:none;color:#e74c3c;font-size:13px;cursor:pointer;font-family:inherit" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-trash" style="width:18px"></i> Delete Post</button>';
        }
        menuHtml += '</div>';

        var wrapper = document.getElementById('room-menu-anchor-' + postId);
        if (wrapper) {
            wrapper.innerHTML = menuHtml;
            setTimeout(function() {
                document.addEventListener('click', function closeRoomMenu(e) {
                    var menu = document.getElementById('room-post-menu-' + postId);
                    if (menu && !menu.contains(e.target) && !wrapper.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener('click', closeRoomMenu);
                    }
                });
            }, 10);
        }
    };

    // Styled report modal for room posts (matches community report modal)
    window.roomReportPost = function(postId) {
        var modal = document.createElement('div');
        modal.className = 'dc-share-modal';
        modal.id = 'room-report-modal';
        modal.innerHTML =
            '<div class="dc-share-modal-content" style="max-width:420px">' +
                '<h3 style="color:#fff;margin-bottom:4px"><i class="fas fa-flag" style="color:#e74c3c"></i> Report Post</h3>' +
                '<p style="color:#8080A0;font-size:13px;margin-bottom:20px">Help keep the room safe. Select a reason below.</p>' +
                '<div id="room-report-reasons" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">' +
                    roomReportReasonOption('inappropriate', 'Inappropriate Content') +
                    roomReportReasonOption('harassment', 'Harassment or Bullying') +
                    roomReportReasonOption('spam', 'Spam') +
                    roomReportReasonOption('doxxing', 'Doxxing / Sharing Private Info') +
                    roomReportReasonOption('misinformation', 'False Information') +
                    roomReportReasonOption('threat', 'Threats') +
                    roomReportReasonOption('other', 'Other') +
                '</div>' +
                '<textarea id="room-report-details" rows="3" placeholder="Additional details (optional)..." style="width:100%;padding:12px;background:#141428;border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;font-size:13px;resize:vertical;font-family:inherit;margin-bottom:16px"></textarea>' +
                '<button id="room-report-submit-btn" style="width:100%;padding:14px;background:linear-gradient(135deg,#e74c3c,#c0392b);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit" onclick="submitRoomReport(' + postId + ')"><i class="fas fa-flag"></i> Submit Report</button>' +
                '<button style="width:100%;margin-top:8px;padding:12px;background:rgba(255,255,255,0.06);color:#C8C8E0;border:1px solid rgba(255,255,255,0.1);border-radius:10px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit" onclick="document.getElementById(\'room-report-modal\').remove()">Cancel</button>' +
            '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    };

    function roomReportReasonOption(value, label) {
        return '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#141428;border:1px solid rgba(255,255,255,0.06);border-radius:8px;cursor:pointer;transition:border-color 0.2s" onmouseover="this.style.borderColor=\'rgba(232,160,181,0.3)\'" onmouseout="if(!this.querySelector(\'input\').checked)this.style.borderColor=\'rgba(255,255,255,0.06)\'">' +
            '<input type="radio" name="room-report-reason" value="' + value + '" style="accent-color:#E8A0B5" onclick="this.closest(\'label\').style.borderColor=\'#E8A0B5\';document.querySelectorAll(\'#room-report-reasons label\').forEach(function(l){if(!l.querySelector(\'input\').checked)l.style.borderColor=\'rgba(255,255,255,0.06)\'})">' +
            '<span style="color:#ccc;font-size:13px">' + label + '</span>' +
        '</label>';
    }

    window.submitRoomReport = function(postId) {
        var reason = document.querySelector('input[name="room-report-reason"]:checked');
        if (!reason) { showToast('Please select a reason', true); return; }
        var details = document.getElementById('room-report-details').value.trim();
        var btn = document.getElementById('room-report-submit-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

        apiFetch('/rooms/report', {
            method: 'POST',
            body: JSON.stringify({ postId: postId, reason: reason.value, details: details || null })
        }).then(function(data) {
            if (data && data.success) {
                showToast('Report submitted. Thank you for keeping the community safe.');
                var modal = document.getElementById('room-report-modal');
                if (modal) modal.remove();
            } else {
                showToast((data && data.error) || 'Failed to submit report', true);
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-flag"></i> Submit Report';
            }
        }).catch(function() {
            showToast('Failed to submit report', true);
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-flag"></i> Submit Report';
        });
    };

    window.roomShowReplies = function(postId) {
        var container = document.getElementById('rr-' + postId);
        if (!container) return;
        if (container.style.display === 'block') { container.style.display = 'none'; return; }
        container.style.display = 'block';
        container.innerHTML = '<div style="color:#8080A0;font-size:12px"><i class="fas fa-spinner fa-spin"></i> Loading replies...</div>';

        apiFetch('/rooms/replies?postId=' + postId).then(function(data) {
            var html = '';
            if (data && data.replies && data.replies.length > 0) {
                data.replies.forEach(function(r) {
                    html += '<div style="display:flex;gap:10px;margin-bottom:8px">' +
                        '<div style="width:26px;height:26px;border-radius:50%;background:' + hubGetAvatarColor(r.author_name || '') + ';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0">' + (r.author_name || '?')[0].toUpperCase() + '</div>' +
                        '<div style="flex:1"><span style="color:#fff;font-size:12px;font-weight:600">' + escapeHtmlSafe(r.author_name || 'Anonymous') + '</span> <span style="color:#8080A0;font-size:10px">' + getTimeAgoFromDate(r.created_at) + '</span><div style="color:#ccc;font-size:13px;margin-top:2px">' + escapeHtmlSafe(r.body) + '</div></div>' +
                    '</div>';
                });
            } else {
                html += '<div style="color:#555;font-size:12px;margin-bottom:8px">No replies yet</div>';
            }
            html += '<div style="display:flex;gap:8px;margin-top:10px">' +
                '<input type="text" id="rri-' + postId + '" placeholder="Write a reply..." style="flex:1;background:#141428;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px 12px;color:#fff;font-family:\'Inter\',sans-serif;font-size:13px;outline:none" onfocus="this.style.borderColor=\'#9b59b6\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.08)\'" onkeydown="if(event.key===\'Enter\')roomSubmitReply(' + postId + ')">' +
                '<button onclick="roomSubmitReply(' + postId + ')" style="background:#9b59b6;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif">Reply</button>' +
            '</div>';
            container.innerHTML = html;
            // Focus the input
            var inp = document.getElementById('rri-' + postId);
            if (inp) inp.focus();
        });
    };

    window.roomSubmitReply = function(postId) {
        var input = document.getElementById('rri-' + postId);
        if (!input || !input.value.trim()) return;
        var text = input.value.trim();
        input.disabled = true;
        apiFetch('/rooms/replies?postId=' + postId, {
            method: 'POST',
            body: JSON.stringify({ text: text })
        }).then(function(data) {
            if (data && data.id) {
                // Re-open replies to show new one
                var container = document.getElementById('rr-' + postId);
                if (container) container.style.display = 'none';
                roomShowReplies(postId);
                showToast('Reply posted!');
            } else if (data && data.error) {
                showToast(data.error, true);
                input.disabled = false;
            }
        }).catch(function() { showToast('Failed to reply', true); input.disabled = false; });
    };

    window.roomPinPost = function(postId) {
        apiFetch('/rooms/pin?postId=' + postId, { method: 'POST' }).then(function(data) {
            if (data) loadRoomFeed();
        });
    };

    window.roomDeletePost = function(postId) {
        if (!confirm('Delete this post?')) return;
        apiFetch('/rooms/post?postId=' + postId, { method: 'DELETE' }).then(function(data) {
            if (data && data.success) {
                var el = document.getElementById('rp-' + postId);
                if (el) el.remove();
                showToast('Post deleted');
            }
        });
    };

    window.submitRoomPost = function() {
        var textEl = document.getElementById('rv-post-text');
        if (!textEl || !textEl.value.trim()) { showToast('Write something first', true); return; }

        var postData = { roomId: currentRoomId, type: currentRoomFeedType, text: textEl.value.trim() };
        if (rvPostPhotoData) {
            postData.image = rvPostPhotoData;
        }

        var btn = document.querySelector('.create-post button[onclick="submitRoomPost()"]');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...'; }

        apiFetch('/rooms/post', {
            method: 'POST',
            body: JSON.stringify(postData)
        }).then(function(data) {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Post'; }
            if (data && data.id) {
                textEl.value = '';
                rvPostPhotoData = null;
                var preview = document.getElementById('rv-post-photo-preview');
                if (preview) preview.style.display = 'none';
                loadRoomFeed();
                showToast('Posted!');
            } else if (data && data.error === 'trust_score_too_low') {
                showToast('Trust score too low (' + (data.trust_score || 0) + '/80). Complete verification to post.', true);
                setTimeout(function() { window.location.href = '/verify.html'; }, 2000);
            } else if (data && data.error) {
                showToast(data.message || data.error, true);
            }
        }).catch(function() {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Post'; }
            showToast('Failed to post', true);
        });
    };

    window.toggleRoomInfo = function() {
        var panel = document.getElementById('rv-info-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    };

    window.copyRoomInviteCode = function() {
        var code = document.getElementById('rv-invite-code');
        if (code) {
            navigator.clipboard.writeText(code.value).then(function() { showToast('Invite code copied!'); });
        }
    };

    // Create Room
    window.showCreateRoomModal = function() {
        document.getElementById('modal-create-room').style.display = 'flex';
        document.getElementById('cr-error').style.display = 'none';
    };

    window.submitCreateRoom = function() {
        var name = document.getElementById('cr-name').value.trim();
        var letters = document.getElementById('cr-letters').value.trim();
        if (!name || !letters) {
            var errEl = document.getElementById('cr-error');
            errEl.textContent = 'Room name and Greek letters are required.';
            errEl.style.display = 'block';
            return;
        }
        var btn = document.getElementById('cr-submit-btn');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

        apiFetch('/rooms/create', {
            method: 'POST',
            body: JSON.stringify({
                name: name,
                greekLetters: letters,
                chapter: document.getElementById('cr-chapter').value.trim() || null,
                university: document.getElementById('cr-university').value.trim() || null,
                scope: document.getElementById('cr-scope').value,
                description: document.getElementById('cr-description').value.trim() || null,
                colorPrimary: document.getElementById('cr-color1').value,
                colorSecondary: document.getElementById('cr-color2').value
            })
        }).then(function(data) {
            btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Create Room';
            if (data && data.id) {
                closeModal('modal-create-room');
                showToast('Room created! Invite code: ' + data.invite_code);
                // Clear form
                ['cr-name','cr-letters','cr-chapter','cr-university','cr-description'].forEach(function(id) { document.getElementById(id).value = ''; });
                loadMyRooms();
                openRoom(data.id);
            } else if (data && data.error) {
                var errEl = document.getElementById('cr-error');
                errEl.textContent = data.error;
                errEl.style.display = 'block';
            }
        }).catch(function() {
            btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Create Room';
            showToast('Failed to create room', true);
        });
    };

    // Join Room
    window.showJoinRoomModal = function() {
        document.getElementById('modal-join-room').style.display = 'flex';
        document.getElementById('jr-error').style.display = 'none';
        document.getElementById('jr-success').style.display = 'none';
        document.getElementById('jr-code').value = '';
    };

    window.submitJoinRoom = function() {
        var code = document.getElementById('jr-code').value.trim();
        if (!code) {
            var e = document.getElementById('jr-error');
            e.textContent = 'Enter an invite code.';
            e.style.display = 'block';
            return;
        }
        var btn = document.getElementById('jr-submit-btn');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Requesting...';

        apiFetch('/rooms/join', {
            method: 'POST',
            body: JSON.stringify({ inviteCode: code })
        }).then(function(data) {
            btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Request to Join';
            document.getElementById('jr-error').style.display = 'none';
            if (data && data.message) {
                var s = document.getElementById('jr-success');
                s.textContent = data.message + (data.roomName ? ' (' + data.roomName + ')' : '');
                s.style.display = 'block';
                setTimeout(function() { closeModal('modal-join-room'); loadMyRooms(); }, 2000);
            } else if (data && data.error) {
                var e = document.getElementById('jr-error');
                e.textContent = data.error;
                e.style.display = 'block';
            }
        }).catch(function() {
            btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Request to Join';
            showToast('Failed to join', true);
        });
    };

    // Member Actions (admin)
    window.roomMemberAction = function(membershipId, action, muteDuration) {
        apiFetch('/rooms/members?roomId=' + currentRoomId, {
            method: 'PUT',
            body: JSON.stringify({ membershipId: membershipId, action: action, muteDuration: muteDuration || '24h' })
        }).then(function(data) {
            if (data && data.success) {
                showToast('Member ' + data.action);
                loadRoomView(); // Refresh
            } else if (data && data.error) {
                showToast(data.error, true);
            }
        });
    };

    // Room Settings
    window.showRoomSettingsModal = function() {
        if (!currentRoomData || !currentRoomData.room) return;
        var r = currentRoomData.room;
        document.getElementById('rs-name').value = r.name || '';
        document.getElementById('rs-description').value = r.description || '';
        document.getElementById('rs-color1').value = r.color_primary || '#9b59b6';
        document.getElementById('rs-color2').value = r.color_secondary || '#1A1A2E';
        document.getElementById('rs-error').style.display = 'none';
        document.getElementById('modal-room-settings').style.display = 'flex';
    };

    window.submitRoomSettings = function() {
        apiFetch('/rooms/settings', {
            method: 'PUT',
            body: JSON.stringify({
                roomId: currentRoomId,
                name: document.getElementById('rs-name').value.trim(),
                description: document.getElementById('rs-description').value.trim(),
                colorPrimary: document.getElementById('rs-color1').value,
                colorSecondary: document.getElementById('rs-color2').value
            })
        }).then(function(data) {
            if (data && data.id) {
                closeModal('modal-room-settings');
                showToast('Settings saved');
                loadRoomView();
            } else if (data && data.error) {
                var e = document.getElementById('rs-error');
                e.textContent = data.error;
                e.style.display = 'block';
            }
        });
    };

    // Regenerate Code
    window.regenerateRoomCode = function() {
        if (!confirm('This will invalidate the current invite code. Continue?')) return;
        apiFetch('/rooms/regenerate-code?roomId=' + currentRoomId, { method: 'POST' }).then(function(data) {
            if (data && data.inviteCode) {
                document.getElementById('rv-invite-code').value = data.inviteCode;
                showToast('New code: ' + data.inviteCode);
            } else if (data && data.error) {
                showToast(data.error, true);
            }
        });
    };

    // Leave Room
    window.leaveRoom = function() {
        if (!confirm('Are you sure you want to leave this room?')) return;
        apiFetch('/rooms/leave?roomId=' + currentRoomId, { method: 'POST' }).then(function(data) {
            if (data && data.success) {
                showToast('You left the room');
                currentRoomId = null;
                currentRoomData = null;
                switchHubTab('sororityrooms');
            } else if (data && data.error) {
                showToast(data.error, true);
            }
        });
    };

    // Close modal helper
    window.closeModal = window.closeModal || function(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
    };

    // ==================== AUTO-JOIN ROOM (from /join page) ====================
    (function checkJoinRoom() {
        var params = new URLSearchParams(window.location.search);
        if (params.get('joinroom') !== '1') return;

        var roomCode = localStorage.getItem('safetea_join_room');
        var refCode = localStorage.getItem('safetea_join_ref');

        // Track referral if present
        if (refCode) {
            var u = getUser();
            if (u) {
                apiFetch('/referral/track', {
                    method: 'POST',
                    body: JSON.stringify({ referralCode: refCode, newUserId: u.id })
                }).catch(function() {});
            }
            localStorage.removeItem('safetea_join_ref');
        }

        // Auto-join room if invite code present
        if (roomCode) {
            apiFetch('/rooms/join', {
                method: 'POST',
                body: JSON.stringify({ inviteCode: roomCode })
            }).then(function(data) {
                if (data && data.message) {
                    showToast(data.message + (data.roomName ? ' (' + data.roomName + ')' : ''));
                } else if (data && data.error) {
                    if (data.error.indexOf('already') === -1) showToast(data.error, true);
                }
            }).catch(function() {});
            localStorage.removeItem('safetea_join_room');
        }

        // Clean URL
        window.history.replaceState({}, '', '/dashboard.html' + (params.get('tab') ? '?tab=' + params.get('tab') : ''));
    })();

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

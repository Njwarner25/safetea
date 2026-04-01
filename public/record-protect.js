// ============ SafeTea SOS System — Record & Protect ============
// Floating SOS button → Action sheet (Fake Call, Record & Alert, Call 911)

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
        escalationTimer2: null,
        overlay: null,
        stealthMode: false
    };

    function getToken() { return localStorage.getItem(TOKEN_KEY); }
    function authHeaders() { return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }; }
    function getUser() {
        try { return JSON.parse(localStorage.getItem('safetea_user')); } catch(e) { return null; }
    }
    function isPaidUser(user) {
        if (!user) return false;
        var t = user.subscription_tier;
        return t === 'plus' || t === 'pro' || t === 'premium' || user.role === 'admin' || user.role === 'moderator';
    }

    // ============ SOS ACTION SHEET ============
    window.showSOSActionSheet = function() {
        var user = getUser();
        var paid = isPaidUser(user);

        // Remove existing if open
        var existing = document.getElementById('sos-action-sheet');
        if (existing) { existing.remove(); return; }

        var backdrop = document.createElement('div');
        backdrop.id = 'sos-action-sheet';
        backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:flex-end;justify-content:center;padding:0 12px 12px';

        var lockIcon = paid ? '' : ' <i class="fas fa-lock" style="font-size:12px;color:#8080A0;margin-left:6px"></i>';
        var lockStyle = paid ? '' : 'opacity:0.5;';

        backdrop.innerHTML =
            '<div style="background:#1A1A2E;border:1px solid rgba(255,255,255,0.08);border-radius:20px;max-width:420px;width:100%;padding:24px 20px 16px;animation:sosSlideUp 0.25s ease-out">' +
                '<div style="text-align:center;margin-bottom:20px">' +
                    '<div style="width:48px;height:48px;background:rgba(231,76,60,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 10px">' +
                        '<span style="color:#e74c3c;font-weight:800;font-size:15px">SOS</span>' +
                    '</div>' +
                    '<h3 style="color:#fff;font-size:17px;font-weight:600;margin-bottom:4px">What do you need?</h3>' +
                    '<p style="color:#8080A0;font-size:12px">Choose your level of response</p>' +
                '</div>' +

                // Option 1: Fake Call
                '<div id="sos-opt-fakecall" style="' + lockStyle + 'background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:16px;margin-bottom:10px;cursor:pointer;transition:all 0.15s" onmouseover="this.style.borderColor=\'rgba(232,160,181,0.3)\'" onmouseout="this.style.borderColor=\'rgba(255,255,255,0.06)\'">' +
                    '<div style="display:flex;align-items:center;gap:14px">' +
                        '<div style="min-width:40px;height:40px;background:rgba(232,160,181,0.12);border-radius:10px;display:flex;align-items:center;justify-content:center"><i class="fas fa-phone" style="font-size:16px;color:#E8A0B5"></i></div>' +
                        '<div style="flex:1">' +
                            '<h4 style="color:#fff;font-size:14px;font-weight:600;margin-bottom:2px">Fake Call' + lockIcon + '</h4>' +
                            '<p style="color:#8080A0;font-size:11px;line-height:1.4;margin:0">Get a realistic call to leave the situation</p>' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                // Option 2: Record & Alert
                '<div id="sos-opt-record" style="' + lockStyle + 'background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:16px;margin-bottom:10px;cursor:pointer;transition:all 0.15s" onmouseover="this.style.borderColor=\'rgba(231,76,60,0.3)\'" onmouseout="this.style.borderColor=\'rgba(255,255,255,0.06)\'">' +
                    '<div style="display:flex;align-items:center;gap:14px">' +
                        '<div style="min-width:40px;height:40px;background:rgba(231,76,60,0.12);border-radius:10px;display:flex;align-items:center;justify-content:center"><i class="fas fa-microphone" style="font-size:16px;color:#e74c3c"></i></div>' +
                        '<div style="flex:1">' +
                            '<h4 style="color:#fff;font-size:14px;font-weight:600;margin-bottom:2px">Record & Alert' + lockIcon + '</h4>' +
                            '<p style="color:#8080A0;font-size:11px;line-height:1.4;margin:0">Record audio + alert your trusted contacts</p>' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                // Option 3: Call 911
                '<div id="sos-opt-911" style="' + lockStyle + 'background:linear-gradient(135deg,rgba(231,76,60,0.08),rgba(231,76,60,0.03));border:1px solid rgba(231,76,60,0.2);border-radius:14px;padding:16px;margin-bottom:16px;cursor:pointer;transition:all 0.15s" onmouseover="this.style.borderColor=\'rgba(231,76,60,0.4)\'" onmouseout="this.style.borderColor=\'rgba(231,76,60,0.2)\'">' +
                    '<div style="display:flex;align-items:center;gap:14px">' +
                        '<div style="min-width:40px;height:40px;background:rgba(231,76,60,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center"><i class="fas fa-exclamation-triangle" style="font-size:16px;color:#e74c3c"></i></div>' +
                        '<div style="flex:1">' +
                            '<h4 style="color:#fff;font-size:14px;font-weight:600;margin-bottom:2px">Call 911' + lockIcon + '</h4>' +
                            '<p style="color:#8080A0;font-size:11px;line-height:1.4;margin:0">Connect to emergency services immediately</p>' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                // Emergency Contacts link
                '<div id="sos-contacts-link" style="text-align:center;margin-bottom:12px">' +
                    '<a href="#" style="color:#E8A0B5;font-size:12px;text-decoration:none"><i class="fas fa-user-shield"></i> Manage Emergency Contacts</a>' +
                '</div>' +

                // Cancel
                '<button id="sos-cancel" style="width:100%;background:rgba(255,255,255,0.06);color:#8080A0;border:none;padding:14px;border-radius:12px;font-size:14px;cursor:pointer;font-family:\'Inter\',sans-serif"><i class="fas fa-times"></i> Cancel</button>' +
            '</div>';

        // Slide-up animation
        var style = document.createElement('style');
        style.textContent = '@keyframes sosSlideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}';
        backdrop.appendChild(style);

        document.body.appendChild(backdrop);

        // Wire up handlers
        document.getElementById('sos-cancel').onclick = function() { backdrop.remove(); };
        backdrop.addEventListener('click', function(e) { if (e.target === backdrop) backdrop.remove(); });
        document.getElementById('sos-contacts-link').onclick = function(e) { e.preventDefault(); backdrop.remove(); window.showEmergencyContacts(); };

        if (paid) {
            document.getElementById('sos-opt-fakecall').onclick = function() { backdrop.remove(); triggerFakeCall(); };
            document.getElementById('sos-opt-record').onclick = function() { backdrop.remove(); startRecording(); };
            document.getElementById('sos-opt-911').onclick = function() { backdrop.remove(); triggerCall911WithAlert(); };
        } else {
            var upgradeHandler = function() {
                backdrop.remove();
                // SOS-specific upgrade pitch
                var pitch = document.createElement('div');
                pitch.id = 'sos-upgrade-pitch';
                pitch.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px';
                pitch.innerHTML =
                    '<div style="background:#1A1A2E;border:1px solid rgba(232,160,181,0.2);border-radius:20px;max-width:400px;width:100%;padding:28px 24px;text-align:center">' +
                        '<div style="width:56px;height:56px;background:rgba(231,76,60,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px"><span style="color:#e74c3c;font-weight:800;font-size:16px">SOS</span></div>' +
                        '<h3 style="color:#fff;font-size:18px;font-weight:700;margin-bottom:6px">Unlock Emergency Tools</h3>' +
                        '<p style="color:#8080A0;font-size:13px;margin-bottom:20px;line-height:1.5">SafeTea+ gives you a complete safety toolkit for every date.</p>' +
                        '<div style="text-align:left;margin-bottom:20px">' +
                            '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04)"><div style="min-width:36px;height:36px;background:rgba(232,160,181,0.1);border-radius:8px;display:flex;align-items:center;justify-content:center"><i class="fas fa-phone" style="color:#E8A0B5;font-size:14px"></i></div><div><div style="color:#fff;font-size:13px;font-weight:600">Fake Call</div><div style="color:#8080A0;font-size:11px">AI-generated excuse to leave any situation</div></div></div>' +
                            '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04)"><div style="min-width:36px;height:36px;background:rgba(231,76,60,0.1);border-radius:8px;display:flex;align-items:center;justify-content:center"><i class="fas fa-microphone" style="color:#e74c3c;font-size:14px"></i></div><div><div style="color:#fff;font-size:13px;font-weight:600">Record & Alert</div><div style="color:#8080A0;font-size:11px">Audio recording + GPS alerts to trusted contacts</div></div></div>' +
                            '<div style="display:flex;align-items:center;gap:12px;padding:10px 0"><div style="min-width:36px;height:36px;background:rgba(231,76,60,0.15);border-radius:8px;display:flex;align-items:center;justify-content:center"><i class="fas fa-exclamation-triangle" style="color:#e74c3c;font-size:14px"></i></div><div><div style="color:#fff;font-size:13px;font-weight:600">Call 911</div><div style="color:#8080A0;font-size:11px">One-tap emergency services with location sharing</div></div></div>' +
                        '</div>' +
                        '<button onclick="document.getElementById(\'sos-upgrade-pitch\').remove();if(typeof showUpgradePrompt===\'function\')showUpgradePrompt()" style="width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#f27059,#E8A0B5);color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif;margin-bottom:10px">Subscribe to SafeTea+ — $7.99/mo</button>' +
                        '<button onclick="document.getElementById(\'sos-upgrade-pitch\').remove()" style="width:100%;padding:10px;border:none;background:transparent;color:#8080A0;font-size:13px;cursor:pointer;font-family:\'Inter\',sans-serif">Maybe Later</button>' +
                    '</div>';
                document.body.appendChild(pitch);
                pitch.addEventListener('click', function(e) { if (e.target === pitch) pitch.remove(); });
            };
            document.getElementById('sos-opt-fakecall').onclick = upgradeHandler;
            document.getElementById('sos-opt-record').onclick = upgradeHandler;
            document.getElementById('sos-opt-911').onclick = upgradeHandler;
        }
    };

    // ============ FAKE CALL ============
    function triggerFakeCall() {
        var user = getUser();
        var fakeCallSettings = null;
        try { fakeCallSettings = JSON.parse(localStorage.getItem('safetea_fakecall_settings')); } catch(e) {}
        var callerName = (fakeCallSettings && fakeCallSettings.callerName) || 'Mom';
        var voiceOption = (fakeCallSettings && fakeCallSettings.voiceOption) || 'mom';
        var delay = (fakeCallSettings && fakeCallSettings.defaultDelay) || 15;
        var phoneOS = (fakeCallSettings && fakeCallSettings.phoneOS) || 'ios';

        var iosSel = phoneOS === 'ios';
        var andSel = phoneOS === 'android';

        // Show delay picker
        var picker = document.createElement('div');
        picker.id = 'fakecall-delay-picker';
        picker.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
        picker.innerHTML =
            '<div style="background:#1A1A2E;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;max-width:360px;width:100%">' +
                '<h3 style="color:#fff;font-size:16px;margin-bottom:4px;text-align:center"><i class="fas fa-phone" style="color:#E8A0B5"></i> Fake Call</h3>' +
                '<p style="color:#8080A0;font-size:12px;text-align:center;margin-bottom:16px">Set up your call</p>' +

                '<label style="display:block;font-size:11px;font-weight:600;color:#8080A0;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Who\'s calling?</label>' +
                '<input id="fc-picker-name" type="text" value="' + callerName + '" placeholder="e.g., Mom, Sarah" style="width:100%;padding:10px 12px;background:#141428;border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;font-size:14px;font-family:\'Inter\',sans-serif;outline:none;margin-bottom:12px;box-sizing:border-box">' +

                '<label style="display:block;font-size:11px;font-weight:600;color:#8080A0;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Voice</label>' +
                '<select id="fc-picker-voice" style="width:100%;padding:10px 12px;background:#141428;border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;font-size:14px;font-family:\'Inter\',sans-serif;outline:none;margin-bottom:12px;-webkit-appearance:auto">' +
                    '<option value="mom"' + (voiceOption === 'mom' ? ' selected' : '') + '>Concerned Mom</option>' +
                    '<option value="bestfriend"' + (voiceOption === 'bestfriend' ? ' selected' : '') + '>Best Friend</option>' +
                    '<option value="sister"' + (voiceOption === 'sister' ? ' selected' : '') + '>Older Sister</option>' +
                    '<option value="dad"' + (voiceOption === 'dad' ? ' selected' : '') + '>Dad</option>' +
                    '<option value="roommate"' + (voiceOption === 'roommate' ? ' selected' : '') + '>Roommate</option>' +
                '</select>' +

                '<label style="display:block;font-size:11px;font-weight:600;color:#8080A0;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Phone style</label>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">' +
                    '<button id="fc-os-ios" class="fc-os-btn" style="background:' + (iosSel ? '#22223A' : '#141428') + ';border:1px solid ' + (iosSel ? 'rgba(232,160,181,0.3)' : 'rgba(255,255,255,0.06)') + ';color:#fff;padding:10px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif"><i class="fab fa-apple" style="margin-right:6px"></i>iPhone</button>' +
                    '<button id="fc-os-android" class="fc-os-btn" style="background:' + (andSel ? '#22223A' : '#141428') + ';border:1px solid ' + (andSel ? 'rgba(232,160,181,0.3)' : 'rgba(255,255,255,0.06)') + ';color:#fff;padding:10px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif"><i class="fab fa-android" style="margin-right:6px"></i>Android</button>' +
                '</div>' +

                '<label style="display:block;font-size:11px;font-weight:600;color:#8080A0;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Ring in...</label>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">' +
                    '<button class="fc-delay-btn" data-delay="15" style="background:#22223A;border:1px solid rgba(232,160,181,0.2);color:#fff;padding:12px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif">15 sec</button>' +
                    '<button class="fc-delay-btn" data-delay="30" style="background:#22223A;border:1px solid rgba(255,255,255,0.06);color:#fff;padding:12px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif">30 sec</button>' +
                    '<button class="fc-delay-btn" data-delay="60" style="background:#22223A;border:1px solid rgba(255,255,255,0.06);color:#fff;padding:12px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif">1 min</button>' +
                    '<button class="fc-delay-btn" data-delay="120" style="background:#22223A;border:1px solid rgba(255,255,255,0.06);color:#fff;padding:12px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif">2 min</button>' +
                '</div>' +
                '<button id="fc-cancel" style="width:100%;background:rgba(255,255,255,0.06);color:#8080A0;border:none;padding:10px;border-radius:10px;font-size:13px;cursor:pointer;font-family:\'Inter\',sans-serif">Cancel</button>' +
            '</div>';

        document.body.appendChild(picker);
        document.getElementById('fc-cancel').onclick = function() { picker.remove(); };
        picker.addEventListener('click', function(e) { if (e.target === picker) picker.remove(); });

        // OS style toggle
        var selectedOS = phoneOS;
        document.getElementById('fc-os-ios').onclick = function() {
            selectedOS = 'ios';
            this.style.borderColor = 'rgba(232,160,181,0.3)';
            this.style.background = '#22223A';
            document.getElementById('fc-os-android').style.borderColor = 'rgba(255,255,255,0.06)';
            document.getElementById('fc-os-android').style.background = '#141428';
        };
        document.getElementById('fc-os-android').onclick = function() {
            selectedOS = 'android';
            this.style.borderColor = 'rgba(232,160,181,0.3)';
            this.style.background = '#22223A';
            document.getElementById('fc-os-ios').style.borderColor = 'rgba(255,255,255,0.06)';
            document.getElementById('fc-os-ios').style.background = '#141428';
        };

        picker.querySelectorAll('.fc-delay-btn').forEach(function(btn) {
            btn.onclick = function() {
                var d = parseInt(btn.getAttribute('data-delay'), 10);
                var name = document.getElementById('fc-picker-name').value || 'Mom';
                var voice = document.getElementById('fc-picker-voice').value || 'mom';
                localStorage.setItem('safetea_fakecall_settings', JSON.stringify({
                    callerName: name, voiceOption: voice, defaultDelay: d, phoneOS: selectedOS
                }));
                picker.remove();
                startFakeCallCountdown(d, name, voice, selectedOS, user);
            };
        });
    }

    function startFakeCallCountdown(delaySec, callerName, voiceOption, phoneOS, user) {
        if (typeof showToast === 'function') showToast('Fake call in ' + delaySec + ' seconds...');

        // Generate script and audio in background
        var scriptPromise = fetch('/api/dates/fake-call-script', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ callerName: callerName, context: 'evening date' })
        }).then(function(r) {
            if (!r.ok) throw new Error('Script API returned ' + r.status);
            return r.json();
        }).catch(function(err) {
            console.error('[FakeCall] Script generation failed:', err);
            return null;
        });

        var audioPromise = scriptPromise.then(function(scriptData) {
            if (!scriptData || !scriptData.script) {
                console.warn('[FakeCall] No script available — call will ring without voice');
                return null;
            }
            return fetch('/api/dates/fake-call-voice', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ script: scriptData.script, persona: voiceOption })
            }).then(function(r) {
                if (!r.ok) throw new Error('Voice API returned ' + r.status);
                return r.json();
            });
        }).catch(function(err) {
            console.error('[FakeCall] Voice synthesis failed:', err);
            return null;
        });

        setTimeout(function() {
            showFakeIncomingCall(callerName, audioPromise, phoneOS);
        }, delaySec * 1000);
    }

    // ============ INCOMING CALL SCREEN (iOS / Android) ============
    function showFakeIncomingCall(callerName, audioPromise, phoneOS) {
        phoneOS = phoneOS || 'ios';

        // Vibrate pattern (repeating)
        var vibrateInterval = null;
        if (navigator.vibrate) {
            navigator.vibrate([500, 200, 500, 200, 500]);
            vibrateInterval = setInterval(function() {
                if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
            }, 3000);
        }

        // Ringtone via Web Audio API
        var ringtone = null;
        try {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                var actx = new AudioCtx();
                var gainNode = actx.createGain();
                gainNode.gain.value = 0.2;
                gainNode.connect(actx.destination);
                var ringActive = true;

                function playRingBurst() {
                    if (!ringActive) return;
                    var o1 = actx.createOscillator();
                    var o2 = actx.createOscillator();
                    o1.frequency.value = 440;
                    o2.frequency.value = 480;
                    o1.connect(gainNode);
                    o2.connect(gainNode);
                    var now = actx.currentTime;
                    o1.start(now);
                    o2.start(now);
                    o1.stop(now + 2);
                    o2.stop(now + 2);
                }

                playRingBurst();
                var ringInterval = setInterval(playRingBurst, 4000);

                ringtone = {
                    stop: function() {
                        ringActive = false;
                        clearInterval(ringInterval);
                        try { actx.close(); } catch(e) {}
                    }
                };
            }
        } catch(e) {}

        function stopRinging() {
            if (ringtone) ringtone.stop();
            if (vibrateInterval) clearInterval(vibrateInterval);
            if (navigator.vibrate) navigator.vibrate(0);
        }

        var overlay = document.createElement('div');
        overlay.id = 'fake-call-overlay';
        var initial = callerName.charAt(0).toUpperCase();

        if (phoneOS === 'android') {
            // ---- ANDROID STYLE ----
            overlay.style.cssText = 'position:fixed;inset:0;background:#121212;z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:space-between;font-family:"Google Sans","Roboto",sans-serif';
            overlay.innerHTML =
                '<div style="padding-top:env(safe-area-inset-top,44px)"></div>' +
                // Caller info
                '<div style="text-align:center;flex:1;display:flex;flex-direction:column;justify-content:center;padding-bottom:30px">' +
                    '<div style="width:96px;height:96px;background:linear-gradient(135deg,#7BAAF7,#4285F4);border-radius:48px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:40px;font-weight:400;color:#fff;animation:fcRingPulse 2s ease-in-out infinite">' + initial + '</div>' +
                    '<p style="color:#fff;font-size:26px;font-weight:500;margin:0 0 8px;letter-spacing:0">' + callerName + '</p>' +
                    '<p style="color:rgba(255,255,255,0.6);font-size:14px;font-weight:400;margin:0">Incoming call</p>' +
                '</div>' +
                // Bottom buttons
                '<div style="width:100%;padding:0 40px 50px;padding-bottom:max(50px,env(safe-area-inset-bottom,34px))">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;max-width:300px;margin:0 auto">' +
                        '<div style="text-align:center">' +
                            '<button id="fc-decline" style="width:64px;height:64px;background:rgba(234,67,53,0.15);border-radius:32px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center"><i class="fas fa-phone" style="font-size:24px;color:#EA4335;transform:rotate(135deg)"></i></button>' +
                            '<p style="color:rgba(255,255,255,0.6);font-size:12px;margin-top:8px;font-weight:400">Decline</p>' +
                        '</div>' +
                        '<div style="text-align:center">' +
                            '<button id="fc-accept" style="width:64px;height:64px;background:rgba(52,168,83,0.15);border-radius:32px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center"><i class="fas fa-phone" style="font-size:24px;color:#34A853"></i></button>' +
                            '<p style="color:rgba(255,255,255,0.6);font-size:12px;margin-top:8px;font-weight:400">Answer</p>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        } else {
            // ---- iOS STYLE ----
            overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:space-between;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif';
            overlay.innerHTML =
                '<div style="padding-top:env(safe-area-inset-top,44px)"></div>' +
                // Caller info
                '<div style="text-align:center;flex:1;display:flex;flex-direction:column;justify-content:center;padding-bottom:40px">' +
                    '<div style="width:110px;height:110px;background:linear-gradient(145deg,#A0A0B0,#6E6E80);border-radius:55px;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:46px;font-weight:300;color:#fff;animation:fcRingPulse 2s ease-in-out infinite">' + initial + '</div>' +
                    '<p style="color:#fff;font-size:30px;font-weight:300;margin:0 0 6px;letter-spacing:-0.5px">' + callerName + '</p>' +
                    '<p style="color:rgba(255,255,255,0.55);font-size:15px;font-weight:400;margin:0">mobile</p>' +
                '</div>' +
                // Bottom buttons
                '<div style="padding:0 0 50px;padding-bottom:max(50px,env(safe-area-inset-bottom,34px))">' +
                    '<div style="display:flex;justify-content:center;gap:80px">' +
                        '<div style="text-align:center">' +
                            '<button id="fc-decline" style="width:70px;height:70px;background:#FF3B30;border-radius:35px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(255,59,48,0.4)"><i class="fas fa-phone" style="font-size:28px;color:#fff;transform:rotate(135deg)"></i></button>' +
                            '<p style="color:rgba(255,255,255,0.55);font-size:12px;margin-top:10px;font-weight:400">Decline</p>' +
                        '</div>' +
                        '<div style="text-align:center">' +
                            '<button id="fc-accept" style="width:70px;height:70px;background:#34C759;border-radius:35px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(52,199,89,0.4)"><i class="fas fa-phone" style="font-size:28px;color:#fff"></i></button>' +
                            '<p style="color:rgba(255,255,255,0.55);font-size:12px;margin-top:10px;font-weight:400">Accept</p>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        }

        var ringStyle = document.createElement('style');
        ringStyle.textContent = '@keyframes fcRingPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(160,160,176,0.3)}50%{transform:scale(1.04);box-shadow:0 0 0 24px rgba(160,160,176,0)}}';
        overlay.appendChild(ringStyle);

        document.body.appendChild(overlay);

        document.getElementById('fc-decline').onclick = function() {
            stopRinging();
            overlay.remove();
        };
        document.getElementById('fc-accept').onclick = function() {
            stopRinging();
            overlay.remove();
            // iOS Safari requires audio.play() to be triggered from a user gesture.
            // Pre-create and play a silent audio element NOW (inside the click handler)
            // so the browser unlocks audio playback for this element.
            var preloadedAudio = new Audio();
            preloadedAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
            preloadedAudio.play().catch(function() {});
            showFakeActiveCall(callerName, audioPromise, phoneOS, preloadedAudio);
        };
    }

    // ============ ACTIVE CALL SCREEN (iOS / Android) ============
    function showFakeActiveCall(callerName, audioPromise, phoneOS, preloadedAudio) {
        phoneOS = phoneOS || 'ios';

        var overlay = document.createElement('div');
        overlay.id = 'fake-active-call';

        if (phoneOS === 'android') {
            // ---- ANDROID ACTIVE CALL ----
            overlay.style.cssText = 'position:fixed;inset:0;background:#121212;z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:space-between;font-family:"Google Sans","Roboto",sans-serif';
            overlay.innerHTML =
                // Top: avatar + name + timer
                '<div style="text-align:center;padding-top:max(70px,calc(env(safe-area-inset-top,44px) + 30px))">' +
                    '<div style="width:72px;height:72px;background:linear-gradient(135deg,#7BAAF7,#4285F4);border-radius:36px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:30px;font-weight:400;color:#fff">' + callerName.charAt(0).toUpperCase() + '</div>' +
                    '<p style="color:#fff;font-size:20px;font-weight:500;margin:0 0 4px">' + callerName + '</p>' +
                    '<p id="fc-call-timer" style="color:rgba(255,255,255,0.6);font-size:14px;margin:0;font-variant-numeric:tabular-nums;font-weight:400">00:00</p>' +
                '</div>' +
                // Middle: action buttons row
                '<div style="display:flex;justify-content:center;gap:28px;padding:0 20px">' +
                    '<div style="text-align:center">' +
                        '<button id="fc-mute-btn" style="width:56px;height:56px;background:rgba(255,255,255,0.08);border-radius:28px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s"><i class="fas fa-microphone-slash" style="font-size:20px;color:#fff;transition:color 0.2s"></i></button>' +
                        '<p style="color:rgba(255,255,255,0.6);font-size:10px;margin-top:6px;font-weight:400">Mute</p>' +
                    '</div>' +
                    '<div style="text-align:center">' +
                        '<button style="width:56px;height:56px;background:rgba(255,255,255,0.08);border-radius:28px;border:none;display:flex;align-items:center;justify-content:center;cursor:default"><i class="fas fa-th" style="font-size:20px;color:#fff"></i></button>' +
                        '<p style="color:rgba(255,255,255,0.6);font-size:10px;margin-top:6px;font-weight:400">Keypad</p>' +
                    '</div>' +
                    '<div style="text-align:center">' +
                        '<button id="fc-speaker-btn" style="width:56px;height:56px;background:rgba(255,255,255,0.08);border-radius:28px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s"><i class="fas fa-volume-up" style="font-size:20px;color:#fff;transition:color 0.2s"></i></button>' +
                        '<p style="color:rgba(255,255,255,0.6);font-size:10px;margin-top:6px;font-weight:400">Speaker</p>' +
                    '</div>' +
                '</div>' +
                // Bottom: end call pill
                '<div style="text-align:center;padding-bottom:max(50px,env(safe-area-inset-bottom,34px))">' +
                    '<button id="fc-end-call" style="width:160px;height:56px;background:#EA4335;border-radius:28px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;margin:0 auto;gap:10px;box-shadow:0 2px 12px rgba(234,67,53,0.3)"><i class="fas fa-phone" style="font-size:22px;color:#fff;transform:rotate(135deg)"></i><span style="color:#fff;font-size:15px;font-weight:500">End call</span></button>' +
                '</div>';
        } else {
            // ---- iOS ACTIVE CALL ----
            overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:space-between;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif';
            overlay.innerHTML =
                // Top: name + timer
                '<div style="text-align:center;padding-top:max(70px,calc(env(safe-area-inset-top,44px) + 30px))">' +
                    '<p style="color:#fff;font-size:22px;font-weight:600;margin:0 0 6px;letter-spacing:-0.3px">' + callerName + '</p>' +
                    '<p id="fc-call-timer" style="color:rgba(255,255,255,0.55);font-size:16px;margin:0;font-variant-numeric:tabular-nums;font-weight:400">00:00</p>' +
                '</div>' +
                // Middle: action buttons grid (3x2)
                '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px 0;max-width:320px;width:100%;padding:0 20px">' +
                    '<div style="text-align:center">' +
                        '<button id="fc-mute-btn" style="width:66px;height:66px;background:rgba(255,255,255,0.12);border-radius:33px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;margin:0 auto;transition:background 0.2s"><i class="fas fa-microphone-slash" style="font-size:22px;color:#fff;transition:color 0.2s"></i></button>' +
                        '<p style="color:rgba(255,255,255,0.55);font-size:11px;margin-top:8px;font-weight:400">mute</p>' +
                    '</div>' +
                    '<div style="text-align:center">' +
                        '<button style="width:66px;height:66px;background:rgba(255,255,255,0.12);border-radius:33px;border:none;display:flex;align-items:center;justify-content:center;margin:0 auto;cursor:default"><i class="fas fa-th" style="font-size:22px;color:#fff"></i></button>' +
                        '<p style="color:rgba(255,255,255,0.55);font-size:11px;margin-top:8px;font-weight:400">keypad</p>' +
                    '</div>' +
                    '<div style="text-align:center">' +
                        '<button id="fc-speaker-btn" style="width:66px;height:66px;background:rgba(255,255,255,0.12);border-radius:33px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;margin:0 auto;transition:background 0.2s"><i class="fas fa-volume-up" style="font-size:22px;color:#fff;transition:color 0.2s"></i></button>' +
                        '<p style="color:rgba(255,255,255,0.55);font-size:11px;margin-top:8px;font-weight:400">speaker</p>' +
                    '</div>' +
                    '<div style="text-align:center">' +
                        '<button style="width:66px;height:66px;background:rgba(255,255,255,0.12);border-radius:33px;border:none;display:flex;align-items:center;justify-content:center;margin:0 auto;opacity:0.4;cursor:default"><i class="fas fa-plus" style="font-size:22px;color:#fff"></i></button>' +
                        '<p style="color:rgba(255,255,255,0.35);font-size:11px;margin-top:8px;font-weight:400">add call</p>' +
                    '</div>' +
                    '<div style="text-align:center">' +
                        '<button style="width:66px;height:66px;background:rgba(255,255,255,0.12);border-radius:33px;border:none;display:flex;align-items:center;justify-content:center;margin:0 auto;opacity:0.4;cursor:default"><i class="fas fa-video" style="font-size:22px;color:#fff"></i></button>' +
                        '<p style="color:rgba(255,255,255,0.35);font-size:11px;margin-top:8px;font-weight:400">FaceTime</p>' +
                    '</div>' +
                    '<div style="text-align:center">' +
                        '<button style="width:66px;height:66px;background:rgba(255,255,255,0.12);border-radius:33px;border:none;display:flex;align-items:center;justify-content:center;margin:0 auto;opacity:0.4;cursor:default"><i class="fas fa-user" style="font-size:22px;color:#fff"></i></button>' +
                        '<p style="color:rgba(255,255,255,0.35);font-size:11px;margin-top:8px;font-weight:400">contacts</p>' +
                    '</div>' +
                '</div>' +
                // Bottom: end call
                '<div style="text-align:center;padding-bottom:max(50px,env(safe-area-inset-bottom,34px))">' +
                    '<button id="fc-end-call" style="width:70px;height:70px;background:#FF3B30;border-radius:35px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;margin:0 auto;box-shadow:0 4px 20px rgba(255,59,48,0.4)"><i class="fas fa-phone" style="font-size:28px;color:#fff;transform:rotate(135deg)"></i></button>' +
                    '<p style="color:rgba(255,255,255,0.55);font-size:12px;margin-top:10px;font-weight:400">End Call</p>' +
                '</div>';
        }

        document.body.appendChild(overlay);

        // Timer
        var callStart = Date.now();
        var timerInt = setInterval(function() {
            var elapsed = Math.floor((Date.now() - callStart) / 1000);
            var timerEl = document.getElementById('fc-call-timer');
            if (timerEl) timerEl.textContent = String(Math.floor(elapsed / 60)).padStart(2, '0') + ':' + String(elapsed % 60).padStart(2, '0');
        }, 1000);

        // Play voice audio
        var audio = null;
        var isMuted = false;
        var activeStyle = phoneOS === 'android' ? 'rgba(76,175,80,0.2)' : '#fff';
        var activeColor = phoneOS === 'android' ? '#4CAF50' : '#000';
        var inactiveStyle = phoneOS === 'android' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)';
        var inactiveColor = '#fff';

        if (audioPromise) {
            audioPromise.then(function(voiceData) {
                if (voiceData && voiceData.audio) {
                    // Reuse the preloaded audio element (already unlocked by user gesture on iOS)
                    if (preloadedAudio) {
                        audio = preloadedAudio;
                        audio.src = 'data:audio/mpeg;base64,' + voiceData.audio;
                    } else {
                        audio = new Audio('data:audio/mpeg;base64,' + voiceData.audio);
                    }
                    audio.play().then(function() {
                        console.log('[FakeCall] Voice audio playing');
                    }).catch(function(err) {
                        console.error('[FakeCall] Audio play failed:', err);
                    });
                    audio.onended = function() {
                        clearInterval(timerInt);
                        overlay.remove();
                    };
                } else {
                    console.warn('[FakeCall] No voice audio available — showing silent call');
                }
            }).catch(function(err) {
                console.error('[FakeCall] Audio promise rejected:', err);
            });
        }

        // Mute button
        document.getElementById('fc-mute-btn').onclick = function() {
            isMuted = !isMuted;
            this.style.background = isMuted ? activeStyle : inactiveStyle;
            this.querySelector('i').style.color = isMuted ? activeColor : inactiveColor;
            if (audio) audio.muted = isMuted;
        };

        // Speaker button
        var speakerOn = false;
        document.getElementById('fc-speaker-btn').onclick = function() {
            speakerOn = !speakerOn;
            this.style.background = speakerOn ? activeStyle : inactiveStyle;
            this.querySelector('i').style.color = speakerOn ? activeColor : inactiveColor;
        };

        // End call button
        document.getElementById('fc-end-call').onclick = function() {
            clearInterval(timerInt);
            if (audio) { audio.pause(); audio = null; }
            overlay.remove();
        };
    }

    // ============ CALL 911 WITH ALERT ============
    function triggerCall911WithAlert() {
        if (!confirm('This will dial 911 and alert your trusted contacts. Are you sure?')) return;

        // Log the event and alert contacts
        var token = getToken();
        fetch('/api/dates/sos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ type: 'call_911' })
        }).catch(function() {});

        // Also start recording silently
        startRecording();

        // Dial 911
        window.open('tel:911', '_self');
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
                            '<i class="fas fa-exclamation-triangle" style="font-size:24px;color:#e74c3c"></i>' +
                        '</div>' +
                        '<h3 style="color:#fff;font-size:18px;margin-bottom:4px">Important: Recording laws vary by state</h3>' +
                    '</div>' +
                    '<div style="color:#C0C0D0;font-size:13px;line-height:1.7;margin-bottom:20px">' +
                        '<p style="margin-bottom:12px">SafeTea\'s Record & Protect feature captures audio and shares your live location with trusted contacts.</p>' +
                        '<p style="margin-bottom:12px">Some states require all parties to consent to audio recording (including Illinois, California, Florida, and others). You are solely responsible for knowing and following the recording laws in your location.</p>' +
                        '<p style="margin-bottom:12px">SafeTea provides this tool for personal safety documentation. How you use recordings \u2014 including whether to share them with law enforcement or other parties \u2014 is your decision and responsibility.</p>' +
                        '<p style="margin:0">Recordings are encrypted and stored securely. Only you control access.</p>' +
                    '</div>' +
                    '<div style="display:flex;flex-direction:column;gap:10px">' +
                        '<button id="rp-legal-accept" style="width:100%;background:linear-gradient(135deg,#e74c3c,#c0392b);color:#fff;border:none;padding:14px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif">I Understand \u2014 Continue</button>' +
                        '<button id="rp-legal-laws" style="width:100%;background:rgba(255,255,255,0.06);color:#E8A0B5;border:1px solid rgba(232,160,181,0.2);padding:14px;border-radius:10px;font-size:14px;cursor:pointer;font-family:\'Inter\',sans-serif"><i class="fas fa-gavel"></i> View Recording Laws by State</button>' +
                    '</div>' +
                '</div>';

            document.body.appendChild(backdrop);

            document.getElementById('rp-legal-accept').onclick = function() {
                localStorage.setItem(LEGAL_KEY, 'true');
                backdrop.remove();
                resolve(true);
            };
            document.getElementById('rp-legal-laws').onclick = function() {
                window.open('https://www.justia.com/50-state-surveys/recording-phone-calls-and-conversations/', '_blank');
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
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px';

        overlay.innerHTML =
            '<div id="rp-controls" style="text-align:center;max-width:360px;transition:opacity 0.3s">' +
                '<div id="rp-pulse" style="width:80px;height:80px;background:rgba(231,76,60,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;animation:rpPulse 2s ease-in-out infinite">' +
                    '<div style="width:50px;height:50px;background:rgba(231,76,60,0.4);border-radius:50%;display:flex;align-items:center;justify-content:center">' +
                        '<i class="fas fa-microphone" style="font-size:22px;color:#e74c3c"></i>' +
                    '</div>' +
                '</div>' +
                '<p style="color:#e74c3c;font-size:16px;font-weight:600;margin-bottom:6px">Recording Active</p>' +
                '<p id="rp-timer" style="color:#8080A0;font-size:24px;font-weight:300;margin-bottom:6px;font-variant-numeric:tabular-nums">00:00</p>' +
                '<p id="rp-chunk-status" style="color:#555;font-size:11px;margin-bottom:12px">Uploading...</p>' +
                '<p id="rp-gps-status" style="color:#555;font-size:11px;margin-bottom:24px"></p>' +
                '<div style="display:flex;gap:10px;justify-content:center">' +
                    '<button id="rp-stealth-btn" style="background:rgba(255,255,255,0.06);color:#8080A0;border:none;padding:12px 20px;border-radius:10px;font-size:13px;cursor:pointer;font-family:\'Inter\',sans-serif"><i class="fas fa-eye-slash"></i> Stealth</button>' +
                    '<button id="rp-stop-btn" style="background:linear-gradient(135deg,#2ecc71,#27ae60);color:#fff;border:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif"><i class="fas fa-check-circle"></i> I\'m Safe — Stop</button>' +
                '</div>' +
            '</div>' +
            '<div id="rp-stealth-dot" style="display:none;position:fixed;top:8px;right:8px;width:6px;height:6px;background:#e74c3c;border-radius:50%;animation:rpPulse 2s ease-in-out infinite"></div>';

        var style = document.createElement('style');
        style.textContent = '@keyframes rpPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.15);opacity:0.7}}';
        overlay.appendChild(style);

        document.body.appendChild(overlay);
        state.overlay = overlay;

        document.getElementById('rp-stop-btn').onclick = stopRecording;
        document.getElementById('rp-stealth-btn').onclick = function() {
            toggleStealthMode();
        };

        // In stealth mode: tap anywhere on the black screen to briefly reveal controls
        overlay.addEventListener('click', function(e) {
            if (state.stealthMode && e.target === overlay) {
                var controls = document.getElementById('rp-controls');
                if (controls) {
                    controls.style.opacity = '1';
                    controls.style.pointerEvents = 'auto';
                    setTimeout(function() {
                        if (state.stealthMode) {
                            controls.style.opacity = '0';
                            controls.style.pointerEvents = 'none';
                        }
                    }, 4000);
                }
            }
        });

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

    function toggleStealthMode() {
        state.stealthMode = !state.stealthMode;
        var controls = document.getElementById('rp-controls');
        var dot = document.getElementById('rp-stealth-dot');
        var btn = document.getElementById('rp-stealth-btn');
        if (state.stealthMode) {
            if (controls) { controls.style.opacity = '0'; controls.style.pointerEvents = 'none'; }
            if (dot) dot.style.display = 'block';
            if (btn) btn.innerHTML = '<i class="fas fa-eye"></i> Show';
        } else {
            if (controls) { controls.style.opacity = '1'; controls.style.pointerEvents = 'auto'; }
            if (dot) dot.style.display = 'none';
            if (btn) btn.innerHTML = '<i class="fas fa-eye-slash"></i> Stealth';
        }
    }

    function hideStealthOverlay() {
        if (state.timerInterval) clearInterval(state.timerInterval);
        if (state.overlay) state.overlay.remove();
        state.overlay = null;
        state.stealthMode = false;
    }

    // ============ START RECORDING ============
    async function startRecording() {
        var user = getUser();
        if (!isPaidUser(user)) {
            if (typeof showToast === 'function') showToast('Record & Protect requires SafeTea+ ($7.99/mo). Upgrade to access this feature.');
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

        // Hide the SOS floating button while recording
        var sosBtn = document.getElementById('sos-floating-btn');
        if (sosBtn) sosBtn.style.display = 'none';

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

        // Escalation timer — 15 minutes (first), 30 minutes (second)
        state.escalationTimer = setTimeout(function() {
            if (state.recording && state.sessionKey) {
                fetch('/api/recording/escalate', {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({ sessionKey: state.sessionKey, level: 1 })
                }).catch(function() {});
                var statusEl = document.getElementById('rp-chunk-status');
                if (statusEl) statusEl.textContent = 'Escalation alert sent to contacts (15 min)';
            }
        }, 900000); // 15 minutes

        state.escalationTimer2 = setTimeout(function() {
            if (state.recording && state.sessionKey) {
                fetch('/api/recording/escalate', {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({ sessionKey: state.sessionKey, level: 2 })
                }).catch(function() {});
                var statusEl = document.getElementById('rp-chunk-status');
                if (statusEl) statusEl.textContent = 'Second escalation sent (30 min)';
            }
        }, 1800000); // 30 minutes

        if (typeof showToast === 'function') showToast('Recording started. Your contacts have been notified.');
    }

    // ============ UPLOAD CHUNK ============
    function uploadChunk(blob) {
        var chunkNum = state.chunkNumber++;
        var reader = new FileReader();
        reader.onloadend = function() {
            var base64 = reader.result.split(',')[1];
            var payload = JSON.stringify({
                sessionKey: state.sessionKey,
                chunkNumber: chunkNum,
                audioData: base64,
                durationMs: 10000,
                latitude: state.lastLat,
                longitude: state.lastLng
            });

            fetch('/api/recording/chunk', {
                method: 'POST',
                headers: authHeaders(),
                body: payload
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var statusEl = document.getElementById('rp-chunk-status');
                if (statusEl) {
                    statusEl.textContent = data.success
                        ? 'Chunk ' + (chunkNum + 1) + ' uploaded securely'
                        : 'Upload error — retrying...';
                }
            })
            .catch(function() {
                var statusEl = document.getElementById('rp-chunk-status');
                if (statusEl) statusEl.textContent = 'Upload error — retrying...';
                setTimeout(function() {
                    fetch('/api/recording/chunk', {
                        method: 'POST',
                        headers: authHeaders(),
                        body: payload
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

        if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
            state.mediaRecorder.stop();
        }

        if (state.watchId !== null) {
            navigator.geolocation.clearWatch(state.watchId);
            state.watchId = null;
        }

        if (state.escalationTimer) { clearTimeout(state.escalationTimer); state.escalationTimer = null; }
        if (state.escalationTimer2) { clearTimeout(state.escalationTimer2); state.escalationTimer2 = null; }

        if (state.sessionKey) {
            fetch('/api/recording/resolve', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ sessionKey: state.sessionKey })
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    var msg = 'Recording saved. ' + (data.totalChunks || 0) + ' chunk(s) stored securely.';
                    if (data.contactsNotified > 0) msg += ' ' + data.contactsNotified + ' contact(s) notified you are safe.';
                    if (typeof showToast === 'function') showToast(msg);
                }
            })
            .catch(function() {
                if (typeof showToast === 'function') showToast('Recording stopped locally. Server sync pending.');
            });
        }

        state.sessionKey = null;
        state.chunkNumber = 0;

        // Restore SOS floating button
        var sosBtn = document.getElementById('sos-floating-btn');
        if (sosBtn) sosBtn.style.display = 'flex';

        hideStealthOverlay();
    }

    // ============ FAKE CALL SETTINGS ============
    window.showFakeCallSettings = function() {
        var settings = null;
        try { settings = JSON.parse(localStorage.getItem('safetea_fakecall_settings')); } catch(e) {}
        if (!settings) settings = { callerName: 'Mom', voiceOption: 'mom', defaultDelay: 15 };

        var backdrop = document.createElement('div');
        backdrop.id = 'fc-settings-modal';
        backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';

        backdrop.innerHTML =
            '<div style="background:#1A1A2E;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;max-width:420px;width:100%;max-height:85vh;overflow-y:auto">' +
                '<h3 style="color:#fff;font-size:17px;margin-bottom:4px"><i class="fas fa-phone" style="color:#E8A0B5"></i> Fake Call Settings</h3>' +
                '<p style="color:#8080A0;font-size:12px;margin-bottom:20px">Customize who calls you</p>' +

                '<label style="display:block;font-size:11px;font-weight:600;color:#8080A0;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Caller Name</label>' +
                '<input id="fc-caller-name" type="text" value="' + (settings.callerName || '') + '" placeholder="e.g., Mom, Sarah" style="width:100%;padding:10px 12px;background:#141428;border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;font-size:14px;font-family:\'Inter\',sans-serif;outline:none;margin-bottom:16px">' +

                '<label style="display:block;font-size:11px;font-weight:600;color:#8080A0;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Voice</label>' +
                '<select id="fc-voice" style="width:100%;padding:10px 12px;background:#141428;border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;font-size:14px;font-family:\'Inter\',sans-serif;outline:none;margin-bottom:16px;-webkit-appearance:auto">' +
                    '<option value="mom"' + (settings.voiceOption === 'mom' ? ' selected' : '') + '>Concerned Mom</option>' +
                    '<option value="bestfriend"' + (settings.voiceOption === 'bestfriend' ? ' selected' : '') + '>Best Friend</option>' +
                    '<option value="sister"' + (settings.voiceOption === 'sister' ? ' selected' : '') + '>Older Sister</option>' +
                    '<option value="dad"' + (settings.voiceOption === 'dad' ? ' selected' : '') + '>Dad</option>' +
                    '<option value="roommate"' + (settings.voiceOption === 'roommate' ? ' selected' : '') + '>Roommate</option>' +
                '</select>' +

                '<label style="display:block;font-size:11px;font-weight:600;color:#8080A0;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Default Delay</label>' +
                '<select id="fc-delay" style="width:100%;padding:10px 12px;background:#141428;border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;font-size:14px;font-family:\'Inter\',sans-serif;outline:none;margin-bottom:20px;-webkit-appearance:auto">' +
                    '<option value="15"' + (settings.defaultDelay === 15 ? ' selected' : '') + '>15 seconds</option>' +
                    '<option value="30"' + (settings.defaultDelay === 30 ? ' selected' : '') + '>30 seconds</option>' +
                    '<option value="60"' + (settings.defaultDelay === 60 ? ' selected' : '') + '>1 minute</option>' +
                    '<option value="120"' + (settings.defaultDelay === 120 ? ' selected' : '') + '>2 minutes</option>' +
                '</select>' +

                '<div style="display:flex;gap:10px">' +
                    '<button id="fc-settings-cancel" style="flex:1;background:rgba(255,255,255,0.06);color:#8080A0;border:none;padding:12px;border-radius:10px;font-size:13px;cursor:pointer;font-family:\'Inter\',sans-serif">Cancel</button>' +
                    '<button id="fc-settings-save" style="flex:1;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;border:none;padding:12px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif"><i class="fas fa-check"></i> Save</button>' +
                '</div>' +
                '<button id="fc-test-call" style="width:100%;margin-top:10px;background:rgba(232,160,181,0.1);border:1px solid rgba(232,160,181,0.2);color:#E8A0B5;padding:10px;border-radius:10px;font-size:13px;cursor:pointer;font-family:\'Inter\',sans-serif"><i class="fas fa-phone"></i> Test Call</button>' +
            '</div>';

        document.body.appendChild(backdrop);
        backdrop.addEventListener('click', function(e) { if (e.target === backdrop) backdrop.remove(); });
        document.getElementById('fc-settings-cancel').onclick = function() { backdrop.remove(); };
        document.getElementById('fc-settings-save').onclick = function() {
            var s = {
                callerName: document.getElementById('fc-caller-name').value || 'Mom',
                voiceOption: document.getElementById('fc-voice').value,
                defaultDelay: parseInt(document.getElementById('fc-delay').value, 10)
            };
            localStorage.setItem('safetea_fakecall_settings', JSON.stringify(s));
            backdrop.remove();
            if (typeof showToast === 'function') showToast('Fake call settings saved!');
        };
        document.getElementById('fc-test-call').onclick = function() {
            var name = document.getElementById('fc-caller-name').value || 'Mom';
            backdrop.remove();
            var testOS = 'ios';
            try { var s = JSON.parse(localStorage.getItem('safetea_fakecall_settings')); if (s && s.phoneOS) testOS = s.phoneOS; } catch(e) {}
            showFakeIncomingCall(name, Promise.resolve(null), testOS);
        };
    };

    // ============ EMERGENCY CONTACTS MANAGEMENT ============
    window.showEmergencyContacts = function() {
        var backdrop = document.createElement('div');
        backdrop.id = 'ec-modal';
        backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';

        backdrop.innerHTML =
            '<div style="background:#1A1A2E;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;max-width:420px;width:100%;max-height:85vh;overflow-y:auto">' +
                '<h3 style="color:#fff;font-size:17px;margin-bottom:4px"><i class="fas fa-user-shield" style="color:#e74c3c"></i> Emergency Contacts</h3>' +
                '<p style="color:#8080A0;font-size:12px;margin-bottom:20px">Up to 2 contacts who get notified during Record & Alert</p>' +

                '<div id="ec-list" style="margin-bottom:16px">' +
                    '<p style="color:#555;font-size:12px;text-align:center">Loading...</p>' +
                '</div>' +

                '<div id="ec-add-form" style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;margin-bottom:16px">' +
                    '<p style="color:#C0C0D0;font-size:13px;font-weight:600;margin-bottom:10px"><i class="fas fa-plus-circle" style="color:#E8A0B5"></i> Add Contact</p>' +
                    '<input id="ec-name" type="text" placeholder="Name (e.g. Mom, Sarah)" maxlength="100" style="width:100%;background:#1A1A2E;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 12px;color:#fff;font-size:14px;margin-bottom:8px;box-sizing:border-box;font-family:\'Inter\',sans-serif" />' +
                    '<input id="ec-phone" type="tel" placeholder="Phone number" maxlength="20" style="width:100%;background:#1A1A2E;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 12px;color:#fff;font-size:14px;margin-bottom:10px;box-sizing:border-box;font-family:\'Inter\',sans-serif" />' +
                    '<button id="ec-add-btn" style="width:100%;background:linear-gradient(135deg,#e74c3c,#c0392b);color:#fff;border:none;padding:11px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif">Add Contact</button>' +
                '</div>' +

                '<button id="ec-close" style="width:100%;background:rgba(255,255,255,0.06);color:#8080A0;border:none;padding:12px;border-radius:10px;font-size:14px;cursor:pointer;font-family:\'Inter\',sans-serif">Done</button>' +
            '</div>';

        document.body.appendChild(backdrop);
        backdrop.addEventListener('click', function(e) { if (e.target === backdrop) backdrop.remove(); });
        document.getElementById('ec-close').onclick = function() { backdrop.remove(); };

        // Load contacts
        loadEmergencyContacts();

        // Add contact handler
        document.getElementById('ec-add-btn').onclick = function() {
            var name = document.getElementById('ec-name').value.trim();
            var phone = document.getElementById('ec-phone').value.trim();
            if (!name || !phone) {
                if (typeof showToast === 'function') showToast('Please enter both name and phone number');
                return;
            }
            var btn = document.getElementById('ec-add-btn');
            btn.textContent = 'Adding...';
            btn.disabled = true;
            fetch('/api/recording/contacts', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ contactName: name, contactPhone: phone })
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                btn.textContent = 'Add Contact';
                btn.disabled = false;
                if (data.success) {
                    document.getElementById('ec-name').value = '';
                    document.getElementById('ec-phone').value = '';
                    loadEmergencyContacts();
                    if (typeof showToast === 'function') showToast('Contact added');
                } else {
                    if (typeof showToast === 'function') showToast(data.error || 'Failed to add contact');
                }
            })
            .catch(function() {
                btn.textContent = 'Add Contact';
                btn.disabled = false;
                if (typeof showToast === 'function') showToast('Network error');
            });
        };
    };

    function loadEmergencyContacts() {
        var list = document.getElementById('ec-list');
        if (!list) return;
        fetch('/api/recording/contacts', { headers: authHeaders() })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data.contacts || data.contacts.length === 0) {
                list.innerHTML = '<div style="text-align:center;padding:16px 0">' +
                    '<i class="fas fa-user-plus" style="font-size:24px;color:#333;margin-bottom:8px;display:block"></i>' +
                    '<p style="color:#555;font-size:12px">No emergency contacts yet.<br>Add up to 2 contacts below.</p>' +
                '</div>';
                // Show add form
                var form = document.getElementById('ec-add-form');
                if (form) form.style.display = 'block';
                return;
            }
            var html = '';
            data.contacts.forEach(function(c) {
                html += '<div style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">' +
                    '<div style="display:flex;align-items:center;gap:10px">' +
                        '<div style="width:36px;height:36px;background:rgba(231,76,60,0.12);border-radius:18px;display:flex;align-items:center;justify-content:center"><i class="fas fa-user" style="font-size:14px;color:#e74c3c"></i></div>' +
                        '<div>' +
                            '<p style="color:#fff;font-size:13px;font-weight:600;margin:0">' + c.contact_name + '</p>' +
                            '<p style="color:#8080A0;font-size:11px;margin:0">' + c.contact_phone + '</p>' +
                        '</div>' +
                    '</div>' +
                    '<button onclick="removeEmergencyContact(' + c.id + ')" style="background:rgba(231,76,60,0.1);border:none;width:30px;height:30px;border-radius:15px;cursor:pointer;display:flex;align-items:center;justify-content:center"><i class="fas fa-trash-alt" style="font-size:12px;color:#e74c3c"></i></button>' +
                '</div>';
            });
            list.innerHTML = html;
            // Hide add form if already 2 contacts
            var form = document.getElementById('ec-add-form');
            if (form) form.style.display = data.contacts.length >= 2 ? 'none' : 'block';
        })
        .catch(function() {
            list.innerHTML = '<p style="color:#e74c3c;font-size:12px;text-align:center">Failed to load contacts</p>';
        });
    }

    window.removeEmergencyContact = function(contactId) {
        if (!confirm('Remove this emergency contact?')) return;
        fetch('/api/recording/contacts?id=' + contactId, {
            method: 'DELETE',
            headers: authHeaders()
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                loadEmergencyContacts();
                if (typeof showToast === 'function') showToast('Contact removed');
            }
        })
        .catch(function() {});
    };

    // ============ INIT ============
    window.initRecordProtect = function() {
        // Set up floating SOS button visibility based on tier
        var user = getUser();
        var sosBtn = document.getElementById('sos-floating-btn');
        if (sosBtn && user && !isPaidUser(user)) {
            sosBtn.classList.add('sos-locked');
        }
    };

    window.startRecordProtect = startRecording;
    window.stopRecordProtect = stopRecording;

})();

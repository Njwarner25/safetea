// SafeTea Dashboard App
(function() {
    'use strict';

    var API = '/api';
    var token = localStorage.getItem('safetea_token');
    var user = JSON.parse(localStorage.getItem('safetea_user') || 'null');
    var selectedImage = null;
    var selectedAvatarColor = null;
    var generatedAvatarData = null;
    var avatarUploadData = null;
    var activeThreadUserId = null;

    // Auth check
    if (!token || !user) {
        window.location.href = '/login.html';
        return;
    }

    // ==================== UTILITIES ====================
    function escapeHtml(s) {
        if (!s) return '';
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function getTimeAgo(ds) {
        if (!ds) return '';
        var now = new Date();
        var date = new Date(ds);
        var secs = Math.floor((now - date) / 1000);
        if (secs < 60) return 'just now';
        if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
        if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
        return Math.floor(secs / 86400) + 'd ago';
    }

    function showToast(msg, isError) {
        var t = document.getElementById('toast');
        t.textContent = msg;
        t.className = 'toast show' + (isError ? ' error' : '');
        setTimeout(function() { t.className = 'toast'; }, 3000);
    }

    function apiFetch(endpoint, options) {
        options = options || {};
        var headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        if (options.headers) {
            for (var k in options.headers) headers[k] = options.headers[k];
        }
        return fetch(API + endpoint, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body
        }).then(function(res) {
            if (res.status === 401) {
                localStorage.removeItem('safetea_token');
                localStorage.removeItem('safetea_user');
                window.location.href = '/login.html';
                return null;
            }
            return res.json();
        });
    }

    function checkPremium() {
        return user && (user.subscription_tier === 'premium' || user.role === 'admin' || user.role === 'moderator');
    }

    // ==================== TAB NAVIGATION ====================
    function initTabs() {
        var navLinks = document.querySelectorAll('.topnav-nav a[data-tab]');
        navLinks.forEach(function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                var tab = this.getAttribute('data-tab');
                switchTab(tab);
            });
        });
    }

    function switchTab(tab) {
        // Update desktop nav
        document.querySelectorAll('.topnav-nav a').forEach(function(a) {
            a.classList.remove('active');
        });
        var activeLink = document.querySelector('.topnav-nav a[data-tab="' + tab + '"]');
        if (activeLink) activeLink.classList.add('active');

        // Update mobile tab bar
        document.querySelectorAll('.mobile-tab-bar a').forEach(function(a) {
            a.classList.toggle('active', a.getAttribute('data-tab') === tab);
        });

        // Show correct section
        document.querySelectorAll('.tab-section').forEach(function(s) {
            s.classList.remove('active');
        });
        var section = document.getElementById('tab-' + tab);
        if (section) section.classList.add('active');

        // Load data for tab
        if (tab === 'alerts') loadFullAlerts();
        if (tab === 'profile') loadProfile();
        if (tab === 'datecheck') initDateCheck();
        if (tab === 'inbox') loadInbox();
        if (tab === 'namewatch') loadNameWatch();
    }
    window.switchTab = switchTab;

    // ==================== SEARCH TABS ====================
    function initSearchTabs() {
        document.querySelectorAll('.search-tab').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var search = this.getAttribute('data-search');
                document.querySelectorAll('.search-tab').forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');
                document.querySelectorAll('.search-panel').forEach(function(p) { p.classList.remove('active'); });
                var panel = document.getElementById('search-' + search);
                if (panel) panel.classList.add('active');
            });
        });
    }

    // ==================== INIT UI ====================
    function initUI() {
        var name = user.display_name || 'Member';
        var initial = name[0].toUpperCase();

        document.getElementById('welcome-name').textContent = 'Welcome back, ' + name + '!';
        document.getElementById('user-city').textContent = user.city || 'Set your city';
        document.getElementById('nav-avatar').textContent = initial;
        document.getElementById('post-avatar').textContent = initial;
        document.getElementById('stat-role').textContent = user.role || 'member';
        document.getElementById('stat-status').textContent = 'Active';

        // Set nav avatar color if available
        if (user.avatar_color) {
            document.getElementById('nav-avatar').style.background = user.avatar_color;
            document.getElementById('post-avatar').style.background = user.avatar_color;
        }

        // Load unread message count for badge
        loadUnreadCount();
    }

    // ==================== POSTS ====================
    function getCategoryBadge(cat) {
        var badges = {
            'warning': '<span class="post-badge badge-warning">Warning</span>',
            'safety-tip': '<span class="post-badge badge-alert">Safety Tip</span>',
            'recommendation': '<span class="post-badge badge-question">Rec</span>',
            'good-news': '<span class="post-badge badge-verified">Good News</span>'
        };
        return badges[cat] || '';
    }

    function renderPost(post) {
        var time = getTimeAgo(post.created_at);
        var badge = getCategoryBadge(post.category);
        var initial = (post.author_name || '?')[0].toUpperCase();
        var colors = ['#6c7b95', '#8e44ad', '#2980b9', '#16a085', '#d35400'];
        var color = colors[post.id % colors.length];

        var html = '<div class="post-card">' +
            '<div class="post-header">' +
            '<div class="post-avatar" style="background:' + color + '">' + initial + '</div>' +
            '<div class="post-meta">' +
            '<div class="post-author">' + escapeHtml(post.author_name || 'Anonymous') + badge + '</div>' +
            '<div class="post-time">' + time + ' \u2022 ' + escapeHtml(post.city || '') + '</div>' +
            '</div></div>' +
            '<div class="post-content">' + escapeHtml(post.body || '') + '</div>' +
            (post.image_url && !post.image_expired ? '<div class="post-image"><img src="' + post.image_url + '" alt="Post image" style="max-width:100%;border-radius:8px;margin:8px 0" loading="lazy"></div>' : '') +
            (post.image_expired ? '<div style="color:#8080A0;font-size:12px;font-style:italic;margin:4px 0">Image expired</div>' : '') +
            '<div class="post-actions">' +
            '<button class="post-action">\uD83D\uDCAC ' + (post.reply_count || 0) + ' replies</button>' +
            '<button class="post-action"><i class="fas fa-flag"></i> Report</button>' +
            '<button class="post-action"><i class="fas fa-share"></i> Share</button>' +
            '</div></div>';
        return html;
    }

    function loadPosts() {
        apiFetch('/posts').then(function(data) {
            var feed = document.getElementById('posts-feed');
            if (!data || !data.posts || data.posts.length === 0) {
                feed.innerHTML = '<div class="empty-state"><i class="fas fa-comments" style="font-size:40px;color:#8080A0;display:block;margin-bottom:12px"></i><p>No posts yet. Be the first to share!</p></div>';
                return;
            }
            feed.innerHTML = data.posts.map(renderPost).join('');
        }).catch(function() {
            document.getElementById('posts-feed').innerHTML = '<div class="empty-state"><p>Unable to load posts. Try refreshing.</p></div>';
        });
    }

    // ==================== CREATE POST ====================
    window.handleImageSelect = function(event) {
        var file = event.target.files[0];
        if (!file) return;
        selectedImage = file;
        var reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('preview-img').src = e.target.result;
            document.getElementById('image-preview').style.display = 'block';
        };
        reader.readAsDataURL(file);
    };

    window.removeImage = function() {
        selectedImage = null;
        document.getElementById('image-preview').style.display = 'none';
        document.getElementById('file-input').value = '';
    };

    window.createPost = function() {
        var content = document.getElementById('new-post-content').value.trim();
        var category = document.getElementById('new-post-category').value;
        if (content.length < 10) {
            showToast('Post must be at least 10 characters.', true);
            return;
        }

        function submitPost(imageData) {
            var postBody = {
                title: content.substring(0, 60),
                body: content,
                city: user.city,
                category: category
            };
            if (imageData) {
                postBody.image_url = imageData;
            }
            apiFetch('/posts', {
                method: 'POST',
                body: JSON.stringify(postBody)
            }).then(function(data) {
                if (data && data.post) {
                    document.getElementById('new-post-content').value = '';
                    window.removeImage();
                    showToast('Post shared!');
                    loadPosts();
                } else {
                    showToast('Failed to create post.', true);
                }
            }).catch(function() {
                showToast('Failed to create post.', true);
            });
        }

        if (selectedImage) {
            var reader = new FileReader();
            reader.onload = function(e) {
                submitPost(e.target.result);
            };
            reader.onerror = function() {
                showToast('Failed to process image.', true);
            };
            reader.readAsDataURL(selectedImage);
        } else {
            submitPost(null);
        }
    };

    // ==================== ALERTS ====================
    function loadAlerts() {
        var city = user.city || '';
        apiFetch('/alerts?city=' + encodeURIComponent(city)).then(function(data) {
            var list = document.getElementById('alerts-list');
            if (!data || !data.alerts || data.alerts.length === 0) {
                list.innerHTML = '<div style="color:#8080A0;font-size:13px;text-align:center;padding:12px">No alerts in your area</div>';
                return;
            }
            list.innerHTML = data.alerts.slice(0, 5).map(function(a) {
                return '<div class="alert-item">' +
                    '<div class="alert-title"><span class="severity-dot severity-' + (a.severity || 'low') + '"></span>' + escapeHtml(a.title) + '</div>' +
                    '<div class="alert-meta">' + escapeHtml(a.type || '') + ' \u2022 ' + escapeHtml(a.city || '') + '</div></div>';
            }).join('');
        }).catch(function() {
            document.getElementById('alerts-list').innerHTML = '<div style="color:#8080A0;font-size:13px">Unable to load alerts</div>';
        });
    }

    function loadFullAlerts() {
        var city = user.city || '';
        apiFetch('/alerts?city=' + encodeURIComponent(city)).then(function(data) {
            var list = document.getElementById('alerts-full-list');
            if (!data || !data.alerts || data.alerts.length === 0) {
                list.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle" style="font-size:40px;color:#2ecc71;display:block;margin-bottom:12px"></i><p>No alerts in your area. Stay safe!</p></div>';
                return;
            }
            list.innerHTML = data.alerts.map(function(a) {
                var icon = a.severity === 'high' ? 'fa-exclamation-circle' : (a.severity === 'medium' ? 'fa-exclamation-triangle' : 'fa-info-circle');
                return '<div class="alert-card">' +
                    '<div class="alert-card-header">' +
                    '<div class="alert-icon ' + (a.severity || 'low') + '"><i class="fas ' + icon + '"></i></div>' +
                    '<div><div class="alert-card-title">' + escapeHtml(a.title) + '</div>' +
                    '<div class="alert-card-meta">' + escapeHtml(a.type || 'Alert') + ' \u2022 ' + escapeHtml(a.city || '') + ' \u2022 ' + getTimeAgo(a.created_at) + '</div></div>' +
                    '</div>' +
                    '<div class="alert-card-body">' + escapeHtml(a.description || 'No additional details available.') + '</div>' +
                    '</div>';
            }).join('');
        }).catch(function() {
            document.getElementById('alerts-full-list').innerHTML = '<div class="empty-state"><p>Unable to load alerts.</p></div>';
        });
    }

    // ==================== CITIES ====================
    function loadCities() {
        apiFetch('/cities').then(function(data) {
            var list = document.getElementById('cities-list');
            if (!data || !data.cities || data.cities.length === 0) {
                list.innerHTML = '<div style="color:#8080A0;font-size:13px">No cities yet</div>';
                return;
            }
            list.innerHTML = data.cities.slice(0, 5).map(function(c, i) {
                return '<div class="city-row">' +
                    '<div><span class="city-rank">#' + (i + 1) + '</span>' +
                    '<span class="city-name">' + escapeHtml(c.city) + ', ' + escapeHtml(c.state || '') + '</span></div>' +
                    '<span class="city-votes">' + c.votes + ' votes</span></div>';
            }).join('');
        }).catch(function() {
            document.getElementById('cities-list').innerHTML = '<div style="color:#8080A0;font-size:13px">Unable to load cities</div>';
        });
    }

    // ==================== INBOX / MESSAGING ====================
    function loadUnreadCount() {
        apiFetch('/messages/unread/count').then(function(data) {
            var badge = document.getElementById('inbox-badge');
            if (data && data.unread > 0) {
                badge.textContent = data.unread;
                badge.style.display = 'inline';
            } else {
                badge.style.display = 'none';
            }
        }).catch(function() {
            // Silently fail — user may not be premium
        });
    }

    function loadInbox() {
        var gate = document.getElementById('inbox-gate');
        var content = document.getElementById('inbox-content');

        if (!checkPremium()) {
            gate.style.display = 'flex';
            content.style.display = 'none';
            return;
        }

        gate.style.display = 'none';
        content.style.display = 'block';

        var convos = document.getElementById('inbox-conversations');
        convos.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

        apiFetch('/messages').then(function(data) {
            if (!data || !data.conversations || data.conversations.length === 0) {
                convos.innerHTML = '<div style="text-align:center;padding:40px;color:#8080A0"><i class="fas fa-inbox" style="font-size:32px;display:block;margin-bottom:12px"></i><p>No messages yet</p><p style="font-size:12px;margin-top:4px">Messages from referrals and the community will appear here.</p></div>';
                return;
            }
            convos.innerHTML = data.conversations.map(function(c) {
                var displayName = c.other_custom_name || c.other_name || 'User';
                var initial = displayName[0].toUpperCase();
                var color = c.other_avatar_color || '#6c7b95';
                return '<div class="convo-item" onclick="openThread(\'' + c.other_user_id + '\')" data-uid="' + c.other_user_id + '">' +
                    '<div class="convo-avatar" style="background:' + escapeHtml(color) + '">' + escapeHtml(initial) + '</div>' +
                    '<div class="convo-info">' +
                    '<div class="convo-name">' + escapeHtml(displayName) + '</div>' +
                    '<div class="convo-preview">' + escapeHtml(c.last_message || '') + '</div>' +
                    '</div>' +
                    '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">' +
                    '<div class="convo-time">' + getTimeAgo(c.last_message_at) + '</div>' +
                    (c.unread_count > 0 ? '<div class="convo-unread">' + c.unread_count + '</div>' : '') +
                    '</div></div>';
            }).join('');
        }).catch(function() {
            convos.innerHTML = '<div style="text-align:center;padding:20px;color:#8080A0">Unable to load conversations</div>';
        });
    }

    window.openThread = function(userId) {
        activeThreadUserId = userId;

        // Highlight active conversation
        document.querySelectorAll('.convo-item').forEach(function(el) {
            el.classList.remove('active');
        });
        var activeEl = document.querySelector('.convo-item[data-uid="' + userId + '"]');
        if (activeEl) activeEl.classList.add('active');

        loadThread(userId);
    };

    function loadThread(userId) {
        var thread = document.getElementById('inbox-thread');
        thread.innerHTML = '<div class="loading" style="display:flex;align-items:center;justify-content:center;height:100%"><i class="fas fa-spinner fa-spin"></i></div>';

        apiFetch('/messages/' + userId).then(function(data) {
            if (!data) return;

            var otherName = 'User';
            var otherColor = '#6c7b95';
            var otherInitial = '?';
            if (data.otherUser) {
                otherName = data.otherUser.custom_display_name || data.otherUser.display_name || 'User';
                otherColor = data.otherUser.avatar_color || '#6c7b95';
                otherInitial = otherName[0].toUpperCase();
            }

            var messagesHtml = '';
            if (data.messages && data.messages.length > 0) {
                messagesHtml = data.messages.map(function(m) {
                    var isSent = m.sender_id === user.id;
                    return '<div class="msg-bubble ' + (isSent ? 'sent' : 'received') + '">' +
                        escapeHtml(m.content) +
                        '</div>' +
                        '<div class="msg-time ' + (isSent ? 'sent' : '') + '">' + getTimeAgo(m.created_at) + '</div>';
                }).join('');
            } else {
                messagesHtml = '<div style="text-align:center;padding:40px;color:#8080A0">No messages yet. Start the conversation!</div>';
            }

            thread.innerHTML =
                '<div class="thread-header">' +
                '<div class="convo-avatar" style="background:' + escapeHtml(otherColor) + ';width:36px;height:36px;font-size:14px">' + escapeHtml(otherInitial) + '</div>' +
                '<div class="thread-header-name">' + escapeHtml(otherName) + '</div>' +
                '</div>' +
                '<div class="thread-messages" id="thread-messages">' + messagesHtml + '</div>' +
                '<div class="thread-input">' +
                '<input type="text" id="message-input" placeholder="Type a message..." onkeypress="if(event.key===\'Enter\')sendMessage()">' +
                '<button onclick="sendMessage()"><i class="fas fa-paper-plane"></i></button>' +
                '</div>';

            // Scroll to bottom
            var msgContainer = document.getElementById('thread-messages');
            if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;

            // Refresh unread count
            loadUnreadCount();
        }).catch(function() {
            thread.innerHTML = '<div class="inbox-thread-empty"><p>Unable to load messages.</p></div>';
        });
    }

    window.sendMessage = function() {
        if (!activeThreadUserId) return;
        var input = document.getElementById('message-input');
        var content = input.value.trim();
        if (!content) return;

        input.value = '';

        apiFetch('/messages', {
            method: 'POST',
            body: JSON.stringify({ recipient_id: activeThreadUserId, content: content })
        }).then(function(data) {
            if (data && data.message) {
                loadThread(activeThreadUserId);
            } else if (data && data.error) {
                showToast(data.error, true);
            }
        }).catch(function() {
            showToast('Failed to send message.', true);
        });
    };

    // ==================== AVATAR CUSTOMIZATION ====================
    var AVATAR_COLORS = [
        '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#6c7b95',
        '#1abc9c', '#d35400', '#8e44ad', '#2980b9', '#27ae60', '#c0392b', '#7f8c8d'
    ];

    function initAvatarColorPicker() {
        var container = document.getElementById('color-swatches');
        if (!container) return;
        var currentColor = user.avatar_color || '#E8A0B5';
        selectedAvatarColor = currentColor;

        container.innerHTML = AVATAR_COLORS.map(function(c) {
            var active = c === currentColor ? ' active' : '';
            return '<div class="color-swatch' + active + '" style="background:' + c + '" onclick="selectAvatarColor(\'' + c + '\')" data-color="' + c + '"></div>';
        }).join('');
    }

    window.selectAvatarColor = function(color) {
        selectedAvatarColor = color;
        document.querySelectorAll('.color-swatch').forEach(function(el) {
            el.classList.remove('active');
        });
        var swatch = document.querySelector('.color-swatch[data-color="' + color + '"]');
        if (swatch) swatch.classList.add('active');

        // Update preview
        var preview = document.getElementById('avatar-preview');
        if (preview) preview.style.background = color;
    };

    window.onAvatarTypeChange = function(type) {
        // Hide all sub-options
        document.getElementById('custom-name-input').style.display = 'none';
        document.getElementById('generated-name-input').style.display = 'none';
        document.getElementById('upload-avatar-input').style.display = 'none';

        if (type === 'custom') {
            document.getElementById('custom-name-input').style.display = 'block';
        } else if (type === 'generated') {
            document.getElementById('generated-name-input').style.display = 'block';
            if (!generatedAvatarData) generateRandomName();
        } else if (type === 'upload') {
            document.getElementById('upload-avatar-input').style.display = 'block';
            if (checkPremium()) {
                document.getElementById('upload-avatar-gate').style.display = 'none';
                document.getElementById('upload-avatar-form').style.display = 'block';
            } else {
                document.getElementById('upload-avatar-gate').style.display = 'block';
                document.getElementById('upload-avatar-form').style.display = 'none';
            }
        }

        updateAvatarPreview(type);
    };

    function updateAvatarPreview(type) {
        var preview = document.getElementById('avatar-preview');
        var previewName = document.getElementById('avatar-preview-name');
        if (!preview || !previewName) return;

        var name = user.display_name || 'Member';
        var initial = name[0].toUpperCase();
        var color = selectedAvatarColor || user.avatar_color || '#E8A0B5';

        preview.style.background = color;
        preview.innerHTML = '';

        if (type === 'initial') {
            preview.textContent = initial;
            previewName.textContent = 'Anonymous';
        } else if (type === 'custom') {
            var customName = document.getElementById('edit-custom-name');
            var cn = customName ? customName.value.trim() : '';
            preview.textContent = cn ? cn[0].toUpperCase() : initial;
            previewName.textContent = cn || 'Custom Name';
        } else if (type === 'generated') {
            if (generatedAvatarData) {
                preview.textContent = generatedAvatarData.initial;
                previewName.textContent = generatedAvatarData.display_name;
            } else {
                preview.textContent = '?';
                previewName.textContent = 'Generating...';
            }
        } else if (type === 'upload') {
            if (avatarUploadData) {
                preview.innerHTML = '<img src="' + avatarUploadData + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
            } else {
                preview.textContent = initial;
            }
            previewName.textContent = name;
        }
    }

    window.generateRandomName = function() {
        apiFetch('/users/generate-avatar').then(function(data) {
            if (data && data.display_name) {
                generatedAvatarData = data;
                document.getElementById('generated-name-display').textContent = data.display_name;
                // Update color if provided
                if (data.color) {
                    window.selectAvatarColor(data.color);
                }
                updateAvatarPreview('generated');
            }
        }).catch(function() {
            showToast('Failed to generate name.', true);
        });
    };

    window.handleAvatarUpload = function(event) {
        var file = event.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(e) {
            avatarUploadData = e.target.result;
            document.getElementById('avatar-preview-img').src = e.target.result;
            document.getElementById('avatar-upload-preview').style.display = 'block';
            updateAvatarPreview('upload');
        };
        reader.readAsDataURL(file);
    };

    window.saveAvatar = function() {
        var selectedType = document.querySelector('input[name="avatar-type"]:checked');
        if (!selectedType) {
            showToast('Please select an avatar type.', true);
            return;
        }

        var type = selectedType.value;
        var payload = {
            avatar_type: type,
            avatar_color: selectedAvatarColor || user.avatar_color
        };

        if (type === 'custom') {
            var customName = document.getElementById('edit-custom-name').value.trim();
            if (!customName) {
                showToast('Please enter a display name.', true);
                return;
            }
            payload.custom_display_name = customName;
            payload.avatar_initial = customName[0].toUpperCase();
        } else if (type === 'generated') {
            if (!generatedAvatarData) {
                showToast('Please generate a name first.', true);
                return;
            }
            payload.custom_display_name = generatedAvatarData.display_name;
            payload.avatar_initial = generatedAvatarData.initial;
            payload.avatar_color = generatedAvatarData.color || selectedAvatarColor;
        } else if (type === 'upload') {
            if (avatarUploadData) {
                payload.avatar_url = avatarUploadData;
            }
        } else if (type === 'initial') {
            payload.avatar_initial = (user.display_name || 'M')[0].toUpperCase();
        }

        apiFetch('/users/profile', {
            method: 'PUT',
            body: JSON.stringify(payload)
        }).then(function(data) {
            if (data && data.user) {
                // Update local user
                user.avatar_type = data.user.avatar_type;
                user.avatar_color = data.user.avatar_color;
                user.avatar_initial = data.user.avatar_initial;
                user.avatar_url = data.user.avatar_url;
                user.custom_display_name = data.user.custom_display_name;
                localStorage.setItem('safetea_user', JSON.stringify(user));
                initUI();
                showToast('Avatar updated!');
            } else if (data && data.error) {
                showToast(data.error, true);
            }
        }).catch(function() {
            showToast('Failed to update avatar.', true);
        });
    };

    window.showUpgradePrompt = function() {
        showToast('Upgrade coming soon! Premium features are $5.99/mo.', false);
    };

    // ==================== PROFILE ====================
    function loadProfile() {
        var name = user.display_name || 'Member';
        var initial = (user.avatar_initial || name[0]).toUpperCase();
        var color = user.avatar_color || '#E8A0B5';

        // Profile card
        var profileAvatar = document.getElementById('profile-avatar');
        profileAvatar.textContent = initial;
        profileAvatar.style.background = color;

        document.getElementById('profile-name').textContent = name;
        document.getElementById('profile-email').textContent = user.email || '';
        document.getElementById('profile-role').textContent = user.role || 'member';

        // Show premium badge if applicable
        var tierEl = document.getElementById('profile-tier');
        if (tierEl) {
            tierEl.style.display = checkPremium() ? 'block' : 'none';
        }

        // Edit form
        document.getElementById('edit-name').value = user.display_name || '';
        document.getElementById('edit-city').value = user.city || '';
        document.getElementById('edit-bio').value = user.bio || '';

        // Avatar customization
        var avatarPreview = document.getElementById('avatar-preview');
        if (avatarPreview) {
            avatarPreview.textContent = initial;
            avatarPreview.style.background = color;
        }
        var previewName = document.getElementById('avatar-preview-name');
        if (previewName) {
            previewName.textContent = user.custom_display_name || 'Anonymous';
        }

        // Set avatar type radio
        var currentType = user.avatar_type || 'initial';
        var radio = document.querySelector('input[name="avatar-type"][value="' + currentType + '"]');
        if (radio) {
            radio.checked = true;
            window.onAvatarTypeChange(currentType);
        }

        // Populate custom name if set
        if (user.custom_display_name) {
            document.getElementById('edit-custom-name').value = user.custom_display_name;
        }

        initAvatarColorPicker();
    }

    window.saveProfile = function() {
        var name = document.getElementById('edit-name').value.trim();
        var city = document.getElementById('edit-city').value.trim();
        var bio = document.getElementById('edit-bio').value.trim();
        if (!name) { showToast('Name is required.', true); return; }

        apiFetch('/users/profile', {
            method: 'PUT',
            body: JSON.stringify({ display_name: name, city: city, bio: bio })
        }).then(function(data) {
            if (data && data.user) {
                user.display_name = data.user.display_name;
                user.city = data.user.city;
                user.bio = data.user.bio;
                localStorage.setItem('safetea_user', JSON.stringify(user));
                initUI();
                showToast('Profile updated!');
            } else {
                showToast('Failed to update profile.', true);
            }
        }).catch(function() {
            showToast('Failed to update profile.', true);
        });
    };

    // ==================== SEARCH: SEX OFFENDER ====================
    window.searchOffenders = function() {
        var first = document.getElementById('so-first-name').value.trim();
        var last = document.getElementById('so-last-name').value.trim();
        var city = document.getElementById('so-city').value.trim();
        var state = document.getElementById('so-state').value;
        var results = document.getElementById('offender-results');

        if (!last) {
            showToast('Last name is required.', true);
            return;
        }

        results.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Searching public records...</div>';

        // Simulate search with delay (in production this would hit a real API like NSOPW)
        setTimeout(function() {
            var query = (first + ' ' + last).trim().toLowerCase();
            var sampleOffenders = [
                { name: 'John Smith', city: 'Austin', state: 'Texas', risk: 'Level 2', offense: 'Indecency with a child', year: '2018' },
                { name: 'Robert Johnson', city: 'Dallas', state: 'Texas', risk: 'Level 3', offense: 'Sexual assault', year: '2015' },
                { name: 'Michael Williams', city: 'Houston', state: 'Texas', risk: 'Level 1', offense: 'Online solicitation', year: '2020' }
            ];

            var matches = sampleOffenders.filter(function(o) {
                var nameMatch = o.name.toLowerCase().indexOf(query) !== -1;
                var cityMatch = !city || o.city.toLowerCase().indexOf(city.toLowerCase()) !== -1;
                var stateMatch = !state || o.state.toLowerCase() === state.toLowerCase();
                return nameMatch && cityMatch && stateMatch;
            });

            if (matches.length > 0) {
                results.innerHTML = '<h4 style="color:#e74c3c;margin-bottom:12px"><i class="fas fa-exclamation-triangle"></i> ' + matches.length + ' result(s) found</h4>' +
                    matches.map(function(m) {
                        return '<div class="result-card">' +
                            '<div class="result-avatar"><i class="fas fa-user"></i></div>' +
                            '<div class="result-info">' +
                            '<h4>' + escapeHtml(m.name) + ' <span class="result-badge badge-danger">' + m.risk + '</span></h4>' +
                            '<div class="result-detail"><i class="fas fa-map-marker-alt"></i> ' + escapeHtml(m.city) + ', ' + escapeHtml(m.state) + '</div>' +
                            '<div class="result-detail"><i class="fas fa-gavel"></i> ' + escapeHtml(m.offense) + ' (' + m.year + ')</div>' +
                            '</div></div>';
                    }).join('');
            } else {
                results.innerHTML = '<div class="result-card" style="text-align:center;justify-content:center">' +
                    '<div><i class="fas fa-check-circle" style="color:#2ecc71;font-size:32px;margin-bottom:8px"></i>' +
                    '<h4 style="color:#2ecc71">No matches found</h4>' +
                    '<p style="color:#8080A0;font-size:13px;margin-top:4px">No registered sex offenders matching "' + escapeHtml(first + ' ' + last) + '" were found in public records.' +
                    (state ? ' State: ' + escapeHtml(state) : '') + '</p>' +
                    '<p style="color:#8080A0;font-size:11px;margin-top:8px">For comprehensive results, also check <a href="https://www.nsopw.gov" target="_blank" style="color:#E8A0B5">NSOPW.gov</a></p></div></div>';
            }
        }, 2000);
    };

    // ==================== SEARCH: BACKGROUND CHECK ====================
    window.runBackgroundCheck = function() {
        var name = document.getElementById('bg-name').value.trim();
        var city = document.getElementById('bg-city').value.trim();
        var state = document.getElementById('bg-state').value.trim();
        var age = document.getElementById('bg-age') ? document.getElementById('bg-age').value.trim() : '';
        var results = document.getElementById('background-results');

        if (!name) {
            showToast('Full name is required.', true);
            return;
        }

        results.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Searching public records for ' + escapeHtml(name) + '...</div>';

        apiFetch('/search/background', {
            method: 'POST',
            body: JSON.stringify({ name: name, city: city, state: state, age: age })
        }).then(function(data) {
            if (!data || data.error) {
                results.innerHTML = '<div class="empty-state"><p>' + escapeHtml(data ? data.error : 'Search failed') + '</p></div>';
                return;
            }

            var html = '<h4 style="color:#fff;margin-bottom:4px"><i class="fas fa-file-alt" style="color:#E8A0B5"></i> Background Report: ' + escapeHtml(data.name) + '</h4>';
            html += '<div style="color:#8080A0;font-size:12px;margin-bottom:16px">' + escapeHtml(data.location) + ' \u2022 ' + data.total_results + ' results found \u2022 ' + new Date(data.searched_at).toLocaleString() + '</div>';

            var iconMap = { gavel: 'fa-gavel', 'user-shield': 'fa-user-shield', 'balance-scale': 'fa-balance-scale', newspaper: 'fa-newspaper', globe: 'fa-globe', 'file-alt': 'fa-file-alt' };
            var colorMap = { criminal: '#e74c3c', sex_offender: '#e74c3c', court: '#f39c12', news: '#3498db', social: '#9b59b6', other: '#95a5a6' };

            var cats = data.categories || {};
            var hasAnyResults = false;

            Object.keys(cats).forEach(function(key) {
                var cat = cats[key];
                var hasResults = cat.results && cat.results.length > 0;
                var hasRegistries = cat.registries && cat.registries.length > 0;
                if (!hasResults && !hasRegistries) return;
                hasAnyResults = true;

                var catColor = colorMap[key] || '#95a5a6';
                var iconClass = iconMap[cat.icon] || 'fa-search';
                var badgeClass = (key === 'criminal' || key === 'sex_offender') ? 'badge-caution' : 'badge-clear';
                var badgeText = (cat.results ? cat.results.length : 0) + ' found';

                html += '<div class="result-card" style="border-left:3px solid ' + catColor + '">';
                html += '<div class="result-avatar" style="background:rgba(' + (key === 'criminal' || key === 'sex_offender' ? '231,76,60' : '52,152,219') + ',0.1)"><i class="fas ' + iconClass + '" style="color:' + catColor + '"></i></div>';
                html += '<div class="result-info"><h4>' + escapeHtml(cat.label) + ' <span class="result-badge ' + badgeClass + '">' + badgeText + '</span></h4>';

                // Render official registry links for sex offender category
                if (hasRegistries) {
                    html += '<div style="margin:8px 0;padding:10px;background:rgba(232,160,181,0.08);border:1px solid rgba(232,160,181,0.2);border-radius:8px">';
                    html += '<div style="color:#E8A0B5;font-size:12px;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px"><i class="fas fa-shield-alt" style="margin-right:4px"></i> Official Registries — Search Directly</div>';
                    cat.registries.forEach(function(reg) {
                        html += '<div style="margin:6px 0;padding:6px 8px;background:rgba(255,255,255,0.04);border-radius:4px;display:flex;align-items:center">';
                        html += '<i class="fas fa-external-link-alt" style="color:#E8A0B5;margin-right:8px;font-size:11px"></i>';
                        html += '<div>';
                        html += '<a href="' + escapeHtml(reg.url) + '" target="_blank" rel="noopener" style="color:#E8A0B5;font-size:13px;font-weight:600;text-decoration:none">' + escapeHtml(reg.label) + '</a>';
                        html += '<div style="color:#718096;font-size:11px">' + escapeHtml(reg.county) + '</div>';
                        html += '</div></div>';
                    });
                    html += '</div>';
                }

                if (cat.results) {
                    cat.results.forEach(function(r) {
                        html += '<div style="margin:8px 0;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px">';
                        if (r.link) {
                            html += '<a href="' + escapeHtml(r.link) + '" target="_blank" rel="noopener" style="color:#E8A0B5;font-size:13px;font-weight:600;text-decoration:none">' + escapeHtml(r.title || 'View Source') + '</a>';
                        } else {
                            html += '<div style="color:#fff;font-size:13px;font-weight:600">' + escapeHtml(r.title || 'Result') + '</div>';
                        }
                        if (r.snippet) {
                            html += '<div style="color:#A0AEC0;font-size:12px;margin-top:4px">' + escapeHtml(r.snippet).substring(0, 200) + '</div>';
                        }
                        if (r.source) {
                            html += '<div style="color:#718096;font-size:11px;margin-top:2px">' + escapeHtml(r.source) + '</div>';
                        }
                        html += '</div>';
                    });
                }

                html += '</div></div>';
            });

            if (!hasAnyResults) {
                html += '<div class="result-card">';
                html += '<div class="result-avatar" style="background:rgba(46,204,113,0.1)"><i class="fas fa-check" style="color:#2ecc71"></i></div>';
                html += '<div class="result-info"><h4>No Public Records Found <span class="result-badge badge-clear">Clear</span></h4>';
                html += '<div class="result-detail">No concerning public records found for this person. This does not guarantee safety \u2014 always take precautions.</div>';
                html += '</div></div>';
            }

            html += '<div class="disclaimer" style="margin-top:16px"><i class="fas fa-info-circle"></i><span>' + escapeHtml(data.disclaimer) + '</span></div>';
            results.innerHTML = html;

        }).catch(function(err) {
            results.innerHTML = '<div class="empty-state"><p>Search failed. Please try again.</p></div>';
        });
    };

    // ==================== LOGOUT ====================
    window.handleLogout = function() {
        localStorage.removeItem('safetea_token');
        localStorage.removeItem('safetea_user');
        window.location.href = '/login.html';
    };

    // ==================== NAME WATCH ====================
    var nwLoaded = false;

    function loadNameWatch() {
        var isPro = checkPremium();
        var gate = document.getElementById('nw-pro-gate');
        var content = document.getElementById('nw-pro-content');

        if (!isPro) {
            if (gate) gate.style.display = 'block';
            if (content) content.style.display = 'none';
            return;
        }

        if (gate) gate.style.display = 'none';
        if (content) content.style.display = 'block';

        loadWatchedNames();
        loadMatches();
        nwLoaded = true;
    }

    function loadWatchedNames() {
        var container = document.getElementById('nw-watched-list');
        if (!container) return;

        apiFetch('/namewatch').then(function(data) {
            if (!data || !data.names) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-eye" style="font-size:32px;color:#8080A0;margin-bottom:12px"></i><p>No names being watched yet.<br>Add a name above to get started.</p></div>';
                return;
            }

            if (data.names.length === 0) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-eye" style="font-size:32px;color:#8080A0;margin-bottom:12px"></i><p>No names being watched yet.<br>Add a name above to get started.</p></div>';
                return;
            }

            var html = '';
            data.names.forEach(function(n) {
                var matchCount = parseInt(n.match_count) || 0;
                var terms = (n.search_terms || []).join(', ');
                var badgeClass = matchCount > 0 ? 'nw-badge-matches' : 'nw-badge-none';
                var badgeText = matchCount > 0 ? matchCount + ' match' + (matchCount !== 1 ? 'es' : '') : 'No matches';

                html += '<div class="nw-list-item">' +
                    '<div class="nw-list-icon"><i class="fas fa-user"></i></div>' +
                    '<div class="nw-list-info">' +
                        '<div class="nw-list-name">' + escapeHtml(n.display_name) + '</div>' +
                        '<div class="nw-list-terms">Watching: ' + escapeHtml(terms) + '</div>' +
                    '</div>' +
                    '<span class="nw-list-badge ' + badgeClass + '">' + badgeText + '</span>' +
                    '<button class="nw-list-delete" onclick="removeWatchedName(\'' + n.id + '\')" title="Remove"><i class="fas fa-trash-alt"></i></button>' +
                '</div>';
            });

            container.innerHTML = html;
        }).catch(function() {
            container.innerHTML = '<div class="empty-state">Failed to load watch list.</div>';
        });
    }

    function loadMatches() {
        var container = document.getElementById('nw-matches-list');
        if (!container) return;

        apiFetch('/namewatch/matches').then(function(data) {
            if (!data || !data.matches || data.matches.length === 0) {
                container.innerHTML = '<div class="empty-state" style="padding:24px"><i class="fas fa-bell-slash" style="font-size:28px;color:#8080A0;margin-bottom:10px;display:block"></i>No matches found yet. When someone in your city posts about a name you\'re watching, it will show up here.</div>';
                return;
            }

            var html = '';
            data.matches.forEach(function(m) {
                var unreadClass = !m.is_read ? ' unread' : '';
                var excerpt = m.post_content || '';
                if (excerpt.length > 200) excerpt = excerpt.substring(0, 200) + '...';

                html += '<div class="nw-match-card' + unreadClass + '">' +
                    '<div class="nw-match-header">' +
                        '<i class="fas fa-bell nw-match-icon"></i>' +
                        '<span class="nw-match-label">Match: ' + escapeHtml(m.watched_name) + '</span>' +
                        '<span class="nw-match-type-badge">' + escapeHtml(m.match_type) + ' match</span>' +
                    '</div>' +
                    '<div class="nw-match-body">' + escapeHtml(excerpt) + '</div>' +
                    '<div class="nw-match-footer">' +
                        '<span><i class="fas fa-map-marker-alt"></i> ' + escapeHtml(m.post_city || '') + '</span>' +
                        '<span><i class="fas fa-clock"></i> ' + getTimeAgo(m.post_created_at) + '</span>' +
                        '<span><i class="fas fa-search"></i> Matched: "' + escapeHtml(m.matched_term) + '"</span>' +
                        (!m.is_read ? '<button class="nw-mark-read" onclick="markMatchRead(\'' + m.id + '\', this)"><i class="fas fa-check"></i> Mark Read</button>' : '') +
                    '</div>' +
                '</div>';
            });

            container.innerHTML = html;
        }).catch(function() {
            container.innerHTML = '<div class="empty-state">Failed to load matches.</div>';
        });
    }

    function addWatchedName() {
        var input = document.getElementById('nw-name-input');
        var name = input.value.trim();
        if (!name || name.length < 2) {
            showToast('Please enter a name (at least 2 characters)', true);
            return;
        }

        apiFetch('/namewatch', {
            method: 'POST',
            body: JSON.stringify({ name: name })
        }).then(function(data) {
            if (data && data.error) {
                showToast(data.error, true);
                return;
            }
            input.value = '';
            showToast('Now watching "' + name + '"');
            loadWatchedNames();
            loadMatches();
        }).catch(function() {
            showToast('Failed to add watched name', true);
        });
    }
    window.addWatchedName = addWatchedName;

    function removeWatchedName(id) {
        if (!confirm('Remove this name from your watch list?')) return;

        apiFetch('/namewatch/' + id, { method: 'DELETE' }).then(function(data) {
            if (data && data.success) {
                showToast('Name removed from watch list');
                loadWatchedNames();
                loadMatches();
            } else {
                showToast('Failed to remove name', true);
            }
        }).catch(function() {
            showToast('Failed to remove name', true);
        });
    }
    window.removeWatchedName = removeWatchedName;

    function markMatchRead(matchId, btn) {
        apiFetch('/namewatch/matches/' + matchId + '/read', { method: 'PUT' }).then(function(data) {
            if (data && data.success) {
                var card = btn.closest('.nw-match-card');
                if (card) card.classList.remove('unread');
                btn.remove();
                updateNwBadge();
            }
        });
    }
    window.markMatchRead = markMatchRead;

    function markAllMatchesRead() {
        apiFetch('/namewatch/matches/read-all', { method: 'PUT' }).then(function(data) {
            if (data && data.success) {
                showToast('All matches marked as read');
                loadMatches();
                updateNwBadge();
            }
        });
    }
    window.markAllMatchesRead = markAllMatchesRead;

    function updateNwBadge() {
        if (!checkPremium()) return;
        apiFetch('/namewatch/unread').then(function(data) {
            var badge = document.getElementById('nw-badge');
            if (badge && data) {
                var count = parseInt(data.count) || 0;
                badge.textContent = count;
                badge.style.display = count > 0 ? 'inline' : 'none';
            }
        }).catch(function() {});
    }

    // Allow enter key in name input
    var nwInput = document.getElementById('nw-name-input');
    if (nwInput) {
        nwInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') addWatchedName();
        });
    }

    // ==================== INIT ====================
    initUI();
    initTabs();
    initSearchTabs();
    loadPosts();
    loadAlerts();
    loadCities();
    updateNwBadge();

    // Refresh user data from server to pick up subscription_tier changes
    apiFetch('/auth/me').then(function(data) {
        if (data && data.user) {
            user = Object.assign(user, data.user);
            localStorage.setItem('safetea_user', JSON.stringify(user));
        }
    }).catch(function() {});
})();

    // ==================== DATE CHECK-IN/CHECK-OUT ====================
    var activeCheckout = null;
    var dcTimerInterval = null;

    function initDateCheck() {
        if (!checkPremium()) {
            document.getElementById('dc-upgrade-wall').style.display = 'block';
            document.getElementById('dc-premium-content').style.display = 'none';
        } else {
            document.getElementById('dc-upgrade-wall').style.display = 'none';
            document.getElementById('dc-premium-content').style.display = 'block';
            loadDateHistory();
        }
        var now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        var el = document.getElementById('dc-scheduled-time');
        if (el) el.value = now.toISOString().slice(0,16);
        var ret = new Date(Date.now() + 3 * 3600000);
        ret.setMinutes(ret.getMinutes() - ret.getTimezoneOffset());
        var retEl = document.getElementById('dc-return-time');
        if (retEl) retEl.value = ret.toISOString().slice(0,16);
    }

    window.addContactRow = function() {
        var list = document.getElementById('dc-contacts-list');
        if (list.children.length >= 5) { showToast('Maximum 5 contacts', true); return; }
        var row = document.createElement('div');
        row.className = 'dc-contact-row';
        row.innerHTML = '<input type="text" placeholder="Name" class="dc-contact-name"><input type="tel" placeholder="Phone" class="dc-contact-phone"><button class="dc-contact-remove" onclick="this.parentElement.remove()" title="Remove">&times;</button>';
        list.appendChild(row);
    };

    window.dateCheckOut = function() {
        var dateName = document.getElementById('dc-date-name').value.trim();
        var venueName = document.getElementById('dc-venue-name').value.trim();
        var scheduledTime = document.getElementById('dc-scheduled-time').value;
        if (!dateName || !venueName || !scheduledTime) { showToast('Please fill in name, venue, and time.', true); return; }
        var contactRows = document.querySelectorAll('.dc-contact-row');
        var contacts = [];
        contactRows.forEach(function(row) {
            var name = row.querySelector('.dc-contact-name').value.trim();
            var phone = row.querySelector('.dc-contact-phone').value.trim().replace(/[^\d+]/g, '');
            if (phone) {
                if (!phone.startsWith('+')) phone = '+1' + phone;
                contacts.push({ name: name || 'Contact', phone: phone });
            }
        });
        var btn = document.getElementById('dc-checkout-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking out...';
        apiFetch('/dates/checkout', {
            method: 'POST',
            body: JSON.stringify({
                dateName: dateName, venueName: venueName,
                venueAddress: document.getElementById('dc-venue-address').value.trim(),
                scheduledTime: new Date(scheduledTime).toISOString(),
                estimatedReturn: document.getElementById('dc-return-time').value ? new Date(document.getElementById('dc-return-time').value).toISOString() : null,
                notes: document.getElementById('dc-notes').value.trim(),
                trustedContacts: contacts,
            })
        }).then(function(data) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-door-open"></i> Check Out';
            if (data && data.success) {
                activeCheckout = data.checkout;
                showActiveDate(data.checkout);
                showToast('Checked out! ' + (data.smsMessage || ''));
            } else { showToast((data && data.error) || 'Failed to check out', true); }
        }).catch(function(err) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-door-open"></i> Check Out';
            showToast('Check out failed: ' + err.message, true);
        });
    };

    function showActiveDate(checkout) {
        document.getElementById('dc-form').style.display = 'none';
        document.getElementById('dc-active').style.display = 'block';
        document.getElementById('dc-active-name').textContent = checkout.dateName || checkout.date_name;
        document.getElementById('dc-active-venue').textContent = (checkout.venueName || checkout.venue_name) + (checkout.venueAddress || checkout.venue_address ? ' — ' + (checkout.venueAddress || checkout.venue_address) : '');
        document.getElementById('dc-active-time').textContent = 'Started: ' + new Date(checkout.scheduledTime || checkout.scheduled_time).toLocaleString();
        var startTime = new Date(checkout.createdAt || checkout.created_at || checkout.scheduledTime || checkout.scheduled_time).getTime();
        if (dcTimerInterval) clearInterval(dcTimerInterval);
        dcTimerInterval = setInterval(function() {
            var elapsed = Date.now() - startTime;
            var hrs = Math.floor(elapsed / 3600000);
            var mins = Math.floor((elapsed % 3600000) / 60000);
            var secs = Math.floor((elapsed % 60000) / 1000);
            document.getElementById('dc-timer').textContent = (hrs > 0 ? hrs + 'h ' : '') + mins + 'm ' + secs + 's';
        }, 1000);
    }

    window.dateCheckIn = function() {
        if (!activeCheckout) { showToast('No active checkout', true); return; }
        apiFetch('/dates/checkin', {
            method: 'POST',
            body: JSON.stringify({ checkoutId: activeCheckout.id, safetyRating: 5, notes: 'Checked in via dashboard' })
        }).then(function(data) {
            if (data && data.success) {
                if (dcTimerInterval) clearInterval(dcTimerInterval);
                activeCheckout = null;
                document.getElementById('dc-active').style.display = 'none';
                document.getElementById('dc-form').style.display = 'block';
                showToast('Checked in safely! Your contacts have been notified.');
                loadDateHistory();
                document.getElementById('dc-date-name').value = '';
                document.getElementById('dc-venue-name').value = '';
                document.getElementById('dc-venue-address').value = '';
                document.getElementById('dc-notes').value = '';
            } else { showToast((data && data.error) || 'Failed to check in', true); }
        });
    };

    window.shareDateLink = function() {
        if (!activeCheckout || !activeCheckout.shareCode) return;
        var url = 'https://www.getsafetea.app/date-status?code=' + activeCheckout.shareCode;
        if (navigator.clipboard) { navigator.clipboard.writeText(url).then(function() { showToast('Tracking link copied!'); }); }
        else { prompt('Share this tracking link:', url); }
    };

    function loadDateHistory() {
        apiFetch('/dates/checkout').then(function(data) {
            if (!data || !data.checkouts) return;
            var active = data.checkouts.find(function(c) { return c.status === 'checked_out'; });
            if (active) {
                activeCheckout = { id: active.id, dateName: active.date_name, venueName: active.venue_name, venueAddress: active.venue_address, scheduledTime: active.scheduled_time, createdAt: active.created_at, shareCode: active.share_code };
                showActiveDate(activeCheckout);
            }
            var completed = data.checkouts.filter(function(c) { return c.status === 'checked_in'; });
            var container = document.getElementById('dc-history');
            if (completed.length === 0) { container.innerHTML = '<p style="color:#666;font-size:13px;text-align:center;padding:12px">No completed dates yet.</p>'; return; }
            container.innerHTML = completed.map(function(c) {
                return '<div class="dc-history-item"><div><div class="dc-history-name">' + c.date_name + '</div><div class="dc-history-meta">' + c.venue_name + ' · ' + new Date(c.scheduled_time).toLocaleDateString() + '</div></div><span class="dc-history-status dc-status-safe">Safe ✓</span></div>';
            }).join('');
        });
    }

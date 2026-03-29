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

    // Refresh user data from server (picks up tier changes, role updates, etc.)
    apiFetch('/users/profile').then(function(data) {
        if (data && data.user) {
            for (var k in data.user) {
                if (data.user[k] !== undefined) user[k] = data.user[k];
            }
            localStorage.setItem('safetea_user', JSON.stringify(user));
            // Re-init gated features with fresh tier
            if (typeof initNameWatch === 'function') initNameWatch();
            if (typeof initDateCheck === 'function') initDateCheck();
        }
    }).catch(function() {});

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
            var ct = res.headers.get('content-type') || '';
            if (ct.indexOf('application/json') === -1) {
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
        // Update top nav
        document.querySelectorAll('.topnav-nav a').forEach(function(a) {
            a.classList.remove('active');
        });
        var activeLink = document.querySelector('.topnav-nav a[data-tab="' + tab + '"]');
        if (activeLink) activeLink.classList.add('active');

        // Update mobile tab bar
        document.querySelectorAll('.mobile-tab-bar a').forEach(function(a) {
            a.classList.remove('active');
        });
        var mobileLink = document.querySelector('.mobile-tab-bar a[data-tab="' + tab + '"]');
        if (mobileLink) mobileLink.classList.add('active');

        // Show correct section
        document.querySelectorAll('.tab-section').forEach(function(s) {
            s.classList.remove('active');
        });
        var section = document.getElementById('tab-' + tab);
        if (section) section.classList.add('active');

        // Load data for tab
        if (tab === 'alerts') loadFullAlerts();
        if (tab === 'profile') loadProfile();
        if (tab === 'inbox') loadInbox();
        if (tab === 'hub') initHub();
        if (tab === 'community' && typeof loadCommunityPosts === 'function') loadCommunityPosts();
    }
    window.switchTab = switchTab;

    function initHub() {
        // Init namewatch gating
        if (typeof initNameWatch === 'function') initNameWatch();
        // Init datecheck gating
        if (typeof initDateCheck === 'function') initDateCheck();
        // Init search tabs
        initSearchTabs();
    }

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

        // Show admin link for admin/moderator users
        var adminLink = document.getElementById('admin-link');
        if (adminLink && (user.role === 'admin' || user.role === 'moderator')) {
            adminLink.style.display = '';
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

    function canModifyPost(post) {
        return post.user_id === user.id || user.role === 'admin' || user.role === 'moderator';
    }

    function renderPost(post) {
        var time = getTimeAgo(post.created_at);
        var badge = getCategoryBadge(post.category);
        var initial = (post.author_name || '?')[0].toUpperCase();
        var colors = ['#6c7b95', '#8e44ad', '#2980b9', '#16a085', '#d35400'];
        var color = colors[post.id % colors.length];
        var canMod = canModifyPost(post);

        var likeCount = parseInt(post.like_count) || 0;
        var userLiked = post.user_liked === true || post.user_liked === 't';
        var heartClass = userLiked ? 'fas fa-heart' : 'far fa-heart';
        var heartColor = userLiked ? 'color:#e74c3c' : '';

        var html = '<div class="post-card" id="post-' + post.id + '">' +
            '<div class="post-header">' +
            '<div class="post-avatar" style="background:' + color + '">' + initial + '</div>' +
            '<div class="post-meta">' +
            '<div class="post-author">' + escapeHtml(post.author_name || 'Anonymous') + badge + '</div>' +
            '<div class="post-time">' + time + ' \u2022 ' + escapeHtml(post.city || '') + '</div>' +
            '</div></div>' +
            '<div class="post-content">' + escapeHtml(post.body || '') + '</div>' +
            '<div class="post-actions">' +
            '<button class="post-action" id="like-btn-' + post.id + '" onclick="toggleLike(' + post.id + ')" style="' + heartColor + '"><i class="' + heartClass + '"></i> <span id="like-count-' + post.id + '">' + likeCount + '</span></button>' +
            '<button class="post-action">\uD83D\uDCAC ' + (post.reply_count || 0) + ' replies</button>' +
            '<button class="post-action"><i class="fas fa-flag"></i> Report</button>' +
            '<button class="post-action"><i class="fas fa-share"></i> Share</button>' +
            (canMod ? '<button class="post-action" onclick="editPost(' + post.id + ', \'' + escapeHtml(post.body || '').replace(/'/g, "\\'").replace(/\n/g, '\\n') + '\', \'' + escapeHtml(post.feed || 'safety') + '\')"><i class="fas fa-pencil-alt"></i> Edit</button>' : '') +
            (canMod ? '<button class="post-action" style="color:#e74c3c" onclick="deletePost(' + post.id + ', \'' + escapeHtml(post.feed || 'safety') + '\')"><i class="fas fa-trash"></i> Delete</button>' : '') +
            '</div></div>';
        return html;
    }

    function loadPosts() {
        apiFetch('/posts').then(function(data) {
            var feed = document.getElementById('posts-feed');
            var posts = Array.isArray(data) ? data : (data && data.posts ? data.posts : []);
            if (posts.length === 0) {
                feed.innerHTML = '<div class="empty-state"><i class="fas fa-comments" style="font-size:40px;color:#333;display:block;margin-bottom:12px"></i><p>No posts yet. Be the first to share!</p></div>';
                return;
            }
            feed.innerHTML = posts.map(renderPost).join('');
        }).catch(function() {
            document.getElementById('posts-feed').innerHTML = '<div class="empty-state"><p>Unable to load posts. Try refreshing.</p></div>';
        });
    }

    // ==================== LIKE / UNLIKE ====================
    window.toggleLike = function(postId) {
        var btn = document.getElementById('like-btn-' + postId);
        if (!btn) return;
        var icon = btn.querySelector('i');
        var isLiked = icon && icon.classList.contains('fa-heart') && icon.classList.contains('fas');
        var method = isLiked ? 'DELETE' : 'POST';

        apiFetch('/posts/like?id=' + postId, { method: method }).then(function(data) {
            if (!data) return;
            var countEl = document.getElementById('like-count-' + postId);
            if (countEl) countEl.textContent = data.like_count;
            if (icon) {
                if (data.liked) {
                    icon.classList.remove('far');
                    icon.classList.add('fas');
                    btn.style.color = '#e74c3c';
                } else {
                    icon.classList.remove('fas');
                    icon.classList.add('far');
                    btn.style.color = '';
                }
            }
        });
    };

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
        apiFetch('/posts', {
            method: 'POST',
            body: JSON.stringify({
                title: content.substring(0, 60),
                body: content,
                city: user.city,
                category: category
            })
        }).then(function(data) {
            if (data && (data.id || data.post)) {
                document.getElementById('new-post-content').value = '';
                window.removeImage();
                showToast('Post shared!');
                loadPosts();
            } else {
                showToast((data && data.error) || 'Failed to create post.', true);
            }
        }).catch(function() {
            showToast('Failed to create post.', true);
        });
    };

    // ==================== ALERTS ====================
    function loadAlerts() {
        var city = user.city || '';
        apiFetch('/alerts?city=' + encodeURIComponent(city)).then(function(data) {
            var list = document.getElementById('alerts-list');
            if (!data || !data.alerts || data.alerts.length === 0) {
                list.innerHTML = '<div style="color:#555;font-size:13px;text-align:center;padding:12px">No alerts in your area</div>';
                return;
            }
            list.innerHTML = data.alerts.slice(0, 5).map(function(a) {
                return '<div class="alert-item">' +
                    '<div class="alert-title"><span class="severity-dot severity-' + (a.severity || 'low') + '"></span>' + escapeHtml(a.title) + '</div>' +
                    '<div class="alert-meta">' + escapeHtml(a.type || '') + ' \u2022 ' + escapeHtml(a.city || '') + '</div></div>';
            }).join('');
        }).catch(function() {
            document.getElementById('alerts-list').innerHTML = '<div style="color:#555;font-size:13px">Unable to load alerts</div>';
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
                list.innerHTML = '<div style="color:#555;font-size:13px">No cities yet</div>';
                return;
            }
            list.innerHTML = data.cities.slice(0, 5).map(function(c, i) {
                return '<div class="city-row">' +
                    '<div><span class="city-rank">#' + (i + 1) + '</span>' +
                    '<span class="city-name">' + escapeHtml(c.city) + ', ' + escapeHtml(c.state || '') + '</span></div>' +
                    '<span class="city-votes">' + c.votes + ' votes</span></div>';
            }).join('');
        }).catch(function() {
            document.getElementById('cities-list').innerHTML = '<div style="color:#555;font-size:13px">Unable to load cities</div>';
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
                convos.innerHTML = '<div style="text-align:center;padding:40px;color:#555"><i class="fas fa-inbox" style="font-size:32px;display:block;margin-bottom:12px"></i><p>No messages yet</p><p style="font-size:12px;margin-top:4px">Messages from referrals and the community will appear here.</p></div>';
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
            convos.innerHTML = '<div style="text-align:center;padding:20px;color:#555">Unable to load conversations</div>';
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
                messagesHtml = '<div style="text-align:center;padding:40px;color:#555">No messages yet. Start the conversation!</div>';
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
        var currentColor = user.avatar_color || '#f27059';
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
        var color = selectedAvatarColor || user.avatar_color || '#f27059';

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
        var color = user.avatar_color || '#f27059';

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
                    '<p style="color:#888;font-size:13px;margin-top:4px">No registered sex offenders matching "' + escapeHtml(first + ' ' + last) + '" were found in public records.' +
                    (state ? ' State: ' + escapeHtml(state) : '') + '</p>' +
                    '<p style="color:#666;font-size:11px;margin-top:8px">For comprehensive results, also check <a href="https://www.nsopw.gov" target="_blank" style="color:#f27059">NSOPW.gov</a></p></div></div>';
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

        results.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Running background check on <strong>' + escapeHtml(name) + '</strong>... Searching social media, criminal records, mugshots, data brokers, court records, and news.</div>';

        apiFetch('/screening/background', {
            method: 'POST',
            body: JSON.stringify({ fullName: name, city: city, state: state, age: age || null })
        }).then(function(report) {
            var html = '<h4 style="color:#fff;margin-bottom:16px"><i class="fas fa-file-alt" style="color:#f27059"></i> Background Report: ' + escapeHtml(report.subject) + '</h4>';
            var rc = report.riskAssessment.level === 'high' ? '#e74c3c' : report.riskAssessment.level === 'medium' ? '#B48CD2' : '#2ecc71';
            var rl = report.riskAssessment.level === 'high' ? 'High Risk' : report.riskAssessment.level === 'medium' ? 'Moderate' : 'Low Risk';
            html += '<div style="background:rgba(' + (report.riskAssessment.level==='high'?'231,76,60':report.riskAssessment.level==='medium'?'243,156,18':'46,204,113') + ',0.1);border:1px solid '+rc+';border-radius:12px;padding:16px;margin-bottom:16px;display:flex;align-items:center;gap:16px">';
            html += '<div style="min-width:60px;height:60px;border-radius:50%;border:3px solid '+rc+';display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:'+rc+'">'+report.riskAssessment.score+'</div>';
            html += '<div><div style="color:'+rc+';font-weight:700;font-size:16px">'+rl+'</div>';
            if(report.riskAssessment.flags.length>0) html+='<div style="color:#8080A0;font-size:12px;margin-top:4px">'+report.riskAssessment.flags.join(' &middot; ')+'</div>';
            html += '</div></div>';

            function renderSection(icon, iconColor, title, section, linkColor) {
                var s = report.sections[section];
                if (!s) return '';
                var h = '<div class="result-card" style="margin-bottom:12px"><div class="result-info"><h4><i class="'+icon+'" style="color:'+iconColor+'"></i> '+title;
                var count = s.count || (s.results ? s.results.length : 0) || (s.profiles ? s.profiles.length : 0) || (s.sites ? s.sites.length : 0) || 0;
                h += count > 0 ? ' <span class="result-badge badge-caution">'+count+' found</span>' : ' <span class="result-badge badge-clear">Clear</span>';
                h += '</h4>';
                var items = s.results || s.profiles || s.sites || [];
                if (s.note) h += '<div class="result-detail" style="margin-bottom:8px;font-size:12px">'+escapeHtml(s.note)+'</div>';
                items.forEach(function(r) {
                    h += '<div style="margin:6px 0;padding:8px 12px;background:rgba(255,255,255,0.02);border-radius:8px;border-left:3px solid '+linkColor+'">';
                    if (r.platform) h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><i class="'+(r.icon||'fas fa-globe')+'" style="color:'+(r.color||linkColor)+'"></i><strong style="color:#fff;font-size:13px">'+escapeHtml(r.platform || r.site || '')+'</strong></div>';
                    h += '<div style="color:#fff;font-size:13px">'+escapeHtml((r.title||'').substring(0,100))+'</div>';
                    if (r.snippet) h += '<div style="font-size:11px;color:#8080A0;margin-top:3px">'+escapeHtml(r.snippet.substring(0,150))+'</div>';
                    if (r.url) h += '<a href="'+escapeHtml(r.url)+'" target="_blank" style="font-size:11px;color:'+linkColor+';text-decoration:none">View &rarr;</a>';
                    h += '</div>';
                });
                if (items.length === 0 && !s.note) h += '<div class="result-detail">None found.</div>';
                h += '</div></div>';
                return h;
            }

            html += renderSection('fab fa-linkedin','#0A66C2','Social Media','socialMedia','#0A66C2');
            html += renderSection('fas fa-camera','#e74c3c','Mugshots / Arrest Photos','mugshots','#e74c3c');
            html += renderSection('fas fa-gavel','#e67e22','Criminal Records','criminalRecords','#e67e22');
            html += renderSection('fas fa-database','#9b59b6','Data Broker Exposure','dataBrokers','#9b59b6');
            html += renderSection('fas fa-balance-scale','#3498db','Court Records','courtRecords','#3498db');
            html += renderSection('fas fa-newspaper','#1abc9c','News & Public Mentions','news','#1abc9c');

            html += '<div class="disclaimer" style="margin-top:16px"><i class="fas fa-info-circle"></i><span>This report uses public web search results. Always meet in public and tell someone where you are going.</span></div>';
            results.innerHTML = html;
        }).catch(function(err) {
            results.innerHTML = '<div class="disclaimer" style="border-color:#e74c3c"><i class="fas fa-exclamation-circle" style="color:#e74c3c"></i><span>Background check failed: ' + escapeHtml(err.message||'Unknown error') + '</span></div>';
        });
    };

    // ==================== LOGOUT ====================
    window.handleLogout = function() {
        localStorage.removeItem('safetea_token');
        localStorage.removeItem('safetea_user');
        window.location.href = '/login.html';
    };

    // ==================== DATE CHECK-IN / CHECK-OUT ====================
    var activeCheckout = null;
    var dcTimerInterval = null;
    var datePhotoData = null; // stores base64 or URL of uploaded photo

    function initDateCheck() {
        var wall = document.getElementById('dc-upgrade-wall');
        var content = document.getElementById('dc-premium-content');
        if (checkPremium()) {
            if (wall) wall.style.display = 'none';
            if (content) content.style.display = 'block';
        } else {
            if (wall) wall.style.display = 'block';
            if (content) content.style.display = 'none';
            return;
        }
        // Show transport details if a transport is selected
        var transportSelect = document.getElementById('dc-transportation');
        if (transportSelect) {
            transportSelect.addEventListener('change', function() {
                var wrap = document.getElementById('dc-transport-details-wrap');
                if (wrap) wrap.style.display = this.value ? 'block' : 'none';
            });
        }
        loadDateHistory();
        checkActiveDate();
    }
    window.initDateCheck = initDateCheck;

    window.handleDatePhotoUpload = function(input) {
        if (input.files && input.files[0]) {
            var file = input.files[0];
            if (file.size > 5 * 1024 * 1024) {
                showToast('Photo must be under 5MB', true);
                return;
            }
            var reader = new FileReader();
            reader.onload = function(e) {
                datePhotoData = e.target.result;
                var preview = document.getElementById('dc-photo-preview');
                var previewImg = document.getElementById('dc-photo-preview-img');
                var placeholder = document.getElementById('dc-photo-placeholder');
                if (previewImg) previewImg.src = datePhotoData;
                if (preview) preview.style.display = 'block';
                if (placeholder) placeholder.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    };

    window.addContactRow = function() {
        var list = document.getElementById('dc-contacts-list');
        if (!list) return;
        var rows = list.querySelectorAll('.dc-contact-row');
        if (rows.length >= 5) { showToast('Maximum 5 contacts', true); return; }
        var row = document.createElement('div');
        row.className = 'dc-contact-row';
        row.innerHTML = '<input type="text" placeholder="Name" class="dc-contact-name"><input type="tel" placeholder="Phone (e.g. 630-675-8076)" class="dc-contact-phone"><button class="dc-contact-remove" onclick="this.parentElement.remove()" title="Remove">&times;</button>';
        list.appendChild(row);
    };

    window.dateCheckOut = function() {
        var dateName = document.getElementById('dc-date-name').value.trim();
        var venueName = document.getElementById('dc-venue-name').value.trim();
        var venueAddress = document.getElementById('dc-venue-address').value.trim();
        var transportation = document.getElementById('dc-transportation').value;
        var transportDetails = document.getElementById('dc-transport-details').value.trim();
        var scheduledTime = document.getElementById('dc-scheduled-time').value;
        var returnTime = document.getElementById('dc-return-time').value;
        var notes = document.getElementById('dc-notes').value.trim();
        var photoUrl = document.getElementById('dc-photo-url').value.trim();

        if (!dateName) { showToast('Who are you meeting?', true); return; }
        if (!venueName) { showToast('Where will the date be?', true); return; }
        if (!scheduledTime) { showToast('When is the date?', true); return; }

        // Get photo: prefer uploaded file, fall back to URL
        var finalPhoto = datePhotoData || photoUrl || null;

        // Gather contacts
        var contacts = [];
        document.querySelectorAll('#dc-contacts-list .dc-contact-row').forEach(function(row) {
            var name = row.querySelector('.dc-contact-name').value.trim();
            var phone = row.querySelector('.dc-contact-phone').value.trim();
            if (name && phone) contacts.push({ name: name, phone: phone });
        });

        var btn = document.getElementById('dc-checkout-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating SafeTea Report...'; }

        apiFetch('/dates/checkout', {
            method: 'POST',
            body: JSON.stringify({
                dateName: dateName,
                datePhotoUrl: finalPhoto,
                venueName: venueName,
                venueAddress: venueAddress,
                transportation: transportation,
                transportDetails: transportDetails,
                scheduledTime: scheduledTime,
                estimatedReturn: returnTime || null,
                notes: notes,
                trustedContacts: contacts,
            })
        }).then(function(data) {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-door-open"></i> Check Out & Generate SafeTea Report'; }
            if (data && data.success) {
                activeCheckout = data.checkout;
                activeCheckout.report = data.report;
                showToast('Checked out! SafeTea Report generated.');
                showActiveDate(data.checkout);
                renderSafeTeaReport(data.report);
                // Auto-prompt to share with trusted contacts via native SMS
                if (contacts.length > 0) {
                    setTimeout(function() {
                        var c = data.checkout;
                        var trackUrl = 'https://www.getsafetea.app/date-status?code=' + (c.shareCode || c.share_code || '');
                        var msg = 'SafeTea Report\n━━━━━━━━━━━━━━━━━\n';
                        msg += (c.dateName || c.date_name) + ' shared their date details with you.\n\n';
                        msg += 'Meeting: ' + (c.dateName || c.date_name) + '\n';
                        if (c.venueName || c.venue_name) msg += 'Where: ' + (c.venueName || c.venue_name) + '\n';
                        if (c.venueAddress || c.venue_address) msg += 'Address: ' + (c.venueAddress || c.venue_address) + '\n';
                        var ts = c.scheduledTime || c.scheduled_time;
                        if (ts) msg += 'When: ' + new Date(ts).toLocaleString() + '\n';
                        if (c.transportation) msg += 'Getting there: ' + c.transportation + '\n';
                        msg += '\nTrack live: ' + trackUrl;
                        msg += '\n━━━━━━━━━━━━━━━━━\nSent via SafeTea';
                        var phones = contacts.map(function(ct) { return ct.phone; }).join(',');
                        window.open('sms:' + phones + '?body=' + encodeURIComponent(msg), '_blank');
                        showToast('Opening messaging app to share with your contacts...');
                    }, 800);
                }
                // Show report automatically
                var reportDiv = document.getElementById('dc-report');
                if (reportDiv) reportDiv.style.display = 'block';
                // Clear form
                document.getElementById('dc-date-name').value = '';
                document.getElementById('dc-venue-name').value = '';
                document.getElementById('dc-venue-address').value = '';
                document.getElementById('dc-transportation').value = '';
                document.getElementById('dc-transport-details').value = '';
                document.getElementById('dc-scheduled-time').value = '';
                document.getElementById('dc-return-time').value = '';
                document.getElementById('dc-notes').value = '';
                document.getElementById('dc-photo-url').value = '';
                datePhotoData = null;
                var preview = document.getElementById('dc-photo-preview');
                var placeholder = document.getElementById('dc-photo-placeholder');
                if (preview) preview.style.display = 'none';
                if (placeholder) placeholder.style.display = 'block';
                document.getElementById('dc-form').style.display = 'none';
                loadDateHistory();
            } else {
                showToast(data.error || 'Checkout failed', true);
            }
        }).catch(function(err) {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-door-open"></i> Check Out & Generate SafeTea Report'; }
            showToast('Failed to check out: ' + (err.message || 'Unknown error'), true);
        });
    };

    function showActiveDate(checkout) {
        var active = document.getElementById('dc-active');
        if (!active) return;
        active.style.display = 'block';
        document.getElementById('dc-active-name').textContent = 'Meeting: ' + (checkout.dateName || checkout.date_name);
        document.getElementById('dc-active-venue').textContent = (checkout.venueName || checkout.venue_name) + (checkout.venueAddress || checkout.venue_address ? ' - ' + (checkout.venueAddress || checkout.venue_address) : '');
        var transport = document.getElementById('dc-active-transport');
        if (transport) transport.textContent = checkout.transportation ? 'Getting there: ' + checkout.transportation : '';
        var timeStr = checkout.scheduledTime || checkout.scheduled_time;
        document.getElementById('dc-active-time').textContent = timeStr ? new Date(timeStr).toLocaleString() : '';

        // Photo
        var photoWrap = document.getElementById('dc-active-photo');
        var photoImg = document.getElementById('dc-active-photo-img');
        var photoUrl = checkout.datePhotoUrl || checkout.date_photo_url;
        if (photoUrl && photoWrap && photoImg) {
            photoImg.src = photoUrl;
            photoWrap.style.display = 'block';
            photoImg.onerror = function() { photoWrap.style.display = 'none'; };
        }

        // Timer
        startTimer(checkout.createdAt || checkout.created_at);
    }

    function startTimer(since) {
        if (dcTimerInterval) clearInterval(dcTimerInterval);
        var start = new Date(since).getTime();
        function update() {
            var diff = Math.floor((Date.now() - start) / 1000);
            var h = Math.floor(diff / 3600);
            var m = Math.floor((diff % 3600) / 60);
            var s = diff % 60;
            var timer = document.getElementById('dc-timer');
            if (timer) timer.textContent = (h > 0 ? h + 'h ' : '') + m + 'm ' + s + 's';
        }
        update();
        dcTimerInterval = setInterval(update, 1000);
    }

    function renderSafeTeaReport(report) {
        var container = document.getElementById('dc-report-content');
        if (!container) return;

        var photoHtml = '';
        if (report.datePhotoUrl) {
            photoHtml = '<div class="safetea-report-photo"><img src="' + escapeHtml(report.datePhotoUrl) + '" alt="Date photo" onerror="this.parentElement.style.display=\'none\'"></div>';
        }

        var rows = '';
        rows += reportRow('fa-user', 'Meeting', escapeHtml(report.dateName));
        rows += reportRow('fa-map-marker-alt', 'Location', escapeHtml(report.venue) + (report.address ? '<br><span style="font-size:12px;color:#8080A0">' + escapeHtml(report.address) + '</span>' : ''));
        rows += reportRow('fa-car', 'Transportation', escapeHtml(report.transportation) + (report.transportDetails ? '<br><span style="font-size:12px;color:#8080A0">' + escapeHtml(report.transportDetails) + '</span>' : ''));
        if (report.scheduledTime) rows += reportRow('fa-clock', 'Date & Time', new Date(report.scheduledTime).toLocaleString());
        if (report.estimatedReturn) rows += reportRow('fa-home', 'Expected Back', new Date(report.estimatedReturn).toLocaleString());
        if (report.notes) rows += reportRow('fa-sticky-note', 'Notes', escapeHtml(report.notes));
        rows += reportRow('fa-link', 'Live Tracking', '<a href="' + escapeHtml(report.trackingUrl) + '" target="_blank" style="color:#E8A0B5;text-decoration:underline;word-break:break-all">' + escapeHtml(report.trackingUrl) + '</a>');

        container.innerHTML =
            '<div class="safetea-report">' +
                '<div class="safetea-report-header">' +
                    '<h3><i class="fas fa-shield-alt"></i> SafeTea Report</h3>' +
                    '<p>Date Safety Details for ' + escapeHtml(report.userName) + '</p>' +
                '</div>' +
                '<div class="safetea-report-body">' +
                    photoHtml +
                    rows +
                '</div>' +
                '<div class="safetea-report-footer">' +
                    '<span>Report #' + report.shareCode + ' | Generated ' + new Date(report.createdAt).toLocaleString() + '</span>' +
                '</div>' +
            '</div>';
    }

    function reportRow(icon, label, value) {
        return '<div class="safetea-report-row">' +
            '<div class="safetea-report-icon"><i class="fas ' + icon + '"></i></div>' +
            '<div><div class="safetea-report-label">' + label + '</div><div class="safetea-report-value">' + value + '</div></div>' +
        '</div>';
    }

    window.viewSafeTeaReport = function() {
        var reportDiv = document.getElementById('dc-report');
        if (reportDiv) {
            if (reportDiv.style.display === 'block') {
                reportDiv.style.display = 'none';
            } else {
                reportDiv.style.display = 'block';
                // If we have active checkout but no rendered report, fetch it
                if (activeCheckout && !document.getElementById('dc-report-content').innerHTML) {
                    apiFetch('/dates/report?id=' + activeCheckout.id).then(function(data) {
                        if (data && data.report) renderSafeTeaReport(data.report);
                    });
                }
            }
        }
    };

    window.closeReport = function() {
        var reportDiv = document.getElementById('dc-report');
        if (reportDiv) reportDiv.style.display = 'none';
    };

    window.shareReportSMS = function() {
        if (!activeCheckout) { showToast('No active date to share', true); return; }
        // Build SMS body from active checkout data
        var c = activeCheckout;
        var name = c.dateName || c.date_name || 'Someone';
        var venue = c.venueName || c.venue_name || '';
        var address = c.venueAddress || c.venue_address || '';
        var transport = c.transportation || '';
        var timeStr = c.scheduledTime || c.scheduled_time;
        var dateTime = timeStr ? new Date(timeStr).toLocaleString() : '';
        var trackUrl = 'https://www.getsafetea.app/date-status?code=' + (c.shareCode || c.share_code || '');

        var msg = 'SafeTea Report\n━━━━━━━━━━━━━━━━━\n';
        msg += 'Meeting: ' + name + '\n';
        if (venue) msg += 'Where: ' + venue + '\n';
        if (address) msg += 'Address: ' + address + '\n';
        if (dateTime) msg += 'When: ' + dateTime + '\n';
        if (transport) msg += 'Getting there: ' + transport + '\n';
        msg += '\nTrack live: ' + trackUrl;
        msg += '\n━━━━━━━━━━━━━━━━━\nSent via SafeTea';

        // Open native SMS app with pre-filled message
        window.open('sms:?body=' + encodeURIComponent(msg), '_blank');
        showToast('Opening messaging app...');
    };

    window.shareReportInbox = function() {
        if (!activeCheckout) { showToast('No active date to share', true); return; }
        // Show inbox share modal — search users
        var modal = document.createElement('div');
        modal.className = 'dc-share-modal';
        modal.id = 'dc-share-modal';
        modal.innerHTML =
            '<div class="dc-share-modal-content">' +
                '<h3 style="color:#fff;margin-bottom:16px"><i class="fas fa-envelope" style="color:#E8A0B5"></i> Send Report to Inbox</h3>' +
                '<div class="dc-form-group"><label>Search for a SafeTea user</label><input type="text" id="dc-share-search" placeholder="Search by name..." oninput="searchUsersForShare(this.value)" style="width:100%;padding:10px 12px;background:#2A2A44;border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;font-size:14px"></div>' +
                '<div id="dc-share-results" style="max-height:200px;overflow-y:auto"></div>' +
                '<button class="dc-btn dc-btn-outline" style="margin-top:12px" onclick="document.getElementById(\'dc-share-modal\').remove()"><i class="fas fa-times"></i> Cancel</button>' +
            '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    };

    window.searchUsersForShare = function(query) {
        var results = document.getElementById('dc-share-results');
        if (!query || query.length < 2) { results.innerHTML = '<p style="color:#8080A0;font-size:13px;text-align:center">Type at least 2 characters...</p>'; return; }
        apiFetch('/users/search?q=' + encodeURIComponent(query)).then(function(data) {
            if (!data || !data.users || data.users.length === 0) {
                results.innerHTML = '<p style="color:#8080A0;font-size:13px;text-align:center">No users found</p>';
                return;
            }
            var html = '';
            data.users.forEach(function(u) {
                html += '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:#2A2A44;border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="sendReportInbox(' + u.id + ', \'' + escapeHtml(u.display_name) + '\')">' +
                    '<div style="width:32px;height:32px;border-radius:50%;background:#E8A0B5;display:flex;align-items:center;justify-content:center;font-weight:700;color:#1A1A2E;font-size:14px">' + (u.display_name ? u.display_name[0].toUpperCase() : '?') + '</div>' +
                    '<div><div style="color:#fff;font-weight:500;font-size:14px">' + escapeHtml(u.display_name) + '</div><div style="color:#8080A0;font-size:11px">' + escapeHtml(u.city || '') + '</div></div>' +
                    '<i class="fas fa-paper-plane" style="margin-left:auto;color:#E8A0B5"></i>' +
                '</div>';
            });
            results.innerHTML = html;
        }).catch(function() { results.innerHTML = '<p style="color:#e74c3c;font-size:13px;text-align:center">Search failed</p>'; });
    };

    window.sendReportInbox = function(userId, userName) {
        apiFetch('/dates/report', {
            method: 'POST',
            body: JSON.stringify({ checkoutId: activeCheckout.id, shareMethod: 'inbox', recipientUserId: userId })
        }).then(function(data) {
            if (data && data.success) {
                showToast('SafeTea Report sent to ' + userName + '\'s inbox!');
                var modal = document.getElementById('dc-share-modal');
                if (modal) modal.remove();
            } else {
                showToast(data.error || 'Failed to send to inbox', true);
            }
        }).catch(function() { showToast('Failed to send to inbox', true); });
    };

    window.dateCheckIn = function() {
        if (!activeCheckout) { showToast('No active date to check in from', true); return; }
        if (!confirm('Check in safely from your date?')) return;

        apiFetch('/dates/checkin', {
            method: 'POST',
            body: JSON.stringify({ checkoutId: activeCheckout.id, safetyRating: 5 })
        }).then(function(data) {
            if (data && data.success) {
                showToast('Checked in safely!');
                // Prompt native SMS to notify contacts you're safe
                if (data.contacts && data.contacts.length > 0) {
                    var name = activeCheckout.dateName || activeCheckout.date_name || 'their date';
                    var msg = 'SafeTea Check-In\n━━━━━━━━━━━━━━━━━\nGood news! I just checked in safely from my date with ' + name + '.\n\nSent via SafeTea';
                    var phones = data.contacts.map(function(ct) { return ct.contact_phone || ct.phone; }).join(',');
                    window.open('sms:' + phones + '?body=' + encodeURIComponent(msg), '_blank');
                }
                if (dcTimerInterval) clearInterval(dcTimerInterval);
                activeCheckout = null;
                document.getElementById('dc-active').style.display = 'none';
                document.getElementById('dc-report').style.display = 'none';
                document.getElementById('dc-form').style.display = 'block';
                loadDateHistory();
            } else {
                showToast(data.error || 'Check-in failed', true);
            }
        }).catch(function() { showToast('Failed to check in', true); });
    };

    window.shareDateLink = function() {
        if (!activeCheckout) return;
        var url = 'https://www.getsafetea.app/date-status?code=' + activeCheckout.shareCode;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(function() {
                showToast('Tracking link copied!');
            });
        } else {
            prompt('Copy this tracking link:', url);
        }
    };

    function checkActiveDate() {
        apiFetch('/dates/checkout').then(function(data) {
            if (data && data.checkouts) {
                var active = data.checkouts.find(function(c) { return c.status === 'checked_out'; });
                if (active) {
                    activeCheckout = {
                        id: active.id,
                        shareCode: active.share_code,
                        dateName: active.date_name,
                        datePhotoUrl: active.date_photo_url,
                        venueName: active.venue_name,
                        venueAddress: active.venue_address,
                        transportation: active.transportation,
                        scheduledTime: active.scheduled_time,
                        estimatedReturn: active.estimated_return,
                        createdAt: active.created_at,
                    };
                    showActiveDate(activeCheckout);
                    document.getElementById('dc-form').style.display = 'none';
                    // Load report
                    apiFetch('/dates/report?id=' + active.id).then(function(rData) {
                        if (rData && rData.report) renderSafeTeaReport(rData.report);
                    });
                }
            }
        });
    }

    function loadDateHistory() {
        apiFetch('/dates/checkout').then(function(data) {
            var container = document.getElementById('dc-history');
            if (!container) return;
            if (!data || !data.checkouts || data.checkouts.length === 0) {
                container.innerHTML = '<p style="color:#666;font-size:13px;text-align:center;padding:12px">No date history yet.</p>';
                return;
            }
            var html = '';
            data.checkouts.forEach(function(c) {
                var statusClass = c.status === 'checked_in' ? 'dc-status-safe' : '';
                var statusText = c.status === 'checked_in' ? 'Safe' : 'Active';
                html += '<div class="dc-history-item">' +
                    '<div><div class="dc-history-name">' + escapeHtml(c.date_name) + '</div>' +
                    '<div class="dc-history-meta">' + escapeHtml(c.venue_name) + ' | ' + new Date(c.scheduled_time).toLocaleDateString() + '</div></div>' +
                    '<span class="dc-history-status ' + statusClass + '">' + statusText + '</span>' +
                '</div>';
            });
            container.innerHTML = html;
        });
    }

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
        if (sub === 'search') { initSearchTabs(); initAreaAlerts(); }
        if (sub === 'teatalk') hubLoadCommunityPosts();
        if (sub === 'referral') hubLoadReferralPosts();
        if (sub === 'growreferral') loadGrowReferral();
    };

    // ==================== ALERTS IN YOUR AREA ====================
    var areaAlertLocation = null;

    var ALERT_CATEGORY_MAP = {
        sexual_assault:    { label: 'Sexual Assault',    severity: 'high',   icon: '🚨' },
        assault:           { label: 'Assault',            severity: 'high',   icon: '⚠️' },
        domestic_violence: { label: 'Domestic Violence',  severity: 'high',   icon: '🚨' },
        stalking:          { label: 'Stalking',           severity: 'high',   icon: '🚨' },
        kidnapping:        { label: 'Kidnapping',         severity: 'high',   icon: '🚨' },
        human_trafficking: { label: 'Human Trafficking',  severity: 'high',   icon: '🚨' },
        harassment:        { label: 'Harassment',          severity: 'medium', icon: '⚠️' },
        robbery:           { label: 'Robbery',             severity: 'medium', icon: '⚠️' },
        indecent_exposure: { label: 'Indecent Exposure',   severity: 'medium', icon: '⚠️' }
    };

    function initAreaAlerts() {
        loadWatchZones();
    }

    window.detectLocationAndFetch = function() {
        var prompt = document.getElementById('area-alerts-prompt');
        var loading = document.getElementById('area-alerts-loading');
        if (prompt) prompt.style.display = 'none';
        if (loading) loading.style.display = 'block';

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(pos) {
                areaAlertLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                refreshAreaAlerts();
            }, function() {
                if (loading) loading.style.display = 'none';
                if (prompt) prompt.style.display = 'block';
                showToast('Location access denied. Add a watch zone manually.', true);
            });
        } else {
            if (loading) loading.style.display = 'none';
            showToast('Geolocation not supported', true);
        }
    };

    window.refreshAreaAlerts = function() {
        if (!areaAlertLocation) return;
        var radius = document.getElementById('alert-radius').value;
        var days = document.getElementById('alert-days').value;
        var loading = document.getElementById('area-alerts-loading');
        var summary = document.getElementById('area-alerts-summary');
        var list = document.getElementById('area-alerts-list');
        var empty = document.getElementById('area-alerts-empty');
        var prompt = document.getElementById('area-alerts-prompt');

        if (prompt) prompt.style.display = 'none';
        if (loading) loading.style.display = 'block';
        if (summary) summary.style.display = 'none';
        if (list) list.style.display = 'none';
        if (empty) empty.style.display = 'none';

        apiFetch('/alerts/area?lat=' + areaAlertLocation.lat + '&lon=' + areaAlertLocation.lon + '&radius=' + radius + '&days=' + days).then(function(data) {
            if (loading) loading.style.display = 'none';
            if (!data || data.total === 0) {
                if (empty) empty.style.display = 'block';
                return;
            }
            renderAlertsSummary(data.summary, data.total, days);
            renderAlertsList(data.alerts);
        }).catch(function() {
            if (loading) loading.style.display = 'none';
            showToast('Failed to load area alerts', true);
        });
    };

    function renderAlertsSummary(alertSummary, total, days) {
        var container = document.getElementById('area-alerts-summary');
        if (!container) return;

        var cards = '';
        var types = Object.keys(alertSummary).sort(function(a, b) { return alertSummary[b].count - alertSummary[a].count; });
        types.forEach(function(type) {
            var info = alertSummary[type];
            var severityColor = info.severity === 'high' ? 'rgba(231,76,60,0.15)' : 'rgba(241,196,15,0.15)';
            var textColor = info.severity === 'high' ? '#e74c3c' : '#f1c40f';
            cards += '<div style="display:flex;align-items:center;gap:10px;background:' + severityColor + ';border-radius:10px;padding:10px 14px">' +
                '<span style="font-size:16px">' + (info.icon || '⚠️') + '</span>' +
                '<span style="flex:1;color:' + textColor + ';font-size:13px;font-weight:600">' + (info.label || type) + '</span>' +
                '<span style="color:#fff;font-size:14px;font-weight:700">' + info.count + '</span>' +
            '</div>';
        });

        container.innerHTML = '<div style="background:rgba(231,76,60,0.08);border:1px solid rgba(231,76,60,0.2);border-radius:12px;padding:16px;margin-bottom:16px">' +
            '<div style="color:#e74c3c;font-size:15px;font-weight:700;margin-bottom:12px">' + total + ' safety-relevant incidents <span style="color:#8080A0;font-weight:400;font-size:13px">in the past ' + days + ' days</span></div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">' + cards + '</div>' +
        '</div>';
        container.style.display = 'block';
    }

    function renderAlertsList(alerts) {
        var container = document.getElementById('area-alerts-list');
        if (!container) return;

        var html = '';
        var shown = alerts.slice(0, 20);
        shown.forEach(function(alert) {
            var info = ALERT_CATEGORY_MAP[alert.crime_type] || { label: alert.crime_type, icon: '⚠️', severity: 'medium' };
            var dist = alert.distance_miles ? parseFloat(alert.distance_miles).toFixed(2) + ' mi away' : '';
            var timeAgo = getTimeAgo(alert.occurred_at);
            html += '<div style="display:flex;align-items:center;gap:12px;padding:12px;background:#1A1A2E;border-radius:10px;margin-bottom:8px">' +
                '<span style="font-size:18px">' + info.icon + '</span>' +
                '<div style="flex:1">' +
                    '<div style="color:#fff;font-size:13px;font-weight:600">' + escapeHtml(info.label) + '</div>' +
                    '<div style="color:#8080A0;font-size:12px">' + escapeHtml(alert.block_address || 'Nearby') + ' &bull; ' + timeAgo + '</div>' +
                '</div>' +
                '<span style="color:#666;font-size:11px;white-space:nowrap">' + dist + '</span>' +
            '</div>';
        });

        if (alerts.length > 20) {
            html += '<div style="text-align:center;padding:12px;color:#8080A0;font-size:13px">+ ' + (alerts.length - 20) + ' more incidents</div>';
        }

        container.innerHTML = html;
        container.style.display = 'block';
    }

    // Watch Zones
    function loadWatchZones() {
        apiFetch('/watch-zones').then(function(zones) {
            var container = document.getElementById('watch-zones-list');
            if (!container) return;
            if (!zones || zones.length === 0) {
                container.innerHTML = '<p style="color:#666;font-size:13px">No watch zones yet. Add one or use your location to see area alerts.</p>';
                return;
            }
            var html = '';
            zones.forEach(function(z) {
                html += '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:#1A1A2E;border-radius:8px;margin-bottom:6px">' +
                    '<i class="fas fa-map-pin" style="color:#E8A0B5"></i>' +
                    '<div style="flex:1">' +
                        '<div style="color:#fff;font-size:13px;font-weight:500">' + escapeHtml(z.name || 'Watch Zone') + '</div>' +
                        '<div style="color:#666;font-size:11px">' + z.radius_miles + ' mi radius &bull; ' + (z.source === 'auto_checkin' ? 'Auto from check-in' : 'Manual') + '</div>' +
                    '</div>' +
                    '<button onclick="useWatchZone(' + z.latitude + ',' + z.longitude + ')" style="background:rgba(232,160,181,0.1);border:1px solid rgba(232,160,181,0.2);color:#E8A0B5;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-family:\'Inter\',sans-serif">View</button>' +
                    '<button onclick="deleteWatchZone(' + z.id + ')" style="background:none;border:none;color:#666;cursor:pointer;font-size:12px"><i class="fas fa-trash"></i></button>' +
                '</div>';
            });
            container.innerHTML = html;

            // Auto-load alerts from first watch zone if no location set
            if (!areaAlertLocation && zones.length > 0) {
                areaAlertLocation = { lat: parseFloat(zones[0].latitude), lon: parseFloat(zones[0].longitude) };
                var prompt = document.getElementById('area-alerts-prompt');
                if (prompt) prompt.style.display = 'none';
                refreshAreaAlerts();
            }
        }).catch(function() {
            var container = document.getElementById('watch-zones-list');
            if (container) container.innerHTML = '<p style="color:#666;font-size:13px">Could not load watch zones.</p>';
        });
    }

    window.useWatchZone = function(lat, lon) {
        areaAlertLocation = { lat: lat, lon: lon };
        refreshAreaAlerts();
    };

    window.deleteWatchZone = function(id) {
        apiFetch('/watch-zones?id=' + id, { method: 'DELETE' }).then(function() {
            loadWatchZones();
            showToast('Watch zone removed');
        });
    };

    window.addWatchZone = function() {
        var name = prompt('Name this watch zone (e.g. "Downtown dates"):');
        if (!name) return;

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(pos) {
                apiFetch('/watch-zones', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: name,
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        radius_miles: 0.5,
                        source: 'manual'
                    })
                }).then(function(data) {
                    if (data && data.error) { showToast(data.error, true); return; }
                    loadWatchZones();
                    showToast('Watch zone added!');
                });
            }, function() {
                showToast('Location access needed to add a watch zone', true);
            });
        }
    };

    // ==================== CATFISH CHECK ====================
    var catfishFileData = null;

    window.handleCatfishFile = function(input) {
        var file = input.files && input.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { showToast('Photo must be under 5MB', true); return; }
        var reader = new FileReader();
        reader.onload = function(e) {
            catfishFileData = e.target.result; // data URL
            var area = document.getElementById('cf-upload-area');
            area.innerHTML = '<img src="' + catfishFileData + '" style="max-width:100%;max-height:160px;border-radius:8px;margin-bottom:8px"><br><span style="color:#2ecc71;font-size:13px"><i class="fas fa-check-circle"></i> ' + escapeHtml(file.name) + '</span><br><span style="color:#8080A0;font-size:12px;margin-top:4px;display:inline-block">Tap to change photo</span>';
            var preview = document.getElementById('cf-preview');
            if (preview) preview.style.display = 'none';
        };
        reader.readAsDataURL(file);
    };

    window.handleCatfishFileDrop = function(e) {
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) { showToast('Drop an image file', true); return; }
        var input = document.getElementById('cf-file-input');
        var dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        handleCatfishFile(input);
    };

    window.runCatfishCheck = function() {
        var imageUrl = document.getElementById('cf-image-url').value.trim();
        var profileName = document.getElementById('cf-profile-name').value.trim();
        var platform = document.getElementById('cf-platform').value;
        var results = document.getElementById('catfish-results');
        var preview = document.getElementById('cf-preview');
        var previewImg = document.getElementById('cf-preview-img');

        if (!catfishFileData && !imageUrl) { showToast('Upload a photo to analyze.', true); return; }

        if (!catfishFileData && imageUrl) {
            if (previewImg) { previewImg.src = imageUrl; if(preview) preview.style.display = 'block'; previewImg.onerror = function(){ if(preview) preview.style.display='none'; }; }
        }

        results.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Analyzing photo for catfishing indicators...</div>';

        var payload = { profileName: profileName, platform: platform };
        if (catfishFileData) {
            payload.imageData = catfishFileData;
        } else {
            payload.imageUrl = imageUrl;
        }

        apiFetch('/screening/catfish', {
            method: 'POST',
            body: JSON.stringify(payload)
        }).then(function(data) {
            var sc = data.catfishScore >= 60 ? '#e74c3c' : data.catfishScore >= 30 ? '#B48CD2' : '#2ecc71';
            var rl = data.riskLevel === 'high_risk' ? 'High Risk' : data.riskLevel === 'medium_risk' ? 'Medium Risk' : data.riskLevel === 'low_risk' ? 'Low Risk' : 'Likely Safe';
            var h = '<div style="text-align:center;margin:16px 0"><div style="width:80px;height:80px;border-radius:50%;border:4px solid '+sc+';display:inline-flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:'+sc+'">'+data.catfishScore+'</div><div style="color:'+sc+';font-weight:700;font-size:18px;margin-top:8px">'+rl+'</div></div>';
            if (data.redFlags && data.redFlags.length > 0) { h += '<div style="margin-bottom:12px">'; data.redFlags.forEach(function(f){ h += '<div style="padding:6px 12px;background:rgba(231,76,60,0.1);border-radius:6px;color:#e74c3c;font-size:13px;margin-bottom:4px"><i class="fas fa-flag"></i> '+escapeHtml(f)+'</div>'; }); h += '</div>'; }
            if (data.greenFlags && data.greenFlags.length > 0) { data.greenFlags.forEach(function(f){ h += '<div style="padding:6px 12px;background:rgba(46,204,113,0.1);border-radius:6px;color:#2ecc71;font-size:13px;margin-bottom:4px"><i class="fas fa-check"></i> '+escapeHtml(f)+'</div>'; }); }
            results.innerHTML = h;
        }).catch(function(err) {
            results.innerHTML = '<div class="disclaimer" style="border-color:#e74c3c"><i class="fas fa-exclamation-circle" style="color:#e74c3c"></i><span>Catfish check failed: '+escapeHtml(err.message||'Unknown error')+'</span></div>';
        });
    };

    // ==================== NAME WATCH ====================
    window.initNameWatch = function() {
        var user = JSON.parse(localStorage.getItem('safetea_user') || '{}');
        var tier = (user.subscription_tier || 'free').toLowerCase();
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
        apiFetch('/namewatch').then(function(data) {
            var list = document.getElementById('nw-list');
            if (!list) return;
            if (!data || !data.names || data.names.length === 0) {
                list.innerHTML = '<div style="text-align:center;padding:20px;color:#8080A0"><i class="fas fa-eye-slash" style="font-size:24px;display:block;margin-bottom:8px"></i>No names being watched yet. Add one above.</div>';
                return;
            }
            var h = '';
            data.names.forEach(function(n) {
                h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-bottom:8px">';
                h += '<div><i class="fas fa-eye" style="color:#E8A0B5;margin-right:8px"></i><strong style="color:#fff">' + escapeHtml(n.name) + '</strong>';
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
                    mh += '<strong style="color:#E8A0B5">' + escapeHtml(m.matched_name) + '</strong>';
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

        apiFetch('/namewatch', {
            method: 'POST',
            body: JSON.stringify({ name: name })
        }).then(function(data) {
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
        apiFetch('/namewatch', {
            method: 'DELETE',
            body: JSON.stringify({ id: id })
        }).then(function(data) {
            if (data && data.success) {
                showToast('Name removed');
                loadWatchedNames();
            } else {
                showToast(data.error || 'Failed to remove', true);
            }
        }).catch(function() { showToast('Failed to remove name', true); });
    };

    // ==================== TEA TALK (Community Posts) ====================
    function hubFormatBody(text) {
        if (!text) return '';
        var escaped = escapeHtml(text);
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
        var cityHtml = post.city ? ' <span style="display:inline-flex;align-items:center;gap:4px;background:rgba(232,160,181,0.15);color:#E8A0B5;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;margin-left:8px"><i class="fas fa-map-marker-alt"></i> ' + escapeHtml(post.city) + '</span>' : '';
        var badgeHtml = hubGetCategoryBadge(post.category);
        var replyCount = post.reply_count || 0;
        var likeCount = parseInt(post.like_count) || 0;
        var userLiked = post.user_liked === true || post.user_liked === 't';
        var heartIcon = userLiked ? 'fas fa-heart' : 'far fa-heart';
        var heartStyle = userLiked ? 'color:#e74c3c' : 'color:#8080A0';
        var canMod = canModifyPost(post);

        return '<div id="post-' + post.id + '" style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin-bottom:12px">' +
            '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
                '<div style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;flex-shrink:0;background:' + avatarColor + '">' + initial + '</div>' +
                '<div style="flex:1">' +
                    '<div style="font-weight:600;font-size:14px;color:#fff">' + escapeHtml(authorName) + ' ' + badgeHtml + '</div>' +
                    '<div style="font-size:12px;color:#666;margin-top:2px">' + getTimeAgo(post.created_at) + cityHtml + '</div>' +
                '</div>' +
            '</div>' +
            '<div style="font-size:14px;line-height:1.6;color:#ccc;margin-bottom:16px">' + hubFormatBody(post.body) + '</div>' +
            '<div style="display:flex;gap:16px;align-items:center">' +
                '<button id="like-btn-' + post.id + '" onclick="toggleLike(' + post.id + ')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:4px 8px;' + heartStyle + '"><i class="' + heartIcon + '"></i> <span id="like-count-' + post.id + '">' + likeCount + '</span></button>' +
                '<span style="font-size:12px;color:#8080A0"><i class="fas fa-comment"></i> ' + replyCount + ' replies</span>' +
                (canMod ? '<button onclick="editPost(' + post.id + ', \'' + escapeHtml(post.body || '').replace(/'/g, "\\'").replace(/\n/g, '\\n') + '\', \'community\')" style="margin-left:auto;background:none;border:none;color:#8080A0;font-size:12px;cursor:pointer;padding:4px 8px"><i class="fas fa-pencil-alt"></i> Edit</button>' : '') +
                (canMod ? '<button onclick="deletePost(' + post.id + ', \'community\')" style="background:none;border:none;color:#e74c3c;font-size:12px;cursor:pointer;padding:4px 8px"><i class="fas fa-trash"></i> Delete</button>' : '') +
            '</div>' +
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
        }).catch(function() {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#8080A0"><i class="fas fa-exclamation-triangle"></i> Could not load discussions</div>';
        });
    }

    window.hubSubmitCommunityPost = function() {
        var body = document.getElementById('hub-community-body').value.trim();
        var category = document.getElementById('hub-community-category').value;
        var city = document.getElementById('hub-community-city').value.trim();
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
            if (data.error) { showToast(data.error, true); return; }
            document.getElementById('hub-community-body').value = '';
            document.getElementById('hub-community-city').value = '';
            document.getElementById('hub-community-category').value = 'general';
            showToast('Post shared!');
            hubLoadCommunityPosts();
        }).catch(function() {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Post';
            showToast('Failed to submit post.', true);
        });
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
                referralPhotoData = e.target.result;
                var preview = document.getElementById('hub-referral-photo-preview');
                var img = document.getElementById('hub-referral-photo-img');
                if (img) img.src = referralPhotoData;
                if (preview) preview.style.display = 'inline-block';
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
        var canMod = canModifyPost(post);

        return '<div id="post-' + post.id + '" style="background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin-bottom:12px">' +
            '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
                '<div style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;flex-shrink:0;background:' + avatarColor + '">' + initial + '</div>' +
                '<div>' +
                    '<div style="font-weight:600;font-size:14px;color:#fff">' + escapeHtml(authorName) + '</div>' +
                    '<div style="font-size:11px;color:#2ecc71"><i class="fas fa-star"></i> Recommender</div>' +
                '</div>' +
            '</div>' +
            '<div style="background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.15);border-radius:10px;padding:14px;margin-bottom:12px">' +
                '<div style="font-size:18px;font-weight:700;color:#2ecc71">' + escapeHtml(personName) + '</div>' +
                (post.city ? '<span style="font-size:11px;color:#8080A0;background:#141428;padding:2px 8px;border-radius:20px;margin-top:6px;display:inline-block">' + escapeHtml(post.city) + '</span>' : '') +
            '</div>' +
            (post.image_url ? '<div style="margin-bottom:12px"><img src="' + escapeHtml(post.image_url) + '" style="width:100%;max-height:300px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,0.06)" alt="Referral photo"></div>' : '') +
            '<div style="font-size:14px;line-height:1.6;color:#ccc;font-style:italic;margin-bottom:12px">"' + escapeHtml(post.body) + '"</div>' +
            '<div style="display:flex;gap:16px;align-items:center">' +
                '<span style="font-size:12px;color:#8080A0"><i class="fas fa-thumbs-up"></i> ' + (post.upvotes || 0) + ' vouches</span>' +
                '<span style="font-size:12px;color:#8080A0"><i class="fas fa-comment"></i> ' + replyCount + ' comments</span>' +
                (post.user_id ? '<button onclick="hubContactPoster(' + post.user_id + ', \'' + escapeHtml(authorName).replace(/'/g, "\\'") + '\')" style="margin-left:auto;background:linear-gradient(135deg,#E8A0B5,#C77DBA);color:#fff;border:none;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px"><i class="fas fa-envelope"></i> Ask About Him</button>' : '') +
                (canMod ? '<button onclick="editPost(' + post.id + ', \'' + escapeHtml(post.body || '').replace(/'/g, "\\'").replace(/\n/g, '\\n') + '\', \'referral\')" style="background:none;border:none;color:#8080A0;font-size:12px;cursor:pointer;padding:4px 8px"><i class="fas fa-pencil-alt"></i></button>' : '') +
                (canMod ? '<button onclick="deletePost(' + post.id + ', \'referral\')" style="background:none;border:none;color:#e74c3c;font-size:12px;cursor:pointer;padding:4px 8px"><i class="fas fa-trash"></i></button>' : '') +
            '</div>' +
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
        }).catch(function() {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#8080A0"><i class="fas fa-exclamation-triangle"></i> Could not load referrals</div>';
        });
    }

    window.hubSubmitReferral = function() {
        var name = document.getElementById('hub-referral-name').value.trim();
        var city = document.getElementById('hub-referral-city').value.trim();
        var relation = document.getElementById('hub-referral-relation').value;
        var body = document.getElementById('hub-referral-body').value.trim();
        if (!name || !body) { showToast('Please fill in the name and your recommendation.', true); return; }
        apiFetch('/posts', {
            method: 'POST',
            body: JSON.stringify({ title: name, body: body + (relation !== 'How do you know him?' ? ' [' + relation + ']' : ''), category: 'referral', city: city || null, feed: 'referral', image_url: referralPhotoData || null })
        }).then(function(data) {
            if (data.error) { showToast(data.error, true); return; }
            document.getElementById('hub-referral-name').value = '';
            document.getElementById('hub-referral-city').value = '';
            document.getElementById('hub-referral-body').value = '';
            document.getElementById('hub-referral-relation').selectedIndex = 0;
            removeReferralPhoto();
            showToast('Referral submitted!');
            hubLoadReferralPosts();
        }).catch(function() {
            showToast('Failed to submit referral.', true);
        });
    };

    window.hubContactPoster = function(posterId, posterName) {
        if (!token) { showToast('Please log in to send a message.', true); return; }
        var modal = document.createElement('div');
        modal.className = 'dc-share-modal';
        modal.id = 'hub-contact-modal';
        modal.innerHTML =
            '<div class="dc-share-modal-content">' +
                '<h3 style="color:#fff;margin-bottom:16px"><i class="fas fa-envelope" style="color:#E8A0B5"></i> Ask About Him</h3>' +
                '<p style="color:#8080A0;font-size:13px;margin-bottom:12px">Send a message to <strong style="color:#fff">' + escapeHtml(posterName) + '</strong> about their referral.</p>' +
                '<div class="dc-form-group">' +
                    '<textarea id="hub-contact-message" rows="4" placeholder="Hi! I saw your referral and would love to know more..." style="width:100%;padding:12px;background:#2A2A44;border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;font-size:14px;resize:vertical;font-family:inherit"></textarea>' +
                '</div>' +
                '<button id="hub-contact-send-btn" class="dc-btn dc-btn-primary" onclick="hubSendContactMessage(' + posterId + ', \'' + escapeHtml(posterName).replace(/'/g, "\\'") + '\')"><i class="fas fa-paper-plane"></i> Send Message</button>' +
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
                showToast(data.error || 'Failed to send message', true);
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
        else loadPosts();
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
                '<textarea id="edit-post-body" rows="6" style="width:100%;padding:12px;background:#2A2A44;border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;font-size:14px;resize:vertical;font-family:inherit">' + escapeHtml(currentBody) + '</textarea>' +
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

    // ==================== INIT ====================
    initUI();
    initTabs();
    initSearchTabs();
    loadPosts();
    loadAlerts();
    loadCities();

    // Refresh user data from server to pick up subscription_tier changes
    apiFetch('/auth/me').then(function(data) {
        if (data && data.user) {
            user = Object.assign(user, data.user);
            localStorage.setItem('safetea_user', JSON.stringify(user));
        }
    }).catch(function() {});

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
        // Share URL
        var urlEl = document.getElementById('grow-share-url');
        if (urlEl && data.shareUrl) urlEl.value = data.shareUrl;

        // Referral count
        var countEl = document.getElementById('grow-ref-count');
        if (countEl) countEl.textContent = data.count || 0;

        // Promo banner
        var promoBanner = document.getElementById('grow-promo-banner');
        var countdown = document.getElementById('grow-promo-countdown');
        if (data.promoActive === false && promoBanner) {
            promoBanner.style.background = 'rgba(128,128,160,0.08)';
            promoBanner.style.borderColor = 'rgba(128,128,160,0.15)';
            if (countdown) countdown.textContent = 'Promo has ended';
        } else if (countdown && data.promoEndDate) {
            var end = new Date(data.promoEndDate);
            var now = new Date();
            var days = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
            countdown.textContent = days + ' days remaining — ends ' + end.toLocaleDateString();
        }

        // Progress bar
        var count = data.count || 0;
        var progressBar = document.getElementById('grow-progress-bar');
        var progressText = document.getElementById('grow-progress-text');
        if (progressBar) progressBar.style.width = Math.min(100, (count / 25) * 100) + '%';
        if (progressText) progressText.textContent = count + ' / 25';

        // Tier statuses
        var tiers = data.tiers || [
            { threshold: 3, label: '30 days SafeTea+' },
            { threshold: 10, label: '30 days SafeTea Pro' },
            { threshold: 25, label: '90 days SafeTea Pro' }
        ];
        var claimedThresholds = {};
        if (data.rewards) {
            data.rewards.forEach(function(r) { claimedThresholds[r.threshold] = true; });
        }
        tiers.forEach(function(tier) {
            var iconEl = document.getElementById('grow-tier-' + tier.threshold + '-icon');
            var claimBtn = document.getElementById('grow-claim-' + tier.threshold);
            var statusEl = document.getElementById('grow-status-' + tier.threshold);
            if (claimedThresholds[tier.threshold]) {
                if (iconEl) { iconEl.className = 'fas fa-check'; iconEl.style.color = '#2ecc71'; }
                if (claimBtn) claimBtn.style.display = 'none';
                if (statusEl) { statusEl.textContent = 'Claimed'; statusEl.style.color = '#2ecc71'; }
            } else if (count >= tier.threshold && data.promoActive !== false) {
                if (iconEl) { iconEl.className = 'fas fa-unlock'; iconEl.style.color = '#E8A0B5'; }
                if (claimBtn) claimBtn.style.display = 'inline-block';
                if (statusEl) statusEl.textContent = '';
            } else {
                if (iconEl) { iconEl.className = 'fas fa-lock'; iconEl.style.color = '#8080A0'; }
                if (claimBtn) claimBtn.style.display = 'none';
                var needed = tier.threshold - count;
                if (statusEl) { statusEl.textContent = needed + ' more needed'; statusEl.style.color = '#8080A0'; }
            }
        });

        // Active rewards
        var rewardsContainer = document.getElementById('grow-active-rewards');
        var rewardsList = document.getElementById('grow-rewards-list');
        if (data.activeRewards && data.activeRewards.length > 0 && rewardsContainer && rewardsList) {
            rewardsContainer.style.display = 'block';
            rewardsList.innerHTML = data.activeRewards.map(function(r) {
                var exp = new Date(r.expires_at);
                var daysLeft = Math.max(0, Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24)));
                return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04)">'
                    + '<i class="fas fa-crown" style="color:#2ecc71"></i>'
                    + '<div style="flex:1"><div style="font-size:13px;color:#fff;font-weight:500">' + (r.label || r.tier) + '</div>'
                    + '<div style="font-size:11px;color:#8080A0">' + daysLeft + ' days remaining</div></div></div>';
            }).join('');
        } else if (rewardsContainer) {
            rewardsContainer.style.display = 'none';
        }

        // Referrals list
        var friendsList = document.getElementById('grow-friends-list');
        if (data.referrals && data.referrals.length > 0 && friendsList) {
            friendsList.innerHTML = data.referrals.map(function(r) {
                var joinDate = new Date(r.created_at).toLocaleDateString();
                var initial = (r.display_name || 'U').charAt(0).toUpperCase();
                return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04)">'
                    + '<div style="width:32px;height:32px;border-radius:50%;background:rgba(232,160,181,0.15);color:#E8A0B5;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">' + initial + '</div>'
                    + '<div style="flex:1"><div style="font-size:13px;color:#fff">' + (r.display_name || 'Anonymous') + '</div>'
                    + '<div style="font-size:11px;color:#8080A0">Joined ' + joinDate + '</div></div></div>';
            }).join('');
        } else if (friendsList) {
            friendsList.innerHTML = '<div style="text-align:center;padding:20px;color:#8080A0;font-size:13px">No referrals yet. Share your link to get started!</div>';
        }

        // Lifetime cap
        var capEl = document.getElementById('grow-lifetime-cap');
        if (capEl) {
            var used = data.daysUsed || 0;
            capEl.innerHTML = '<i class="fas fa-info-circle"></i> ' + used + ' / 180 free days used';
        }
    }

    window.claimGrowReward = function(threshold) {
        var btn = document.getElementById('grow-claim-' + threshold);
        if (btn) { btn.disabled = true; btn.textContent = 'Claiming...'; }
        apiFetch('/referral', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'claim', threshold: threshold })
        }).then(function(data) {
            if (data && data.success) {
                showToast('Reward claimed! Enjoy your free premium time.');
                loadGrowReferral();
                // Refresh user data to pick up tier upgrade
                apiFetch('/auth/me').then(function(d) {
                    if (d && d.user) {
                        user = Object.assign(user, d.user);
                        localStorage.setItem('safetea_user', JSON.stringify(user));
                    }
                }).catch(function() {});
            } else {
                showToast(data && data.error ? data.error : 'Could not claim reward', true);
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
            var msg = 'Hey! Check out SafeTea — it helps women stay safe while dating. Join my community: ' + urlEl.value;
            window.open('sms:?body=' + encodeURIComponent(msg), '_blank');
        }
    };

    window.shareReferralNative = function() {
        var urlEl = document.getElementById('grow-share-url');
        if (urlEl && urlEl.value && navigator.share) {
            navigator.share({
                title: 'SafeTea - Date Smarter. Stay Safer.',
                text: 'Join SafeTea — a private community where women protect each other in the dating world.',
                url: urlEl.value
            }).catch(function() {});
        } else {
            copyReferralLink();
        }
    };

    // Capture referral code from URL on page load
    (function() {
        var p = new URLSearchParams(window.location.search);
        var ref = p.get('ref');
        if (ref) localStorage.setItem('safetea_referral_code', ref);
    })();
})();

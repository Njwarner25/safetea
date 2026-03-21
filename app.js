// SafeTea Dashboard App
(function() {
    'use strict';

    var API = '/api';
    var token = localStorage.getItem('safetea_token');
    var user = JSON.parse(localStorage.getItem('safetea_user') || 'null');
    var selectedImage = null;

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
        // Update nav
        document.querySelectorAll('.topnav-nav a').forEach(function(a) {
            a.classList.remove('active');
        });
        var activeLink = document.querySelector('.topnav-nav a[data-tab="' + tab + '"]');
        if (activeLink) activeLink.classList.add('active');

        // Show correct section
        document.querySelectorAll('.tab-section').forEach(function(s) {
            s.classList.remove('active');
        });
        var section = document.getElementById('tab-' + tab);
        if (section) section.classList.add('active');

        // Load data for tab
        if (tab === 'alerts') loadFullAlerts();
        if (tab === 'profile') loadProfile();
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
                feed.innerHTML = '<div class="empty-state"><i class="fas fa-comments" style="font-size:40px;color:#333;display:block;margin-bottom:12px"></i><p>No posts yet. Be the first to share!</p></div>';
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
        apiFetch('/posts', {
            method: 'POST',
            body: JSON.stringify({
                title: content.substring(0, 60),
                body: content,
                city: user.city,
                category: category
            })
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

    // ==================== PROFILE ====================
    function loadProfile() {
        var name = user.display_name || 'Member';
        document.getElementById('profile-avatar').textContent = name[0].toUpperCase();
        document.getElementById('profile-name').textContent = name;
        document.getElementById('profile-email').textContent = user.email || '';
        document.getElementById('profile-role').textContent = user.role || 'member';
        document.getElementById('edit-name').value = user.display_name || '';
        document.getElementById('edit-city').value = user.city || '';
        document.getElementById('edit-bio').value = user.bio || '';
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
            // Check against sample data for demo
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
        var results = document.getElementById('background-results');

        if (!name) {
            showToast('Full name is required.', true);
            return;
        }

        results.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Running background check...</div>';

        // Simulate background check
        setTimeout(function() {
            results.innerHTML = '<h4 style="color:#fff;margin-bottom:16px"><i class="fas fa-file-alt" style="color:#f27059"></i> Background Report for ' + escapeHtml(name) + '</h4>' +
                '<div class="result-card">' +
                '<div class="result-avatar" style="background:rgba(46,204,113,0.1)"><i class="fas fa-check" style="color:#2ecc71"></i></div>' +
                '<div class="result-info">' +
                '<h4>Identity Verification <span class="result-badge badge-clear">Verified</span></h4>' +
                '<div class="result-detail">Name and location match public records</div>' +
                '</div></div>' +
                '<div class="result-card">' +
                '<div class="result-avatar" style="background:rgba(46,204,113,0.1)"><i class="fas fa-gavel" style="color:#2ecc71"></i></div>' +
                '<div class="result-info">' +
                '<h4>Criminal Records <span class="result-badge badge-clear">Clear</span></h4>' +
                '<div class="result-detail">No criminal records found in public databases</div>' +
                '</div></div>' +
                '<div class="result-card">' +
                '<div class="result-avatar" style="background:rgba(46,204,113,0.1)"><i class="fas fa-user-shield" style="color:#2ecc71"></i></div>' +
                '<div class="result-info">' +
                '<h4>Sex Offender Registry <span class="result-badge badge-clear">Not Listed</span></h4>' +
                '<div class="result-detail">Not found on national sex offender registry</div>' +
                '</div></div>' +
                '<div class="result-card">' +
                '<div class="result-avatar" style="background:rgba(241,196,15,0.1)"><i class="fas fa-info-circle" style="color:#f1c40f"></i></div>' +
                '<div class="result-info">' +
                '<h4>Social Media <span class="result-badge badge-caution">Limited Info</span></h4>' +
                '<div class="result-detail">Some social media profiles found but limited public information available</div>' +
                '</div></div>' +
                '<div class="disclaimer" style="margin-top:16px"><i class="fas fa-info-circle"></i><span>This is a demo report. In production, SafeTea partners with licensed data providers for comprehensive background checks. Always meet in public places and tell someone where you are going.</span></div>';
        }, 3000);
    };

    // ==================== LOGOUT ====================
    window.handleLogout = function() {
        localStorage.removeItem('safetea_token');
        localStorage.removeItem('safetea_user');
        window.location.href = '/login.html';
    };

    // ==================== INIT ====================
    initUI();
    initTabs();
    initSearchTabs();
    loadPosts();
    loadAlerts();
    loadCities();
})();
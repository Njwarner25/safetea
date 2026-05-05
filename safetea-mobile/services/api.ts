import * as SecureStore from 'expo-secure-store';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://getsafetea.app/api';

interface ApiResponse<T> {
  data: T;
  error?: string;
  status: number;
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    SecureStore.setItemAsync('auth_token', token).catch(() => {});
  }

  clearToken() {
    this.token = null;
    SecureStore.deleteItemAsync('auth_token').catch(() => {});
  }

  async restoreToken() {
    try {
      const saved = await SecureStore.getItemAsync('auth_token');
      if (saved) this.token = saved;
    } catch { /* no saved token */ }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = 'Bearer ' + this.token;
    }

    try {
      const response = await fetch(API_BASE + endpoint, {
        ...options,
        headers,
      });

      const data = await response.json();
      return { data, status: response.status };
    } catch (error) {
      return {
        data: null as T,
        error: error instanceof Error ? error.message : 'Network error',
        status: 0,
      };
    }
  }

  // Auth
  async login(email: string, password: string) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async sendVerificationCode(phone: string) {
    return this.request('/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  }

  async verifyCode(phone: string, code: string) {
    return this.request('/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    });
  }

  // Current user
  async getMe() {
    return this.request<any>('/auth/me');
  }

  // Posts
  async getPosts(cityId: string, page: number = 1) {
    return this.request('/posts?city=' + cityId + '&page=' + page);
  }

  async createPost(post: { title: string; content: string; category: string; cityId: string; isAnonymous: boolean }) {
    return this.request('/posts', {
      method: 'POST',
      body: JSON.stringify(post),
    });
  }

  async votePost(postId: string, direction: 'up' | 'down') {
    return this.request('/posts/' + postId + '/vote', {
      method: 'POST',
      body: JSON.stringify({ direction }),
    });
  }

  // Report
  async reportPost(postId: string, reason: string, details?: string) {
    return this.request('/posts/report', {
      method: 'POST',
      body: JSON.stringify({ post_id: postId, reason, details }),
    });
  }

  // Cities
  async getCities() {
    return this.request('/cities');
  }

  async voteForCity(cityId: string) {
    return this.request('/cities/' + cityId + '/vote', { method: 'POST' });
  }

  // Moderation
  async getModQueue() {
    return this.request('/mod/queue');
  }

  async moderatePost(postId: string, action: string, reason: string) {
    return this.request('/mod/review', {
      method: 'POST',
      body: JSON.stringify({ postId, action, reason }),
    });
  }

  // Search
  async search(query: string, cityId: string) {
    return this.request('/search?q=' + encodeURIComponent(query) + '&city=' + cityId);
  }

  // Subscription — Stripe (web + Android)
  async subscribe(priceId: string) {
    return this.request('/subscribe', {
      method: 'POST',
      body: JSON.stringify({ priceId }),
    });
  }

  // Subscription — Apple StoreKit receipt validation (iOS only).
  // Server re-validates with Apple, then grants the Plus tier on success.
  // The product ID is derived from the validated receipt server-side, not the client.
  async verifyAppleReceipt(receipt: string, _productId?: string) {
    return this.request<any>('/iap/verify-receipt', {
      method: 'POST',
      body: JSON.stringify({ receipt, platform: 'ios' }),
    });
  }

  // Community Name Mentions
  async getNameMentions(fullName: string, city: string, state?: string) {
    const params = new URLSearchParams({ fullName, city });
    if (state) params.set('state', state);
    return this.request<any>('/community/name-mentions?' + params.toString());
  }

  // Crime Alerts
  async getAreaAlerts(lat: number, lon: number, radius: number = 2, days: number = 30) {
    return this.request('/alerts/area?lat=' + lat + '&lon=' + lon + '&radius=' + radius + '&days=' + days + '&limit=20');
  }

  // Identity Verification
  async getIdentityChallenge() {
    return this.request<{ challenge_id: string; instruction: string }>('/auth/verify/identity');
  }

  async submitIdentityVerification(selfie: string, challengeId: string) {
    return this.request<any>('/auth/verify/identity', {
      method: 'POST',
      body: JSON.stringify({ selfie, challenge_id: challengeId }),
    });
  }

  async getVerificationStatus() {
    return this.request<any>('/auth/verify/status');
  }

  // Sex Offender Check
  async sexOffenderCheck(fullName: string, state?: string, city?: string, cityId?: string) {
    return this.request<any>('/screening/sex-offender', {
      method: 'POST',
      body: JSON.stringify({ fullName, state, city, cityId }),
    });
  }

  // AI Profile Screening (catfish detection)
  async screenProfile(profileName: string, platform: string) {
    return this.request<any>('/screening/catfish', {
      method: 'POST',
      body: JSON.stringify({ profileName, platform }),
    });
  }

  // SafeWalk — Date Checkout (start session)
  async dateCheckout(data: { dateName: string; venue: string; address?: string; transportation?: string; estimatedReturn?: string; contacts: { name: string; phone: string }[] }) {
    return this.request<any>('/dates/checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // SafeWalk — check-in (safe return)
  async dateCheckin(checkoutId: string, safetyRating?: number, notes?: string) {
    return this.request<any>('/dates/checkin', {
      method: 'POST',
      body: JSON.stringify({ checkoutId, safetyRating, notes }),
    });
  }

  // SafeWalk — Share trip details with contacts
  async shareDateDetails(checkoutId: string, contacts: { name: string; phone: string }[]) {
    return this.request<any>('/dates/share', {
      method: 'POST',
      body: JSON.stringify({ checkoutId, contacts }),
    });
  }

  // SafeWalk — Panic alert
  async panicAlert(checkoutId: string) {
    return this.request<any>('/dates/report', {
      method: 'POST',
      body: JSON.stringify({ checkoutId, method: 'sms', emergency: true }),
    });
  }

  // Moderator — Submit application
  async submitModApplication(motivation: string) {
    return this.request<any>('/admin/moderators', {
      method: 'POST',
      body: JSON.stringify({ motivation }),
    });
  }

  // Moderator — Get queue
  async getModQueueItems() {
    return this.request<any>('/admin/posts');
  }

  // Moderator — Take action on post
  async moderatePostAction(postId: string, action: string, reason?: string) {
    return this.request<any>('/admin/posts/' + postId + '/moderate', {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    });
  }

  // SOS — Emergency alert
  async sosAlert(type: string, latitude?: number, longitude?: number) {
    return this.request<any>('/dates/sos', {
      method: 'POST',
      body: JSON.stringify({ type, latitude, longitude }),
    });
  }

  // Fake Call — AI script generation
  async generateFakeCallScript(callerName: string, context: string) {
    return this.request<{ script: string }>('/dates/fake-call-script', {
      method: 'POST',
      body: JSON.stringify({ callerName, context }),
    });
  }

  // Fake Call — Voice synthesis
  async synthesizeFakeCallVoice(script: string, persona?: string) {
    return this.request<{ audio: string }>('/dates/fake-call-voice', {
      method: 'POST',
      body: JSON.stringify({ script, persona }),
    });
  }

  // Push Notifications
  async registerPushToken(token: string, platform: string) {
    return this.request('/notifications/register', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    });
  }

  // Name Ping (Android-only feature; iOS hides UI per Apple Guideline 5.1.1(viii))
  async getWatchedNames() {
    return this.request<any>('/namewatch');
  }

  async addWatchedName(name: string) {
    return this.request<any>('/namewatch', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async deleteWatchedName(id: number) {
    return this.request<any>('/namewatch?id=' + id, {
      method: 'DELETE',
    });
  }

  async getNamePingUnread() {
    return this.request<any>('/namewatch/unread');
  }

  async markAllNamePingRead() {
    return this.request<any>('/namewatch/read-all', {
      method: 'POST',
    });
  }

  // Red Flag / Conversation Scanner
  // Accepts text, screenshot images (base64), or both
  async scanConversation(conversationText?: string, textImages?: string[]) {
    const body: any = {};
    if (conversationText) body.conversationText = conversationText;
    if (textImages && textImages.length > 0) body.textImages = textImages;
    return this.request<any>('/screening/redflag', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // Photo Verify — sends base64 images directly to verify endpoint
  async verifyPhotos(images: string[]) {
    return this.request<any>('/photos/verify', {
      method: 'POST',
      body: JSON.stringify({ images }),
    });
  }

  // Photo Upload — for posting photos to community
  async uploadPhoto(base64: string, context: string = 'post', contextId?: string) {
    return this.request<any>('/photos/upload', {
      method: 'POST',
      body: JSON.stringify({ image: base64, context, context_id: contextId }),
    });
  }

  // Messages
  async getConversations() {
    return this.request<any>('/messages');
  }

  async getMessages(userId: string) {
    return this.request<any>('/messages/' + userId);
  }

  async sendMessage(userId: string, body: string) {
    return this.request<any>('/messages', {
      method: 'POST',
      body: JSON.stringify({ to_user_id: userId, body }),
    });
  }

  // Rooms
  async getMyRooms() {
    return this.request<any>('/rooms/my-rooms');
  }

  async getRoomDetails(roomId: string) {
    return this.request<any>('/rooms/details?room_id=' + roomId);
  }

  async getRoomFeed(roomId: string) {
    return this.request<any>('/rooms/feed?room_id=' + roomId);
  }

  async getRoomMembers(roomId: string) {
    return this.request<any>('/rooms/members?room_id=' + roomId);
  }

  async createRoom(data: { name: string; description?: string; is_private?: boolean }) {
    return this.request<any>('/rooms/create', { method: 'POST', body: JSON.stringify(data) });
  }

  async joinRoom(data: { join_code?: string; qr_token?: string }) {
    return this.request<any>('/rooms/join', { method: 'POST', body: JSON.stringify(data) });
  }

  async leaveRoom(roomId: string) {
    return this.request<any>('/rooms/leave', { method: 'POST', body: JSON.stringify({ room_id: roomId }) });
  }

  async postInRoom(roomId: string, content: string) {
    return this.request<any>('/rooms/post', { method: 'POST', body: JSON.stringify({ room_id: roomId, content }) });
  }

  async replyInRoom(roomId: string, postId: string, content: string) {
    return this.request<any>('/rooms/replies', { method: 'POST', body: JSON.stringify({ room_id: roomId, post_id: postId, content }) });
  }

  // Vault
  async getVaultFolders() {
    return this.request<any>('/vault/folders');
  }

  async createVaultFolder(title: string, description?: string) {
    return this.request<any>('/vault/folders', { method: 'POST', body: JSON.stringify({ title, description }) });
  }

  async getVaultEntries(folderId: string) {
    return this.request<any>('/vault/entries?folder_id=' + folderId);
  }

  async createVaultEntry(data: { folder_id: string; type: string; title: string; content?: string; file_url?: string }) {
    return this.request<any>('/vault/entries', { method: 'POST', body: JSON.stringify(data) });
  }

  async deleteVaultEntry(entryId: string) {
    return this.request<any>('/vault/entries?entry_id=' + entryId, { method: 'DELETE' });
  }

  async getVaultContacts() {
    return this.request<any>('/vault/contacts');
  }

  async addVaultContact(data: { name: string; phone: string; email?: string; relationship: string }) {
    return this.request<any>('/vault/contacts', { method: 'POST', body: JSON.stringify(data) });
  }

  async removeVaultContact(contactId: string) {
    return this.request<any>('/vault/contacts?contact_id=' + contactId, { method: 'DELETE' });
  }

  async getVaultAuditLog() {
    return this.request<any>('/vault/audit');
  }

  async triggerVaultRelease(contactId: string) {
    return this.request<any>('/vault/access-requests', { method: 'POST', body: JSON.stringify({ contact_id: contactId }) });
  }

  // Post replies
  async getPostReplies(postId: string) {
    return this.request<any>('/posts/' + postId + '/replies');
  }

  async createReply(postId: string, content: string) {
    return this.request<any>('/posts/' + postId + '/replies', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  // Admin endpoints
  async getAdminStats() {
    return this.request<any>('/admin/stats');
  }

  async getRecentSignups() {
    return this.request<any>('/admin/recent-signups');
  }

  async getSuspiciousSignups() {
    return this.request<any>('/admin/suspicious-signups');
  }

  async getAITasks() {
    return this.request<any>('/admin/ai-tasks');
  }

  async enforceAITask(taskId: string, action: string) {
    return this.request<any>('/admin/ai-enforce', { method: 'POST', body: JSON.stringify({ task_id: taskId, action }) });
  }

  async banUser(userId: string, reason: string) {
    return this.request<any>('/admin/ban', { method: 'POST', body: JSON.stringify({ user_id: userId, reason }) });
  }

  async warnUser(userId: string, reason: string) {
    return this.request<any>('/admin/warn', { method: 'POST', body: JSON.stringify({ user_id: userId, reason }) });
  }

  async getTrustEvents() {
    return this.request<any>('/admin/trust-events');
  }

  // Scam database — fetch entries from community reports
  async getScamReports(category?: string, search?: string) {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.set('category', category);
    if (search) params.set('q', search);
    return this.request<any>('/community?type=scam&' + params.toString());
  }

  // Tether — group safety mode
  async createTether(data: { session_name: string; distance_threshold_ft: number; night_mode_enabled: boolean; emergency_escalation_enabled: boolean }) {
    return this.request('/tether/create', { method: 'POST', body: JSON.stringify(data) });
  }

  async joinTether(data: { join_code?: string; qr_token?: string; current_lat: number; current_lng: number }) {
    return this.request('/tether/join', { method: 'POST', body: JSON.stringify(data) });
  }

  async lockTether(sessionId: number) {
    return this.request('/tether/lock', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) });
  }

  async updateTetherLocation(sessionId: number, lat: number, lng: number) {
    return this.request('/tether/location', { method: 'POST', body: JSON.stringify({ session_id: sessionId, lat, lng }) });
  }

  async respondTether(sessionId: number, response: string) {
    return this.request('/tether/respond', { method: 'POST', body: JSON.stringify({ session_id: sessionId, response }) });
  }

  async pingTetherMember(sessionId: number, targetUserId: string) {
    return this.request('/tether/ping', { method: 'POST', body: JSON.stringify({ session_id: sessionId, target_user_id: targetUserId }) });
  }

  async endTether(sessionId: number) {
    return this.request('/tether/end', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) });
  }

  async getTetherStatus(sessionId: number) {
    return this.request('/tether/status?session_id=' + sessionId);
  }
}

export const api = new ApiClient();

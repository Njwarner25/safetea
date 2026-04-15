const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.getsafetea.app';

interface ApiResponse<T> {
  data: T;
  error?: string;
  status: number;
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
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
    return this.request('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    });
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

  // Subscription
  async subscribe(priceId: string) {
    return this.request('/subscribe', {
      method: 'POST',
      body: JSON.stringify({ priceId }),
    });
  }

  // Background Check
  async backgroundCheck(fullName: string, city?: string, state?: string, age?: number) {
    return this.request<any>('/screening/background', {
      method: 'POST',
      body: JSON.stringify({ fullName, city, state, age }),
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

  // SafeWalk — SafeTea check-in (safe return)
  async dateCheckin(checkoutId: string, safetyRating?: number, notes?: string) {
    return this.request<any>('/dates/checkin', {
      method: 'POST',
      body: JSON.stringify({ checkoutId, safetyRating, notes }),
    });
  }

  // SafeWalk — Share date details with contacts
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

  // Name Watch
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

  async getNameWatchUnread() {
    return this.request<any>('/namewatch/unread');
  }

  async markAllNameWatchRead() {
    return this.request<any>('/namewatch/read-all', {
      method: 'POST',
    });
  }

  // Scam database — fetch entries from community reports
  async getScamReports(category?: string, search?: string) {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.set('category', category);
    if (search) params.set('q', search);
    return this.request<any>('/community?type=scam&' + params.toString());
  }
}

export const api = new ApiClient();

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

  // Tether
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

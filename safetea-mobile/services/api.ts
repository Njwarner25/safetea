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

  // Sex Offender Check
  async sexOffenderCheck(fullName: string, state?: string, city?: string, cityId?: string) {
    return this.request<any>('/screening/sex-offender', {
      method: 'POST',
      body: JSON.stringify({ fullName, state, city, cityId }),
    });
  }
}

export const api = new ApiClient();

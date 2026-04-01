import { create } from 'zustand';
import { api } from '../services/api';

export type UserRole = 'member' | 'junior_mod' | 'mod' | 'senior_mod' | 'city_lead' | 'admin';
export type UserTier = 'free' | 'plus' | 'pro';

export interface User {
  id: string;
  pseudonym: string;
  avatarId: string;
  avatarBgColor: string;
  avatarFrame: string;
  cityId: number;
  tier: UserTier;
  role: UserRole;
  contributionScore: number;
  strikes: number;
  isBanned: boolean;
  pseudonymChangesRemaining: number;
  createdAt: string;
  lastActive: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isOnboarded: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  setUser: (user: User) => void;
  updateUser: (updates: Partial<User>) => void;
  setOnboarded: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null, token: null, isAuthenticated: false, isLoading: false, isOnboarded: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const res = await api.login(email, password);
      if (res.status === 200 && res.data) {
        const data = res.data as any;
        const token = data.token;
        api.setToken(token);
        // Normalize legacy tier values: 'premium' -> 'plus', 'pro' -> 'plus'
        const user = data.user;
        if (user && (user.tier === 'premium' || user.tier === 'pro')) user.tier = 'plus';
        if (user && user.subscription_tier) {
          const st = user.subscription_tier;
          user.tier = (st === 'premium' || st === 'pro') ? 'plus' : st;
        }
        set({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
          isOnboarded: true,
        });
        return true;
      }
      set({ isLoading: false });
      return false;
    } catch {
      set({ isLoading: false });
      return false;
    }
  },

  logout: () => {
    api.clearToken();
    set({ user: null, token: null, isAuthenticated: false, isOnboarded: false });
  },
  setUser: (user) => set({ user }),
  updateUser: (updates) => { const c = get().user; if (c) set({ user: { ...c, ...updates } }); },
  setOnboarded: (value) => set({ isOnboarded: value }),
}));

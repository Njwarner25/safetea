import { create } from 'zustand';

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

// ============================================
// TEST ACCOUNTS FOR DEVELOPMENT
// ============================================
// ADMIN:      admin@getsafetea.app / SafeTea2026!
// SENIOR MOD: mod@getsafetea.app   / ModTest2026!
// MEMBER:     user@getsafetea.app  / UserTest2026!
// ============================================

const ADMIN_SEED: User = {
  id: 'admin-001-safetea',
  pseudonym: 'TeaAdmin',
  avatarId: 'se1',
  avatarBgColor: '#E8513F',
  avatarFrame: 'hexagon',
  cityId: 1,
  tier: 'pro',
  role: 'admin',
  contributionScore: 9999,
  strikes: 0,
  isBanned: false,
  pseudonymChangesRemaining: 99,
  createdAt: '2025-01-01T00:00:00Z',
  lastActive: new Date().toISOString(),
};

const TEST_ACCOUNTS: Record<string, { password: string; user: User }> = {
  'admin@getsafetea.app': {
    password: 'SafeTea2026!',
    user: ADMIN_SEED,
  },
  'mod@getsafetea.app': {
    password: 'ModTest2026!',
    user: {
      id: 'mod-001-safetea', pseudonym: 'CoralGuardian', avatarId: 'se1',
      avatarBgColor: '#3B82F6', avatarFrame: 'circle', cityId: 1, tier: 'plus',
      role: 'senior_mod', contributionScore: 500, strikes: 0, isBanned: false,
      pseudonymChangesRemaining: 1, createdAt: '2025-03-01T00:00:00Z', lastActive: new Date().toISOString(),
    },
  },
  'user@getsafetea.app': {
    password: 'UserTest2026!',
    user: {
      id: 'user-001-safetea', pseudonym: 'VelvetOrchid', avatarId: 'n1',
      avatarBgColor: '#10B981', avatarFrame: 'none', cityId: 2, tier: 'free',
      role: 'member', contributionScore: 12, strikes: 0, isBanned: false,
      pseudonymChangesRemaining: 1, createdAt: '2025-06-15T00:00:00Z', lastActive: new Date().toISOString(),
    },
  },
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null, token: null, isAuthenticated: false, isLoading: false, isOnboarded: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    await new Promise((resolve) => setTimeout(resolve, 800));
    const account = TEST_ACCOUNTS[email.toLowerCase()];
    if (account && account.password === password) {
      set({ user: account.user, token: 'test-jwt-' + account.user.id, isAuthenticated: true, isLoading: false, isOnboarded: true });
      return true;
    }
    set({ isLoading: false });
    return false;
  },

  logout: () => set({ user: null, token: null, isAuthenticated: false, isOnboarded: false }),
  setUser: (user) => set({ user }),
  updateUser: (updates) => { const c = get().user; if (c) set({ user: { ...c, ...updates } }); },
  setOnboarded: (value) => set({ isOnboarded: value }),
}));

export const TEST_CREDENTIALS = {
  admin: { email: 'admin@getsafetea.app', password: 'SafeTea2026!' },
  moderator: { email: 'mod@getsafetea.app', password: 'ModTest2026!' },
  member: { email: 'user@getsafetea.app', password: 'UserTest2026!' },
};

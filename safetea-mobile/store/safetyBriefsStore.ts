import { create } from 'zustand';
import * as Location from 'expo-location';
import { API_BASE } from '../constants/api';
import { useAuthStore } from './authStore';

export type Brief = {
  id: string;
  type: 'PATTERN' | 'WEATHER' | 'NIGHTTIME' | 'TRANSIT' | 'AREA' | string;
  icon: string;
  body: string;
  severity: 'gentle' | 'severe' | 'info' | 'urgent' | string;
  actions: string[];
  source?: string;
};

type BriefsState = {
  briefs: Brief[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  load: () => Promise<void>;
  dismiss: (id: string) => void;
  clear: () => void;
};

export const useBriefsStore = create<BriefsState>((set) => ({
  briefs: [],
  loading: false,
  error: null,
  lastFetchedAt: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        set({ briefs: [], loading: false, error: 'location_denied' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const now = new Date();
      const url =
        `${API_BASE}/api/ai/briefs` +
        `?lat=${pos.coords.latitude}` +
        `&lng=${pos.coords.longitude}` +
        `&local_hour=${now.getHours()}` +
        `&dow=${now.getDay()}`;
      const token = useAuthStore.getState().token;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`briefs ${res.status}`);
      const data = await res.json();
      const briefs: Brief[] = Array.isArray(data?.briefs) ? data.briefs : [];
      set({ briefs, loading: false, lastFetchedAt: Date.now() });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? 'briefs_failed' });
    }
  },

  dismiss: (id) =>
    set((s) => ({ briefs: s.briefs.filter((b) => b.id !== id) })),

  clear: () => set({ briefs: [], lastFetchedAt: null, error: null }),
}));

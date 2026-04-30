import { create } from 'zustand';
import { api } from '../services/api';

export interface TetherSession {
  id: number;
  hostUserId: string;
  sessionName: string;
  status: 'pending' | 'locked' | 'active' | 'ended' | 'expired';
  distanceThresholdFt: number;
  nightModeEnabled: boolean;
  emergencyEscalationEnabled: boolean;
  createdAt: string;
  lockedAt?: string;
}

export interface TetherMember {
  id: number;
  userId: string;
  displayName: string;
  role: 'host' | 'member';
  status: 'active' | 'idle' | 'separated' | 'offline' | 'ended';
  distanceFt?: number;
  lastLocationUpdatedAt?: string;
  lastResponse?: string;
}

interface TetherState {
  session: TetherSession | null;
  members: TetherMember[];
  joinCode: string | null;
  qrToken: string | null;
  isHost: boolean;
  loading: boolean;
  error: string | null;

  createSession: (name: string, threshold: number, nightMode: boolean, escalation: boolean) => Promise<void>;
  joinSession: (code: string, lat: number, lng: number) => Promise<void>;
  lockSession: () => Promise<void>;
  updateLocation: (lat: number, lng: number) => Promise<void>;
  respond: (response: 'okay' | 'heading_back' | 'need_help') => Promise<void>;
  pingMember: (targetUserId: string) => Promise<void>;
  endSession: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  reset: () => void;
}

export const useTetherStore = create<TetherState>((set, get) => ({
  session: null,
  members: [],
  joinCode: null,
  qrToken: null,
  isHost: false,
  loading: false,
  error: null,

  createSession: async (name, threshold, nightMode, escalation) => {
    set({ loading: true, error: null });
    try {
      const res = await api.createTether({
        session_name: name,
        distance_threshold_ft: threshold,
        night_mode_enabled: nightMode,
        emergency_escalation_enabled: escalation,
      });
      if (res.error) {
        set({ error: res.error, loading: false });
        return;
      }
      const data = res.data as any;
      set({
        session: data.session ?? {
          id: Date.now(),
          hostUserId: 'self',
          sessionName: name,
          status: 'pending' as const,
          distanceThresholdFt: threshold,
          nightModeEnabled: nightMode,
          emergencyEscalationEnabled: escalation,
          createdAt: new Date().toISOString(),
        },
        joinCode: data.join_code ?? String(Math.floor(100000 + Math.random() * 900000)),
        qrToken: data.qr_token ?? null,
        isHost: true,
        members: data.members ?? [{ id: 1, userId: 'self', displayName: 'You (Host)', role: 'host' as const, status: 'active' as const }],
        loading: false,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to create session', loading: false });
    }
  },

  joinSession: async (code, lat, lng) => {
    set({ loading: true, error: null });
    try {
      const res = await api.joinTether({ join_code: code, current_lat: lat, current_lng: lng });
      if (res.error) {
        set({ error: res.error, loading: false });
        return;
      }
      const data = res.data as any;
      set({
        session: data.session ?? {
          id: Date.now(),
          hostUserId: 'host',
          sessionName: 'Tether Session',
          status: 'pending' as const,
          distanceThresholdFt: 300,
          nightModeEnabled: false,
          emergencyEscalationEnabled: false,
          createdAt: new Date().toISOString(),
        },
        joinCode: null,
        isHost: false,
        members: data.members ?? [],
        loading: false,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to join session', loading: false });
    }
  },

  lockSession: async () => {
    const { session } = get();
    if (!session) return;
    set({ loading: true, error: null });
    try {
      const res = await api.lockTether(session.id);
      if (res.error) {
        set({ error: res.error, loading: false });
        return;
      }
      set({
        session: { ...session, status: 'active', lockedAt: new Date().toISOString() },
        loading: false,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to lock session', loading: false });
    }
  },

  updateLocation: async (lat, lng) => {
    const { session } = get();
    if (!session) return;
    try {
      await api.updateTetherLocation(session.id, lat, lng);
    } catch (_) {
      // Silent fail for location updates
    }
  },

  respond: async (response) => {
    const { session } = get();
    if (!session) return;
    set({ loading: true, error: null });
    try {
      await api.respondTether(session.id, response);
      set({ loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to send response', loading: false });
    }
  },

  pingMember: async (targetUserId) => {
    const { session } = get();
    if (!session) return;
    try {
      await api.pingTetherMember(session.id, targetUserId);
    } catch (_) {
      // Silent fail for pings
    }
  },

  endSession: async () => {
    const { session } = get();
    if (!session) return;
    set({ loading: true, error: null });
    try {
      await api.endTether(session.id);
      set({
        session: { ...session, status: 'ended' },
        loading: false,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to end session', loading: false });
    }
  },

  refreshStatus: async () => {
    const { session } = get();
    if (!session) return;
    try {
      const res = await api.getTetherStatus(session.id);
      if (res.error) return;
      const data = res.data as any;
      if (data.session) set({ session: data.session });
      if (data.members) set({ members: data.members });
    } catch (_) {
      // Silent fail for refresh
    }
  },

  reset: () => set({
    session: null,
    members: [],
    joinCode: null,
    qrToken: null,
    isHost: false,
    loading: false,
    error: null,
  }),
}));

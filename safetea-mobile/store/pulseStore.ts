import { create } from 'zustand';
import type {
  GeoPoint,
  PulseAlertPayload,
  PulseAnomalyType,
  PulseSafeZone,
  PulseSession,
  PulseSessionStatus,
} from '../types/pulse';
import { PulseEngine } from '../services/pulse';
import { PULSE_DEFAULT_ENABLED } from '../constants/pulseThresholds';
import { API_BASE } from '../constants/api';
import { useAuthStore } from './authStore';

export type PulseUiStatus = 'idle' | 'active' | 'paused' | 'alert';

interface PulseState {
  globalEnabled: boolean;
  session: PulseSession | null;
  uiStatus: PulseUiStatus;
  promptAnomaly: PulseAnomalyType | null;
  safeZones: PulseSafeZone[];
  userName: string;

  setGlobalEnabled: (v: boolean) => void;
  setUserName: (name: string) => void;
  startSession: (session: PulseSession) => void;
  endSession: () => void;
  reportLocation: (point: GeoPoint) => void;
  setStatus: (status: PulseSessionStatus) => void;

  acknowledgePrompt: () => void;
  sendHelpNow: () => void;

  addSafeZone: (zone: PulseSafeZone) => void;
  removeSafeZone: (id: string) => void;
}

/**
 * Real alert dispatcher. POSTs to /api/pulse/escalate, which fans out
 * SMS to the user's trusted contacts via Twilio. Falls back to a console
 * warning if the network call fails so the local UI state still advances
 * to "escalated" (the user already pressed Help Now / let the timer expire).
 */
async function defaultSendAlert(payload: PulseAlertPayload): Promise<void> {
  try {
    const token = useAuthStore.getState().token;
    const res = await fetch(`${API_BASE}/api/pulse/escalate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        sessionKey: payload.sessionId,
        anomalyType: payload.anomalyType,
        latitude: payload.currentLocation?.latitude ?? null,
        longitude: payload.currentLocation?.longitude ?? null,
        timestamp: payload.timestamp,
        userName: payload.userName,
        routeSummary: payload.routeSummary ?? null,
      }),
    });
    if (!res.ok) {
      console.warn('[Pulse] escalate POST returned', res.status);
    }
  } catch (e) {
    console.warn('[Pulse] escalate network error', e);
  }
}

let sendAlertImpl: (payload: PulseAlertPayload) => Promise<void> =
  defaultSendAlert;

export function setPulseAlertSender(
  fn: (payload: PulseAlertPayload) => Promise<void>
) {
  sendAlertImpl = fn;
}

export const usePulseStore = create<PulseState>((set, get) => {
  const engine = new PulseEngine({
    sendAlert: (p) => sendAlertImpl(p),
    getUserName: () => get().userName,
    onPromptUser: (_session, anomaly) => {
      set({ promptAnomaly: anomaly, uiStatus: 'alert' });
    },
    onEscalated: (session) => {
      set({ promptAnomaly: null, uiStatus: 'alert', session: { ...session, status: 'escalated' } });
    },
    onDismissed: (session) => {
      set({ promptAnomaly: null, uiStatus: 'active', session: { ...session, escalationStatus: 'dismissed' } });
    },
    onStatusChange: (session) => {
      set({
        session,
        uiStatus: !session
          ? 'idle'
          : session.status === 'paused'
          ? 'paused'
          : session.status === 'escalated'
          ? 'alert'
          : 'active',
      });
    },
  });

  return {
    globalEnabled: PULSE_DEFAULT_ENABLED,
    session: null,
    uiStatus: 'idle',
    promptAnomaly: null,
    safeZones: [],
    userName: '',

    setGlobalEnabled: (v) => set({ globalEnabled: v }),
    setUserName: (name) => set({ userName: name }),

    startSession: (session) => {
      if (!get().globalEnabled || !session.pulseEnabled) {
        set({ session, uiStatus: 'paused' });
        return;
      }
      engine.sessions.start(session);
      engine.start();
    },

    endSession: () => {
      engine.stop();
      engine.sessions.end();
      set({ session: null, uiStatus: 'idle', promptAnomaly: null });
    },

    reportLocation: (point) => {
      engine.sessions.markMovement(point);
    },

    setStatus: (status) => {
      engine.sessions.setStatus(status);
    },

    acknowledgePrompt: () => {
      engine.acknowledgePrompt();
    },

    sendHelpNow: () => {
      engine.forceEscalate(get().promptAnomaly ?? 'movement_anomaly');
    },

    addSafeZone: (zone) => {
      const zones = [...get().safeZones.filter((z) => z.id !== zone.id), zone];
      engine.safeZones.setZones(zones);
      set({ safeZones: zones });
    },

    removeSafeZone: (id) => {
      const zones = get().safeZones.filter((z) => z.id !== id);
      engine.safeZones.setZones(zones);
      set({ safeZones: zones });
    },
  };
});

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
 * Stub alert dispatcher. Wire this to the real API (see api/pulse/escalate.js)
 * when the backend is ready. Kept as a function so tests can replace it.
 */
let sendAlertImpl: (payload: PulseAlertPayload) => Promise<void> = async (
  payload
) => {
  if (__DEV__) {
    console.log('[Pulse] sendAlert (stub)', payload);
  }
};

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

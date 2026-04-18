import type {
  PulseAlertPayload,
  PulseAnomalyType,
  PulseSession,
} from '../../types/pulse';
import { PULSE_THRESHOLDS } from '../../constants/pulseThresholds';

export interface EscalationDependencies {
  sendAlert: (payload: PulseAlertPayload) => Promise<void>;
  getUserName: () => string;
  onPromptUser: (session: PulseSession, anomaly: PulseAnomalyType) => void;
  onEscalated: (session: PulseSession, payload: PulseAlertPayload) => void;
  onDismissed: (session: PulseSession) => void;
}

/**
 * Prompt → wait N seconds → escalate unless user responds.
 * Loosely coupled: host supplies a sendAlert callback (wraps API / Twilio).
 */
export class PulseEscalationService {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private deps: EscalationDependencies) {}

  prompt(session: PulseSession, anomaly: PulseAnomalyType) {
    this.cancel(session.sessionId);
    this.deps.onPromptUser(session, anomaly);

    const waitSeconds =
      PULSE_THRESHOLDS[session.sessionType].escalationWaitSeconds;
    const timer = setTimeout(
      () => void this.escalate(session, anomaly),
      waitSeconds * 1000
    );
    this.timers.set(session.sessionId, timer);
  }

  acknowledge(session: PulseSession) {
    this.cancel(session.sessionId);
    this.deps.onDismissed(session);
  }

  async escalate(session: PulseSession, anomaly: PulseAnomalyType) {
    this.cancel(session.sessionId);
    const payload: PulseAlertPayload = {
      userName: this.deps.getUserName(),
      userId: session.userId,
      sessionId: session.sessionId,
      timestamp: new Date().toISOString(),
      anomalyType: anomaly,
      currentLocation: session.lastKnownLocation,
      lastMovementAt: session.lastMovementAt,
    };
    try {
      await this.deps.sendAlert(payload);
    } finally {
      this.deps.onEscalated(session, payload);
    }
  }

  cancel(sessionId: string) {
    const t = this.timers.get(sessionId);
    if (t) {
      clearTimeout(t);
      this.timers.delete(sessionId);
    }
  }

  cancelAll() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}

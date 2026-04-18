import type {
  PulseAlertPayload,
  PulseAnomalyType,
  PulseSession,
} from '../../types/pulse';
import { PULSE_POLL_INTERVAL_MS } from '../../constants/pulseThresholds';
import { PulseSessionManager } from './PulseSessionManager';
import { PulseInactivityDetector } from './PulseInactivityDetector';
import { PulseRouteDeviationDetector } from './PulseRouteDeviationDetector';
import { PulseCheckInMonitor } from './PulseCheckInMonitor';
import { PulseEscalationService } from './PulseEscalationService';
import { PulseSafeZoneManager } from './PulseSafeZoneManager';

export interface PulseEngineDependencies {
  sendAlert: (payload: PulseAlertPayload) => Promise<void>;
  getUserName: () => string;
  onPromptUser: (session: PulseSession, anomaly: PulseAnomalyType) => void;
  onEscalated: (session: PulseSession, payload: PulseAlertPayload) => void;
  onDismissed: (session: PulseSession) => void;
  onStatusChange?: (session: PulseSession | null) => void;
}

/**
 * PulseEngine — orchestrator.
 *
 * Polls on an interval, runs detectors in priority order, and delegates
 * escalation. Detection logic lives in the individual detectors; this class
 * only coordinates. Designed so Phase 2 (Pulse Family) can swap in a
 * guardian-aware escalation service without touching detectors.
 */
export class PulseEngine {
  readonly sessions: PulseSessionManager;
  readonly inactivity: PulseInactivityDetector;
  readonly routeDeviation: PulseRouteDeviationDetector;
  readonly checkIn: PulseCheckInMonitor;
  readonly safeZones: PulseSafeZoneManager;
  readonly escalation: PulseEscalationService;

  private interval: ReturnType<typeof setInterval> | null = null;
  private promptedFor: PulseAnomalyType | null = null;

  constructor(private deps: PulseEngineDependencies) {
    this.sessions = new PulseSessionManager();
    this.inactivity = new PulseInactivityDetector();
    this.routeDeviation = new PulseRouteDeviationDetector();
    this.checkIn = new PulseCheckInMonitor();
    this.safeZones = new PulseSafeZoneManager();
    this.escalation = new PulseEscalationService({
      sendAlert: deps.sendAlert,
      getUserName: deps.getUserName,
      onPromptUser: (s, a) => {
        this.promptedFor = a;
        this.sessions.markPrompted();
        deps.onPromptUser(s, a);
      },
      onEscalated: (s, payload) => {
        this.promptedFor = null;
        this.sessions.setStatus('escalated');
        deps.onEscalated(s, payload);
      },
      onDismissed: (s) => {
        this.promptedFor = null;
        deps.onDismissed(s);
      },
    });

    if (deps.onStatusChange) {
      this.sessions.subscribe(deps.onStatusChange);
    }
  }

  start() {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), PULSE_POLL_INTERVAL_MS);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.escalation.cancelAll();
  }

  acknowledgePrompt() {
    const s = this.sessions.get();
    if (!s) return;
    this.escalation.acknowledge(s);
  }

  forceEscalate(anomaly: PulseAnomalyType = 'movement_anomaly') {
    const s = this.sessions.get();
    if (!s) return;
    void this.escalation.escalate(s, anomaly);
  }

  /**
   * Run detectors and decide whether to prompt.
   * Visible for tests; also called internally by the interval.
   */
  tick() {
    const session = this.sessions.get();
    if (!session) return;
    if (!session.pulseEnabled) return;
    if (session.status !== 'active') return;
    if (this.promptedFor) return; // already waiting on user

    // Safe zones suppress monitoring
    if (this.safeZones.isInside(session.lastKnownLocation)) {
      if (session.status === 'active') {
        // leave session active, just suppress — surfaced via safeZoneSuppressed()
      }
      return;
    }

    const inactivity = this.inactivity.evaluate(session);
    if (inactivity.triggered) {
      this.escalation.prompt(session, 'inactivity');
      return;
    }

    const route = this.routeDeviation.evaluate(session);
    if (route.triggered) {
      this.escalation.prompt(session, 'route_deviation');
      return;
    }

    const checkIn = this.checkIn.evaluate(session);
    if (checkIn.overrun) {
      this.escalation.prompt(session, 'session_overrun');
      return;
    }
    if (checkIn.triggered) {
      this.escalation.prompt(session, 'missed_check_in');
      return;
    }
  }

  safeZoneSuppressed(): boolean {
    const s = this.sessions.get();
    return !!s && this.safeZones.isInside(s.lastKnownLocation);
  }
}

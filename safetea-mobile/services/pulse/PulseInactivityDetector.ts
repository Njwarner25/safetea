import type { PulseSession } from '../../types/pulse';
import { PULSE_THRESHOLDS } from '../../constants/pulseThresholds';

export interface InactivityReading {
  triggered: boolean;
  secondsSinceMovement: number;
  thresholdSeconds: number;
}

export class PulseInactivityDetector {
  evaluate(session: PulseSession, now: Date = new Date()): InactivityReading {
    const threshold = PULSE_THRESHOLDS[session.sessionType].inactivitySeconds;
    const last = new Date(session.lastMovementAt).getTime();
    const seconds = Math.max(0, Math.floor((now.getTime() - last) / 1000));
    return {
      triggered: seconds >= threshold,
      secondsSinceMovement: seconds,
      thresholdSeconds: threshold,
    };
  }
}

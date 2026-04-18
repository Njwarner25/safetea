import type { PulseSession } from '../../types/pulse';
import { PULSE_THRESHOLDS } from '../../constants/pulseThresholds';

export interface CheckInReading {
  triggered: boolean;
  secondsSinceLastPrompt: number;
  intervalSeconds: number;
  overrun: boolean;
}

export class PulseCheckInMonitor {
  evaluate(session: PulseSession, now: Date = new Date()): CheckInReading {
    const cfg = PULSE_THRESHOLDS[session.sessionType];
    const started = new Date(session.startedAt).getTime();
    const expectedEnd = new Date(session.expectedEndAt).getTime();
    const lastPrompt = session.lastPromptAt
      ? new Date(session.lastPromptAt).getTime()
      : started;

    const secondsSincePrompt = Math.floor((now.getTime() - lastPrompt) / 1000);
    const overrunSeconds = Math.floor((now.getTime() - expectedEnd) / 1000);

    return {
      triggered: secondsSincePrompt >= cfg.checkInIntervalSeconds,
      secondsSinceLastPrompt: secondsSincePrompt,
      intervalSeconds: cfg.checkInIntervalSeconds,
      overrun: overrunSeconds >= cfg.sessionOverrunSeconds,
    };
  }
}

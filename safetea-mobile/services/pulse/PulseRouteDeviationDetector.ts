import type { PulseSession } from '../../types/pulse';
import { PULSE_THRESHOLDS } from '../../constants/pulseThresholds';
import { distanceMeters } from './geo';

export interface RouteDeviationReading {
  triggered: boolean;
  distanceFromDestinationMeters: number | null;
  thresholdMeters: number;
}

export class PulseRouteDeviationDetector {
  private history = new Map<string, number>();

  evaluate(session: PulseSession): RouteDeviationReading {
    const threshold = PULSE_THRESHOLDS[session.sessionType].routeDeviationMeters;
    const loc = session.lastKnownLocation;
    const dest = session.destination;
    if (!loc || !dest) {
      return {
        triggered: false,
        distanceFromDestinationMeters: null,
        thresholdMeters: threshold,
      };
    }
    const d = distanceMeters(loc, dest);
    const prev = this.history.get(session.sessionId);
    this.history.set(session.sessionId, d);

    // Trigger only if moving AWAY from destination past threshold
    const movingAway = prev !== undefined && d > prev + 20;
    return {
      triggered: movingAway && d > threshold,
      distanceFromDestinationMeters: d,
      thresholdMeters: threshold,
    };
  }

  reset(sessionId: string) {
    this.history.delete(sessionId);
  }
}

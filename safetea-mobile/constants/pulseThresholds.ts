import type { PulseSessionType } from '../types/pulse';

export interface PulseThresholds {
  inactivitySeconds: number;
  routeDeviationMeters: number;
  checkInIntervalSeconds: number;
  sessionOverrunSeconds: number;
  escalationWaitSeconds: number;
}

export const PULSE_THRESHOLDS: Record<PulseSessionType, PulseThresholds> = {
  walking: {
    inactivitySeconds: 8 * 60,
    routeDeviationMeters: 250,
    checkInIntervalSeconds: 15 * 60,
    sessionOverrunSeconds: 20 * 60,
    escalationWaitSeconds: 45,
  },
  jogging: {
    inactivitySeconds: 3 * 60,
    routeDeviationMeters: 400,
    checkInIntervalSeconds: 10 * 60,
    sessionOverrunSeconds: 15 * 60,
    escalationWaitSeconds: 45,
  },
  date: {
    inactivitySeconds: 45 * 60,
    routeDeviationMeters: 600,
    checkInIntervalSeconds: 30 * 60,
    sessionOverrunSeconds: 60 * 60,
    escalationWaitSeconds: 60,
  },
  ride: {
    inactivitySeconds: 12 * 60,
    routeDeviationMeters: 500,
    checkInIntervalSeconds: 20 * 60,
    sessionOverrunSeconds: 25 * 60,
    escalationWaitSeconds: 45,
  },
  meetup: {
    inactivitySeconds: 20 * 60,
    routeDeviationMeters: 400,
    checkInIntervalSeconds: 20 * 60,
    sessionOverrunSeconds: 45 * 60,
    escalationWaitSeconds: 60,
  },
  custom: {
    inactivitySeconds: 10 * 60,
    routeDeviationMeters: 400,
    checkInIntervalSeconds: 15 * 60,
    sessionOverrunSeconds: 30 * 60,
    escalationWaitSeconds: 45,
  },
};

export const PULSE_POLL_INTERVAL_MS = 15 * 1000;

export const PULSE_DEFAULT_ENABLED = true;

export type PulseSessionType =
  | 'walking'
  | 'jogging'
  | 'date'
  | 'ride'
  | 'meetup'
  | 'custom';

export type PulseSessionStatus =
  | 'active'
  | 'paused'
  | 'ended'
  | 'escalated';

export type PulseAnomalyType =
  | 'inactivity'
  | 'route_deviation'
  | 'missed_check_in'
  | 'session_overrun'
  | 'movement_anomaly';

export type PulseEscalationStatus =
  | 'idle'
  | 'prompting'
  | 'escalated'
  | 'dismissed';

export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  recordedAt: string;
}

export interface PulseSafeZone {
  id: string;
  label: string;
  center: { latitude: number; longitude: number };
  radiusMeters: number;
  kind?: 'home' | 'work' | 'other';
}

export interface PulseSession {
  sessionId: string;
  userId: string;
  sessionType: PulseSessionType;
  startedAt: string;
  expectedEndAt: string;
  destination?: { latitude: number; longitude: number; label?: string };
  trustedContactId: string;
  status: PulseSessionStatus;
  lastMovementAt: string;
  lastKnownLocation?: GeoPoint;
  lastPromptAt?: string;
  anomalyType?: PulseAnomalyType;
  escalationStatus: PulseEscalationStatus;
  pulseEnabled: boolean;
}

export interface PulseAlertPayload {
  userName: string;
  userId: string;
  sessionId: string;
  timestamp: string;
  anomalyType: PulseAnomalyType;
  currentLocation?: GeoPoint;
  lastMovementAt: string;
  routeSummary?: {
    distanceFromDestinationMeters?: number;
    deviationMeters?: number;
    durationSeconds?: number;
  };
}

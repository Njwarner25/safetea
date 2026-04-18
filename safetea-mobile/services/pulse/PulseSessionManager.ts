import type {
  GeoPoint,
  PulseSession,
  PulseSessionStatus,
} from '../../types/pulse';

/**
 * Holds the current session in memory. Persistence is delegated to a callback
 * (wired to the API stub in services/api.ts). Keeping storage external keeps
 * this class testable and ready for Phase 2 (Pulse Family) where sessions
 * may sync to a guardian device.
 */
export class PulseSessionManager {
  private current: PulseSession | null = null;
  private listeners = new Set<(s: PulseSession | null) => void>();

  get(): PulseSession | null {
    return this.current;
  }

  start(session: PulseSession) {
    this.current = session;
    this.emit();
  }

  end() {
    if (!this.current) return;
    this.current = { ...this.current, status: 'ended' };
    this.emit();
    this.current = null;
    this.emit();
  }

  setStatus(status: PulseSessionStatus) {
    if (!this.current) return;
    this.current = { ...this.current, status };
    this.emit();
  }

  markMovement(point: GeoPoint) {
    if (!this.current) return;
    this.current = {
      ...this.current,
      lastKnownLocation: point,
      lastMovementAt: point.recordedAt,
    };
    this.emit();
  }

  markPrompted(at: string = new Date().toISOString()) {
    if (!this.current) return;
    this.current = { ...this.current, lastPromptAt: at };
    this.emit();
  }

  subscribe(listener: (s: PulseSession | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l(this.current);
  }
}

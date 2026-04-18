import type { GeoPoint, PulseSafeZone } from '../../types/pulse';
import { distanceMeters } from './geo';

export class PulseSafeZoneManager {
  private zones: PulseSafeZone[] = [];

  setZones(zones: PulseSafeZone[]) {
    this.zones = zones;
  }

  addZone(zone: PulseSafeZone) {
    this.zones = [...this.zones.filter((z) => z.id !== zone.id), zone];
  }

  removeZone(id: string) {
    this.zones = this.zones.filter((z) => z.id !== id);
  }

  list(): PulseSafeZone[] {
    return this.zones;
  }

  zoneContaining(point: GeoPoint | undefined): PulseSafeZone | null {
    if (!point) return null;
    for (const zone of this.zones) {
      const d = distanceMeters(point, zone.center);
      if (d <= zone.radiusMeters) return zone;
    }
    return null;
  }

  isInside(point: GeoPoint | undefined): boolean {
    return this.zoneContaining(point) !== null;
  }
}

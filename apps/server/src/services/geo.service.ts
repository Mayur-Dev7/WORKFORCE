import { haversineDistanceMeters } from '../lib/geo/haversine.js';
import { GeofenceValidationResult, ErrorCode } from '@workforce/shared';

export class GeoService {
  private maxAccuracyMeters: number;

  constructor() {
    this.maxAccuracyMeters = process.env.LOCATION_MAX_ACCURACY_METERS
      ? parseFloat(process.env.LOCATION_MAX_ACCURACY_METERS)
      : 100;
  }

  validateAccuracy(accuracy: number): { valid: boolean; error?: ErrorCode; message?: string } {
    if (isNaN(accuracy) || accuracy < 0) {
      return {
        valid: false,
        error: ErrorCode.LOCATION_UNAVAILABLE,
        message: 'Invalid GPS accuracy reported by device',
      };
    }

    if (accuracy > this.maxAccuracyMeters) {
      return {
        valid: false,
        error: ErrorCode.LOCATION_ACCURACY_LOW,
        message: `GPS accuracy (+/- ${Math.round(accuracy)}m) exceeds maximum allowable threshold (${this.maxAccuracyMeters}m). Please move near a window or outdoors.`,
      };
    }

    return { valid: true };
  }

  validateCoordinates(lat: number, lon: number): boolean {
    return (
      typeof lat === 'number' &&
      typeof lon === 'number' &&
      !isNaN(lat) &&
      !isNaN(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
    );
  }

  calculateGeofence(
    userLat: number,
    userLon: number,
    officeLat: number,
    officeLon: number,
    radiusMeters: number
  ): GeofenceValidationResult {
    const distanceMeters = Math.round(
      haversineDistanceMeters(userLat, userLon, officeLat, officeLon)
    );

    return {
      distanceMeters,
      allowedRadiusMeters: radiusMeters,
      insideGeofence: distanceMeters <= radiusMeters,
    };
  }
}

export const geoService = new GeoService();

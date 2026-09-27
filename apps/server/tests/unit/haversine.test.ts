import { describe, it, expect } from 'vitest';
import { haversineDistanceMeters } from '../../src/lib/geo/haversine.js';
import { geoService } from '../../src/services/geo.service.js';
import { ErrorCode } from '@workforce/shared';

describe('Geo & Haversine Distance Unit Tests', () => {
  // San Francisco HQ: 37.774929, -122.419416
  const officeLat = 37.774929;
  const officeLon = -122.419416;

  it('calculates zero distance for identical coordinates', () => {
    const dist = haversineDistanceMeters(officeLat, officeLon, officeLat, officeLon);
    expect(dist).toBeCloseTo(0, 1);
  });

  it('validates a point located within office radius (50m away)', () => {
    // Offset slightly (~45 meters north: 0.0004 deg lat ~ 44.4m)
    const userLat = officeLat + 0.0003;
    const userLon = officeLon;

    const res = geoService.calculateGeofence(userLat, userLon, officeLat, officeLon, 150);
    expect(res.insideGeofence).toBe(true);
    expect(res.distanceMeters).toBeLessThan(150);
  });

  it('validates a point located outside office radius (500m away)', () => {
    // 0.005 degrees latitude is ~555 meters
    const userLat = officeLat + 0.005;
    const userLon = officeLon;

    const res = geoService.calculateGeofence(userLat, userLon, officeLat, officeLon, 150);
    expect(res.insideGeofence).toBe(false);
    expect(res.distanceMeters).toBeGreaterThan(150);
  });

  it('validates coordinate boundary values', () => {
    expect(geoService.validateCoordinates(90, 180)).toBe(true);
    expect(geoService.validateCoordinates(-90, -180)).toBe(true);
    expect(geoService.validateCoordinates(91, 0)).toBe(false);
    expect(geoService.validateCoordinates(0, 181)).toBe(false);
    expect(geoService.validateCoordinates(NaN, 0)).toBe(false);
  });

  it('rejects low GPS accuracy above configured maximum threshold', () => {
    const accuracyCheck1 = geoService.validateAccuracy(20);
    expect(accuracyCheck1.valid).toBe(true);

    const accuracyCheck2 = geoService.validateAccuracy(250);
    expect(accuracyCheck2.valid).toBe(false);
    expect(accuracyCheck2.error).toBe(ErrorCode.LOCATION_ACCURACY_LOW);
  });

  it('rejects negative or NaN GPS accuracy', () => {
    const accuracyCheck = geoService.validateAccuracy(-5);
    expect(accuracyCheck.valid).toBe(false);
    expect(accuracyCheck.error).toBe(ErrorCode.LOCATION_UNAVAILABLE);
  });
});

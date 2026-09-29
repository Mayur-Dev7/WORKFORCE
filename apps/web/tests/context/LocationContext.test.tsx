import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LocationProvider,
  useLocationWarmup,
  calculateDistanceMeters,
} from '../../src/context/LocationContext.js';
import * as AuthContextModule from '../../src/context/AuthContext.js';
import { api } from '../../src/services/api.js';

describe('LocationWarmup & Fast Geofence Verification Tests', () => {
  const mockUser: any = {
    id: 'emp-101-uuid',
    name: 'Alex Mercer',
    employee_code: 'EMP-101',
    office_id: 'office-sf-uuid',
    office_name: 'Tech Park HQ (San Francisco)',
    face_enrolled: true,
  };

  const mockOffice: any = {
    id: 'office-sf-uuid',
    name: 'Tech Park HQ (San Francisco)',
    latitude: 37.774929,
    longitude: -122.419416,
    radius_meters: 150,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(navigator, 'geolocation', {
      writable: true,
      value: {
        getCurrentPosition: vi.fn().mockImplementation((success: any) => {
          success({
            coords: {
              latitude: 37.774929,
              longitude: -122.419416,
              accuracy: 15,
            },
          });
        }),
        watchPosition: vi.fn().mockImplementation((success: any) => {
          success({
            coords: {
              latitude: 37.774929,
              longitude: -122.419416,
              accuracy: 15,
            },
          });
          return 1;
        }),
        clearWatch: vi.fn(),
      },
    });

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasPermission: vi.fn().mockReturnValue(true),
      hasAnyPermission: vi.fn().mockReturnValue(true),
    });

    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url.includes('/offices/')) {
        return Promise.resolve({
          data: {
            success: true,
            data: mockOffice,
          },
        });
      }
      if (url.includes('/users/self/face-template')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              referenceImage: 'data:image/jpeg;base64,mockface',
              embedding: new Array(128).fill(0.1),
            },
          },
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
  });

  describe('calculateDistanceMeters Haversine utility', () => {
    it('returns 0 for identical coordinates', () => {
      const dist = calculateDistanceMeters(37.774929, -122.419416, 37.774929, -122.419416);
      expect(dist).toBe(0);
    });

    it('calculates approximately correct distance between known points', () => {
      // Point A to Point B (~111 km per 1 degree of latitude)
      const dist = calculateDistanceMeters(37.0, -122.0, 38.0, -122.0);
      expect(dist).toBeGreaterThan(110000);
      expect(dist).toBeLessThan(112000);
    });
  });

  describe('useLocationWarmup hook and LocationProvider', () => {
    it('degrades safely with defaults when used outside LocationProvider', () => {
      const { result } = renderHook(() => useLocationWarmup());
      expect(result.current.initialSnapshot).toBeNull();
      expect(result.current.cachedOffice).toBeNull();
      expect(result.current.isWarm).toBe(false);
    });

    it('silently captures initial snapshot and pre-caches office and face template on mount', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LocationProvider>{children}</LocationProvider>
      );

      const { result } = renderHook(() => useLocationWarmup(), { wrapper });

      await waitFor(() => {
        expect(result.current.isWarm).toBe(true);
      });

      expect(result.current.cachedOffice?.name).toBe('Tech Park HQ (San Francisco)');
      expect(result.current.cachedFaceTemplate?.referenceImage).toBeTruthy();
      expect(result.current.initialSnapshot).not.toBeNull();
      expect(result.current.initialSnapshot?.insideGeofence).toBe(true);
      expect(result.current.initialSnapshot?.distanceMeters).toBe(0);
    });

    it('returns instant_match in <50ms when fresh position is similar to app launch snapshot', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LocationProvider>{children}</LocationProvider>
      );

      const { result } = renderHook(() => useLocationWarmup(), { wrapper });

      await waitFor(() => {
        expect(result.current.isWarm).toBe(true);
      });

      // User triggers check-in
      let verification: any;
      await act(async () => {
        verification = await result.current.getFastVerifiedLocation();
      });

      expect(verification).toBeDefined();
      expect(verification.isSimilar).toBe(true);
      expect(verification.insideGeofence).toBe(true);
      expect(verification.matchType).toBe('instant_match');
      expect(verification.driftMeters).toBeLessThanOrEqual(50);
    });

    it('recalculates geofence when location differs (> 50m drift)', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LocationProvider>{children}</LocationProvider>
      );

      const { result } = renderHook(() => useLocationWarmup(), { wrapper });

      await waitFor(() => {
        expect(result.current.isWarm).toBe(true);
      });

      // Simulate GPS moving 100 meters away from initial snapshot but still within office radius (150m)
      vi.spyOn(navigator.geolocation, 'getCurrentPosition').mockImplementation((success: any) => {
        success({
          coords: {
            latitude: 37.7756, // ~75m away
            longitude: -122.419416,
            accuracy: 10,
          },
        });
      });

      let verification: any;
      await act(async () => {
        verification = await result.current.getFastVerifiedLocation(true);
      });

      expect(verification).toBeDefined();
      expect(verification.isSimilar).toBe(false); // drift > 50m
      expect(verification.insideGeofence).toBe(true); // still within 150m radius
      expect(verification.matchType).toBe('fresh_geofence_match');
    });

    it('correctly marks user as outside geofence when fresh location is beyond office radius', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <LocationProvider>{children}</LocationProvider>
      );

      const { result } = renderHook(() => useLocationWarmup(), { wrapper });

      await waitFor(() => {
        expect(result.current.isWarm).toBe(true);
      });

      // Simulate GPS moving far away (500 meters)
      vi.spyOn(navigator.geolocation, 'getCurrentPosition').mockImplementation((success: any) => {
        success({
          coords: {
            latitude: 37.7800, // ~560m away
            longitude: -122.419416,
            accuracy: 10,
          },
        });
      });

      let verification: any;
      await act(async () => {
        verification = await result.current.getFastVerifiedLocation(true);
      });

      expect(verification).toBeDefined();
      expect(verification.insideGeofence).toBe(false);
      expect(verification.matchType).toBe('outside_geofence');
      expect(verification.distanceMeters).toBeGreaterThan(150);
    });
  });
});

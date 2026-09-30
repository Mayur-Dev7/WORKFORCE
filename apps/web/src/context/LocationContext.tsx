import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Office, ApiResponse } from '@workforce/shared';
import { useAuth } from './AuthContext.js';
import { api } from '../services/api.js';

export interface UserCoordinates {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp?: number;
}

export interface LocationSnapshot {
  coords: UserCoordinates;
  timestamp: number;
  distanceMeters: number | null;
  insideGeofence: boolean | null;
}

export interface FaceTemplateCache {
  referenceImage: string | null;
  embedding: number[] | null;
}

export interface VerificationResult {
  coords: UserCoordinates;
  isSimilar: boolean;
  insideGeofence: boolean;
  distanceMeters: number;
  matchType: 'instant_match' | 'fresh_geofence_match' | 'outside_geofence';
  driftMeters: number;
  office: Office | null;
  latencyMs: number;
}

export interface LocationContextType {
  initialSnapshot: LocationSnapshot | null;
  cachedOffice: Office | null;
  cachedFaceTemplate: FaceTemplateCache | null;
  latestCoords: UserCoordinates | null;
  isWarm: boolean;
  getFastVerifiedLocation: (forceFresh?: boolean) => Promise<VerificationResult>;
  refreshWarmup: () => Promise<void>;
  forceRefreshOffice: (specificOfficeId?: string) => Promise<Office | null>;
}

export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Broadcasts an office update event across tabs and to the current window
 */
export function broadcastOfficeUpdate() {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('workforce:office_updated'));
    }
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('workforce_office_channel');
      channel.postMessage('office_updated');
      channel.close();
    }
  } catch {
    // Ignore cross-origin / unsupported environments
  }
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

// Maximum allowable GPS drift (in meters) between app launch snapshot and check-in to consider locations identical
const DRIFT_THRESHOLD_METERS = 50;

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, refreshUser } = useAuth();

  const [initialSnapshot, setInitialSnapshot] = useState<LocationSnapshot | null>(null);
  const [cachedOffice, setCachedOffice] = useState<Office | null>(null);
  const [cachedFaceTemplate, setCachedFaceTemplate] = useState<FaceTemplateCache | null>(null);
  const [latestCoords, setLatestCoords] = useState<UserCoordinates | null>(null);
  const [isWarm, setIsWarm] = useState(false);

  // Keep refs for immediate synchronous access inside callbacks
  const initialSnapshotRef = useRef<LocationSnapshot | null>(null);
  const cachedOfficeRef = useRef<Office | null>(null);
  const latestCoordsRef = useRef<UserCoordinates | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Sync refs with states
  useEffect(() => {
    initialSnapshotRef.current = initialSnapshot;
  }, [initialSnapshot]);

  useEffect(() => {
    cachedOfficeRef.current = cachedOffice;
  }, [cachedOffice]);

  useEffect(() => {
    latestCoordsRef.current = latestCoords;
  }, [latestCoords]);

  /**
   * Explicitly fetches and updates the assigned office (bypassing stale cache).
   * Useful when an admin edits an office, deletes an office, or applies an office to all staff.
   */
  const forceRefreshOffice = useCallback(
    async (specificOfficeId?: string): Promise<Office | null> => {
      const targetId = specificOfficeId || user?.office_id;
      if (!targetId) {
        setCachedOffice(null);
        cachedOfficeRef.current = null;
        return null;
      }

      try {
        const res = await api.get<ApiResponse<Office>>(`/offices/${targetId}`);
        const freshOffice = res.data?.data || null;

        if (freshOffice) {
          setCachedOffice(freshOffice);
          cachedOfficeRef.current = freshOffice;

          // Re-evaluate initial snapshot distance if we have coordinates
          const coords = latestCoordsRef.current || initialSnapshotRef.current?.coords;
          if (coords) {
            const dist = calculateDistanceMeters(
              coords.lat,
              coords.lon,
              freshOffice.latitude,
              freshOffice.longitude
            );
            const inside = dist <= freshOffice.radius_meters;

            const updatedSnapshot: LocationSnapshot = {
              coords,
              timestamp: Date.now(),
              distanceMeters: dist,
              insideGeofence: inside,
            };
            setInitialSnapshot(updatedSnapshot);
            initialSnapshotRef.current = updatedSnapshot;
          }
        }
        return freshOffice;
      } catch (err) {
        console.debug('[LocationWarmup] Could not refresh office:', err);
        return null;
      }
    },
    [user?.office_id]
  );

  // Background silent warmup routine
  const startBackgroundWarmup = useCallback(async () => {
    if (!isAuthenticated || !user) return;

    let targetOffice = cachedOfficeRef.current;

    // 1. If assigned office is missing or does not match user's current office_id, fetch fresh!
    if (user.office_id) {
      if (!targetOffice || targetOffice.id !== user.office_id) {
        try {
          const res = await api.get<ApiResponse<Office>>(`/offices/${user.office_id}`);
          if (res.data?.data) {
            targetOffice = res.data.data;
            setCachedOffice(targetOffice);
            cachedOfficeRef.current = targetOffice;
          }
        } catch (e) {
          console.debug('[LocationWarmup] Could not pre-fetch office', e);
        }
      } else {
        // Silently revalidate in background to capture coordinate/radius edits
        api.get<ApiResponse<Office>>(`/offices/${user.office_id}`)
          .then((res) => {
            if (res.data?.data) {
              const fresh = res.data.data;
              if (
                fresh.latitude !== targetOffice?.latitude ||
                fresh.longitude !== targetOffice?.longitude ||
                fresh.radius_meters !== targetOffice?.radius_meters ||
                fresh.name !== targetOffice?.name
              ) {
                setCachedOffice(fresh);
                cachedOfficeRef.current = fresh;
              }
            }
          })
          .catch(() => {});
      }
    } else {
      setCachedOffice(null);
      cachedOfficeRef.current = null;
    }

    // 2. Silently pre-fetch reference face template in background
    if (!cachedFaceTemplate) {
      try {
        const faceRes = await api.get('/users/self/face-template');
        if (faceRes.data?.data) {
          setCachedFaceTemplate({
            referenceImage: faceRes.data.data.referenceImage || null,
            embedding: Array.isArray(faceRes.data.data.embedding) ? faceRes.data.data.embedding : null,
          });
        }
      } catch (e) {
        console.debug('[LocationWarmup] Face template pre-fetch omitted', e);
      }
    }

    // 3. Silently obtain initial GPS position in memory (do not show to user)
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: UserCoordinates = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: Date.now(),
          };

          setLatestCoords(coords);
          latestCoordsRef.current = coords;

          let dist: number | null = null;
          let inside: boolean | null = null;

          const currentTarget = cachedOfficeRef.current || targetOffice;
          if (currentTarget) {
            dist = calculateDistanceMeters(
              coords.lat,
              coords.lon,
              currentTarget.latitude,
              currentTarget.longitude
            );
            inside = dist <= currentTarget.radius_meters;
          }

          const snapshot: LocationSnapshot = {
            coords,
            timestamp: Date.now(),
            distanceMeters: dist,
            insideGeofence: inside,
          };

          setInitialSnapshot(snapshot);
          initialSnapshotRef.current = snapshot;
          setIsWarm(true);
        },
        (err) => {
          console.debug('[LocationWarmup] Silent initial GPS capture deferred:', err.message);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );

      // 4. Start passive watchPosition to keep hardware GPS chip awake and responsive
      if (watchIdRef.current === null) {
        try {
          const id = navigator.geolocation.watchPosition(
            (pos) => {
              const coords: UserCoordinates = {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                timestamp: Date.now(),
              };
              setLatestCoords(coords);
              latestCoordsRef.current = coords;
            },
            () => {
              // Ignore passive watch errors
            },
            { enableHighAccuracy: true, maximumAge: 20000, timeout: 10000 }
          );
          watchIdRef.current = id;
        } catch {
          // Ignore
        }
      }
    }
  }, [isAuthenticated, user?.office_id, user?.id, cachedFaceTemplate]);

  // Invalidate and re-fetch if user's assigned office changes
  useEffect(() => {
    if (user?.office_id && cachedOfficeRef.current && cachedOfficeRef.current.id !== user.office_id) {
      setCachedOffice(null);
      cachedOfficeRef.current = null;
      setInitialSnapshot(null);
      initialSnapshotRef.current = null;
      forceRefreshOffice(user.office_id);
    }
  }, [user?.office_id, forceRefreshOffice]);

  // Listen for broadcasted office updates across tabs & components
  useEffect(() => {
    const handleOfficeUpdated = async () => {
      await refreshUser();
      await forceRefreshOffice();
    };

    window.addEventListener('workforce:office_updated', handleOfficeUpdated);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel('workforce_office_channel');
        channel.onmessage = (event) => {
          if (event.data === 'office_updated') {
            handleOfficeUpdated();
          }
        };
      } catch {
        // Ignore BroadcastChannel errors
      }
    }

    return () => {
      window.removeEventListener('workforce:office_updated', handleOfficeUpdated);
      if (channel) {
        channel.close();
      }
    };
  }, [refreshUser, forceRefreshOffice]);

  // Trigger warmup when authenticated or clean up when logged out
  useEffect(() => {
    if (isAuthenticated && user) {
      startBackgroundWarmup();
    } else {
      // Clear watch and all cached states when logged out
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setCachedOffice(null);
      cachedOfficeRef.current = null;
      setCachedFaceTemplate(null);
      setInitialSnapshot(null);
      initialSnapshotRef.current = null;
      setLatestCoords(null);
      latestCoordsRef.current = null;
      setIsWarm(false);
    }

    return () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isAuthenticated, user?.id, user?.office_id, startBackgroundWarmup]);

  /**
   * Fast location verification for Check-In / Check-Out:
   * 1. Ensure the office coordinates match the user's latest office_id.
   * 2. Re-acquire current location.
   * 3. Compare against initial snapshot taken when site/app opened.
   * 4. If similar (<= 50m drift) and initial was in office => INSTANT MATCH to face check (<50ms).
   * 5. If different => recalculate geofence with fresh location.
   */
  const getFastVerifiedLocation = useCallback(
    async (forceFresh = false): Promise<VerificationResult> => {
      const startTime = performance.now();

      // Ensure office is available and matches user.office_id
      let office = cachedOfficeRef.current;
      if ((!office || (user?.office_id && office.id !== user.office_id)) && user?.office_id) {
        try {
          const res = await api.get<ApiResponse<Office>>(`/offices/${user.office_id}`);
          office = res.data.data;
          setCachedOffice(office);
          cachedOfficeRef.current = office;
        } catch (e: any) {
          throw new Error('Unable to retrieve assigned office details.');
        }
      }

      if (!office) {
        throw new Error('No assigned office found for your account.');
      }

      // Helper to fetch fresh GPS coordinates
      const fetchFreshPosition = (): Promise<UserCoordinates> => {
        return new Promise((resolve, reject) => {
          if (!('geolocation' in navigator)) {
            return reject(new Error('Geolocation is not supported by your browser.'));
          }

          // If we have a very recent location from active watcher (< 15 seconds old) and not forced, reuse immediately
          const cached = latestCoordsRef.current;
          if (!forceFresh && cached && cached.timestamp && Date.now() - cached.timestamp < 15000) {
            return resolve(cached);
          }

          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const fresh: UserCoordinates = {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                timestamp: Date.now(),
              };
              setLatestCoords(fresh);
              latestCoordsRef.current = fresh;
              resolve(fresh);
            },
            (err) => {
              // Fallback to latestCoordsRef if available
              if (latestCoordsRef.current) {
                return resolve(latestCoordsRef.current);
              }
              reject(err);
            },
            {
              enableHighAccuracy: true,
              timeout: 4000,
              maximumAge: 15000, // Accepts cached hardware lock up to 15s old for instant fix
            }
          );
        });
      };

      const freshCoords = await fetchFreshPosition();
      const initial = initialSnapshotRef.current;

      // Calculate distance between initial snapshot and fresh coords
      let driftMeters = 0;
      let isSimilar = false;

      if (initial?.coords) {
        driftMeters = calculateDistanceMeters(
          initial.coords.lat,
          initial.coords.lon,
          freshCoords.lat,
          freshCoords.lon
        );
        isSimilar = driftMeters <= DRIFT_THRESHOLD_METERS;
      }

      const latencyMs = Math.round(performance.now() - startTime);

      // Scenario A: Both are similar AND initial snapshot was confirmed inside office geofence AND matches this office
      if (isSimilar && initial && initial.insideGeofence === true && initial.distanceMeters !== null) {
        // Ensure distance is against the correct office
        const freshDistance = calculateDistanceMeters(
          freshCoords.lat,
          freshCoords.lon,
          office.latitude,
          office.longitude
        );

        if (freshDistance <= office.radius_meters) {
          return {
            coords: freshCoords,
            isSimilar: true,
            insideGeofence: true,
            distanceMeters: freshDistance,
            matchType: 'instant_match',
            driftMeters,
            office,
            latencyMs,
          };
        }
      }

      // Scenario B: Locations are different OR initial was outside office => recalculate with fresh location
      const freshDistance = calculateDistanceMeters(
        freshCoords.lat,
        freshCoords.lon,
        office.latitude,
        office.longitude
      );
      const isInside = freshDistance <= office.radius_meters;

      return {
        coords: freshCoords,
        isSimilar,
        insideGeofence: isInside,
        distanceMeters: freshDistance,
        matchType: isInside ? 'fresh_geofence_match' : 'outside_geofence',
        driftMeters,
        office,
        latencyMs,
      };
    },
    [user?.office_id]
  );

  return (
    <LocationContext.Provider
      value={{
        initialSnapshot,
        cachedOffice,
        cachedFaceTemplate,
        latestCoords,
        isWarm,
        getFastVerifiedLocation,
        refreshWarmup: startBackgroundWarmup,
        forceRefreshOffice,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useLocationWarmup = (): LocationContextType => {
  const context = useContext(LocationContext);
  if (!context) {
    return {
      initialSnapshot: null,
      cachedOffice: null,
      cachedFaceTemplate: null,
      latestCoords: null,
      isWarm: false,
      getFastVerifiedLocation: async () => {
        throw new Error('LocationProvider not mounted');
      },
      refreshWarmup: async () => {},
      forceRefreshOffice: async () => null,
    };
  }
  return context;
};

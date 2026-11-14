import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoLocation } from '../types';

export type GeolocationErrorCode = 'unsupported' | 'denied' | 'timeout' | 'unavailable';

export interface UseGeolocationResult {
  location: GeoLocation | null;
  loading: boolean;
  error: GeolocationErrorCode | null;
  getCurrentLocation: () => Promise<GeoLocation | null>;
  clearError: () => void;
}

export function useGeolocation(options?: PositionOptions): UseGeolocationResult {
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<GeolocationErrorCode | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const getCurrentLocation = useCallback((): Promise<GeoLocation | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (mountedRef.current) {
        setError('unsupported');
        setLoading(false);
      }
      return Promise.resolve(null);
    }

    if (mountedRef.current) {
      setError(null);
      setLoading(true);
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: GeoLocation = {
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
          };
          if (mountedRef.current) {
            setLocation(coords);
            setError(null);
            setLoading(false);
          }
          resolve(coords);
        },
        (err) => {
          let code: GeolocationErrorCode = 'unavailable';
          if (err.code === err.PERMISSION_DENIED) {
            code = 'denied';
          } else if (err.code === err.TIMEOUT) {
            code = 'timeout';
          }
          if (mountedRef.current) {
            setError(code);
            setLoading(false);
          }
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 60000,
          ...options,
        },
      );
    });
  }, [options]);

  return {
    location,
    loading,
    error,
    getCurrentLocation,
    clearError,
  };
}

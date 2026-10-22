import * as Location from 'expo-location';
import { updateDriverLocation } from './delivery';
import { supabase } from './supabase';

export const LOCATION_TASK_NAME = 'background-location-task';

/**
 * Location service — FOREGROUND & BACKGROUND
 * Usa TaskManager para soportar seguimiento en segundo plano.
 *
 * GPS intervals are fetched from the `app_settings` table in Supabase,
 * configurable from the SuperAdmin dashboard without app rebuild.
 */

let activeOrderId: string | null = null;
let watchSubscription: Location.LocationSubscription | null = null;

// Cached GPS settings (fetched once per tracking session)
let gpsDistanceInterval = 0; // meters — 0 = every update (testing)
let gpsTimeInterval = 10_000; // ms — 10 seconds default

export const setActiveOrderId = (orderId: string | null) => {
  activeOrderId = orderId;
};

/**
 * Fetch GPS tracking settings from Supabase app_settings table.
 * Falls back to defaults if the table/settings don't exist yet.
 */
const fetchGpsSettings = async (): Promise<void> => {
  try {
    const { data: distData } = await supabase
      .from('app_settings')
      .select('value')
      .eq('setting_key', 'gps_distance_interval_m')
      .single();

    if (distData?.value != null) {
      gpsDistanceInterval = Number(distData.value) || 0;
    }

    const { data: timeData } = await supabase
      .from('app_settings')
      .select('value')
      .eq('setting_key', 'gps_time_interval_ms')
      .single();

    if (timeData?.value != null) {
      gpsTimeInterval = Number(timeData.value) || 10_000;
    }

    console.log(`[LocationService] GPS settings: distance=${gpsDistanceInterval}m, time=${gpsTimeInterval}ms`);
  } catch (err) {
    console.warn('[LocationService] Could not fetch GPS settings, using defaults:', err);
  }
};

/**
 * Request foreground AND background location permissions.
 */
export const requestLocationPermissions = async (): Promise<boolean> => {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;

    try {
      await Location.requestBackgroundPermissionsAsync();
    } catch (e) {
      console.warn('Background permissions prompt failed', e);
    }
    return true; // As long as we have foreground, return true
  } catch (err) {
    console.warn('Error requesting permissions:', err);
    return false;
  }
};

/**
 * Start foreground and background location tracking.
 * Reads GPS settings from app_settings before starting.
 * Sends driver position to Supabase based on configured intervals.
 */
export const startBackgroundTracking = async (): Promise<void> => {
  await stopTracking().catch(() => {});

  // Fetch latest GPS config from SuperAdmin dashboard
  await fetchGpsSettings();

  try {
    // 1. Foreground Watch (for real-time updates while app is open)
    watchSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: gpsTimeInterval,
        distanceInterval: gpsDistanceInterval,
      },
      (location) => {
        console.log('[LocationService] Watch position update:', location.coords.latitude, location.coords.longitude);
        updateDriverLocation({
          orderId: activeOrderId,
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          accuracy_m: location.coords.accuracy,
          heading: location.coords.heading,
          speed_mps: location.coords.speed,
        }).catch((e) => console.warn('updateDriverLocation error:', e));
      },
    );

    // 2. Background Watch (for updates while app is in background, e.g. Waze is open)
    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: gpsTimeInterval,
        distanceInterval: gpsDistanceInterval,
        foregroundService: {
          notificationTitle: 'Pide Ya - Entrega activa',
          notificationBody: 'Compartiendo ubicación con el cliente.',
          notificationColor: '#2D8B7A',
        },
      });
    } catch (e) {
      console.warn('Error starting background updates (likely missing "Always" permission):', e);
    }
  } catch (err) {
    console.warn('Error starting location tracking:', err);
  }
};

/**
 * Stop location tracking (foreground & background).
 */
export const stopTracking = async (): Promise<void> => {
  try {
    if (watchSubscription) {
      watchSubscription.remove();
      watchSubscription = null;
    }
    const hasTask = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (hasTask) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch {}
  setActiveOrderId(null);
};

/**
 * Get current location once.
 */
export const getCurrentLocation =
  async (): Promise<Location.LocationObject> => {
    return Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
  };

// Aliases
export const startForegroundTracking = startBackgroundTracking;
export const stopBackgroundTracking = stopTracking;


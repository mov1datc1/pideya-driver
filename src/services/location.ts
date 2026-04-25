import * as Location from 'expo-location';
import { updateDriverLocation } from './delivery';

/**
 * Location service — FOREGROUND ONLY
 * No TaskManager, no background tracking, no foreground service.
 * Maximally compatible with all Android devices including Go Edition.
 */

let activeOrderId: string | null = null;
let watchSubscription: Location.LocationSubscription | null = null;

export const setActiveOrderId = (orderId: string | null) => {
  activeOrderId = orderId;
};

/**
 * Request ONLY foreground location permission.
 * Never requests background — causes native crashes on some devices.
 */
export const requestLocationPermissions = async (): Promise<boolean> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
};

/**
 * Start foreground-only location watch.
 * Sends driver position to Supabase every ~10 seconds.
 */
export const startForegroundTracking = async (): Promise<void> => {
  await stopTracking().catch(() => {});

  try {
    watchSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10_000,
        distanceInterval: 20,
      },
      (location) => {
        updateDriverLocation({
          orderId: activeOrderId,
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          accuracy_m: location.coords.accuracy,
          heading: location.coords.heading,
          speed_mps: location.coords.speed,
        }).catch(() => {});
      },
    );
  } catch {
    // Silent fail — GPS not available
  }
};

/**
 * Stop location tracking.
 */
export const stopTracking = async (): Promise<void> => {
  try {
    if (watchSubscription) {
      watchSubscription.remove();
      watchSubscription = null;
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
export const startBackgroundTracking = startForegroundTracking;
export const stopBackgroundTracking = stopTracking;

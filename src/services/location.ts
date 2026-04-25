import * as Location from 'expo-location';
import { updateDriverLocation } from './delivery';

// Estado compartido para el orderId activo
let activeOrderId: string | null = null;
let watchSubscription: Location.LocationSubscription | null = null;

export const setActiveOrderId = (orderId: string | null) => {
  activeOrderId = orderId;
};

/**
 * Solicita SOLO permisos de ubicación en primer plano.
 * No pide background para evitar crashes en dispositivos viejos/Go Edition.
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
 * Inicia el tracking GPS usando watchPositionAsync (primer plano solamente).
 * Mucho más estable que background tracking en dispositivos de gama baja.
 */
export const startForegroundTracking = async (): Promise<void> => {
  // Stop any existing watch
  await stopTracking().catch(() => {});

  try {
    watchSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced, // Balanced para ahorrar batería
        timeInterval: 10_000, // cada 10 segundos
        distanceInterval: 20, // o cada 20 metros
      },
      (location) => {
        // Enviar ubicación a Supabase
        updateDriverLocation({
          orderId: activeOrderId,
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          accuracy_m: location.coords.accuracy,
          heading: location.coords.heading,
          speed_mps: location.coords.speed,
        }).catch(() => {}); // No bloquear si falla
      },
    );
  } catch (err) {
    console.warn('Could not start location watch:', err);
  }
};

/**
 * Detiene el tracking GPS.
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
 * Obtiene la ubicación actual una vez.
 */
export const getCurrentLocation =
  async (): Promise<Location.LocationObject> => {
    return Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
  };

// Keep these exports for backward compatibility
export const startBackgroundTracking = startForegroundTracking;
export const stopBackgroundTracking = stopTracking;
export const LOCATION_TASK_NAME = 'pideya-driver-bg-location';

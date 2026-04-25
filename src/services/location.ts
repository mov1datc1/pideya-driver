import * as Location from 'expo-location';
import { updateDriverLocation } from './delivery';

// Estado compartido para el orderId activo
let activeOrderId: string | null = null;
let watchSubscription: Location.LocationSubscription | null = null;
let backgroundStarted = false;

export const LOCATION_TASK_NAME = 'pideya-driver-bg-location';

export const setActiveOrderId = (orderId: string | null) => {
  activeOrderId = orderId;
};

// ============================================================
// Intentar registrar tarea de background de forma segura.
// Si falla (Android Go, dispositivos viejos), no pasa nada.
// ============================================================
try {
  const TaskManager = require('expo-task-manager');
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
    if (error) return;
    const { locations } = data as { locations: Location.LocationObject[] };
    if (!locations || locations.length === 0) return;
    const latest = locations[locations.length - 1];
    await updateDriverLocation({
      orderId: activeOrderId,
      lat: latest.coords.latitude,
      lng: latest.coords.longitude,
      accuracy_m: latest.coords.accuracy,
      heading: latest.coords.heading,
      speed_mps: latest.coords.speed,
    }).catch(() => {});
  });
} catch {
  // TaskManager no disponible — solo foreground tracking
  console.warn('TaskManager not available — background tracking disabled');
}

/**
 * Solicita permisos de ubicación.
 * Pide foreground siempre. Intenta background pero no bloquea si falla.
 */
export const requestLocationPermissions = async (): Promise<boolean> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return false;

    // Intentar pedir background — no bloquea si falla
    try {
      await Location.requestBackgroundPermissionsAsync();
    } catch {
      // Falla en dispositivos viejos/Go — OK
    }

    return true;
  } catch {
    return false;
  }
};

/**
 * Inicia tracking con degradación gradual:
 * 1. Intenta background tracking (teléfonos nuevos) — cliente ve al repartidor siempre
 * 2. Si falla, usa foreground tracking (teléfonos viejos) — cliente ve cuando app está abierta
 */
export const startForegroundTracking = async (): Promise<void> => {
  await stopTracking().catch(() => {});

  // === PASO 1: Intentar background tracking (teléfonos nuevos) ===
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(
      LOCATION_TASK_NAME,
    ).catch(() => false);

    if (!hasStarted) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10_000,
        distanceInterval: 20,
        deferredUpdatesInterval: 10_000,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Pide ya — Entrega activa',
          notificationBody: 'Compartiendo tu ubicación con el cliente',
          notificationColor: '#2D8B7A',
        },
      });
      backgroundStarted = true;
      console.log('✅ Background tracking started');
    }
  } catch (err) {
    backgroundStarted = false;
    console.warn('⚠️ Background tracking failed (fallback to foreground):', err);
  }

  // === PASO 2: Siempre iniciar foreground watch como respaldo ===
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
    console.warn('⚠️ Foreground watch also failed');
  }
};

/**
 * Detiene todo el tracking.
 */
export const stopTracking = async (): Promise<void> => {
  // Detener foreground watch
  try {
    if (watchSubscription) {
      watchSubscription.remove();
      watchSubscription = null;
    }
  } catch {}

  // Detener background tracking
  if (backgroundStarted) {
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TASK_NAME,
      ).catch(() => false);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch {}
    backgroundStarted = false;
  }

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

// Aliases para compatibilidad
export const startBackgroundTracking = startForegroundTracking;
export const stopBackgroundTracking = stopTracking;

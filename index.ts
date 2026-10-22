import { registerRootComponent } from 'expo';
import * as TaskManager from 'expo-task-manager';
import { updateDriverLocation } from './src/services/delivery';
import { LOCATION_TASK_NAME } from './src/services/location';

import App from './App';

// Define the global background task for location tracking
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }
  if (data) {
    const { locations } = data as { locations: any[] };
    if (locations && locations.length > 0) {
      const location = locations[0];
      try {
        // En segundo plano no tenemos fácil acceso al orderId activo desde React state,
        // pero updateDriverLocation puede actualizar sin orderId (NULL), 
        // y la UI del cliente usará driver_last_lat y driver_last_lng.
        await updateDriverLocation({
          orderId: null, // Omit orderId in background or read from AsyncStorage if strictly required
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          accuracy_m: location.coords.accuracy,
          heading: location.coords.heading,
          speed_mps: location.coords.speed,
        });
      } catch (err) {
        console.error('Error updating location in background:', err);
      }
    }
  }
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
registerRootComponent(App);

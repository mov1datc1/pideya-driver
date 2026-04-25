require('dotenv').config();

const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

module.exports = {
  expo: {
    name: 'Pide ya - Repartidor',
    slug: 'pideya-driver',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: false,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#2D8B7A',
    },
    plugins: [
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Pide ya necesita tu ubicación para mostrar tu posición en el mapa.',
          isAndroidBackgroundLocationEnabled: false,
          isAndroidForegroundServiceEnabled: false,
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'Pide ya usa fotos para evidencia de entrega.',
          cameraPermission: 'Pide ya usa la cámara para tomar foto de entrega.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#2D8B7A',
        },
      ],
    ],
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.pideya.driver',
      config: {
        googleMapsApiKey: GOOGLE_MAPS_KEY,
      },
      infoPlist: {
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Pide ya necesita tu ubicación para compartirla con el cliente durante la entrega.',
        NSLocationAlwaysUsageDescription:
          'Pide ya necesita tu ubicación en segundo plano para el seguimiento de entregas.',
        NSLocationWhenInUseUsageDescription:
          'Pide ya necesita tu ubicación para mostrar tu posición en el mapa.',
        UIBackgroundModes: ['location', 'fetch', 'remote-notification'],
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#2D8B7A',
      },
      package: 'com.pideya.driver',
      config: {
        googleMaps: {
          apiKey: GOOGLE_MAPS_KEY,
        },
      },
      permissions: [
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'CAMERA',
        'VIBRATE',
      ],
    },
    extra: {
      eas: {
        projectId: '886e6c3a-fc23-4887-ad1b-28dc1f0c050b',
      },
    },
    owner: 'pideya1',
  },
};

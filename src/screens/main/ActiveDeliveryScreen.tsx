import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  Platform,
  ActivityIndicator,
  Animated,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, AnimatedRegion } from 'react-native-maps';
import * as ordersService from '../../services/orders';
import * as deliveryService from '../../services/delivery';
import * as locationService from '../../services/location';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius } from '../../constants/theme';
import { formatPrice, isValidCoordinate, haversineKm, formatDistance } from '../../utils/formatters';
import type { Order } from '../../types/database';
import type { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveDelivery'>;

const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

/** Calculate bearing (heading angle) between two GPS points */
const getBearing = (
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const dLng = toRad(end.lng - start.lng);
  const lat1 = toRad(start.lat);
  const lat2 = toRad(end.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

/** Decode Google Maps encoded polyline string */
const decodePolyline = (encoded: string): { latitude: number; longitude: number }[] => {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
};

export default function ActiveDeliveryScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const { restaurant } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [driverCoords, setDriverCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [bearing, setBearing] = useState(0);
  const [routeCoords, setRouteCoords] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [eta, setEta] = useState<string | null>(null);

  const mapRef = useRef<MapView>(null);
  const markerRef = useRef<any>(null);
  const prevCoords = useRef<{ lat: number; lng: number } | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // AnimatedRegion for smooth marker movement
  const animatedCoord = useRef(
    new AnimatedRegion({
      latitude: 0,
      longitude: 0,
      latitudeDelta: 0,
      longitudeDelta: 0,
    }),
  ).current;

  // Pulse animation for driver marker
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.4,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Fetch order
  useEffect(() => {
    (async () => {
      try {
        const data = await ordersService.getOrderById(orderId);
        setOrder(data);
      } catch (err: any) {
        Alert.alert('Error', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  // Animate driver marker smoothly to new position
  const animateToPosition = useCallback(
    (newLat: number, newLng: number) => {
      // Calculate bearing from previous position
      if (prevCoords.current) {
        const newBearing = getBearing(prevCoords.current, {
          lat: newLat,
          lng: newLng,
        });
        // Only update bearing if driver moved > 5 meters
        const dist = haversineKm(
          prevCoords.current.lat,
          prevCoords.current.lng,
          newLat,
          newLng,
        );
        if (dist > 0.005) {
          setBearing(newBearing);
        }
      }

      prevCoords.current = { lat: newLat, lng: newLng };

      // Smooth animation
      if (Platform.OS === 'android' && markerRef.current) {
        markerRef.current.animateMarkerToCoordinate(
          { latitude: newLat, longitude: newLng },
          500,
        );
      } else {
        (animatedCoord as any)
          .timing({
            latitude: newLat,
            longitude: newLng,
            duration: 500,
            useNativeDriver: false,
          })
          .start();
      }

      setDriverCoords({ lat: newLat, lng: newLng });
    },
    [animatedCoord],
  );

  // Start GPS tracking
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const granted = await locationService.requestLocationPermissions();
        if (!granted) {
          Alert.alert(
            'Permisos',
            'Se necesitan permisos de ubicación para compartir tu posición con el cliente.',
          );
          return;
        }

        locationService.setActiveOrderId(orderId);

        // Get initial position
        try {
          const loc = await locationService.getCurrentLocation();
          if (mounted) {
            const lat = loc.coords.latitude;
            const lng = loc.coords.longitude;
            animatedCoord.setValue({
              latitude: lat,
              longitude: lng,
              latitudeDelta: 0,
              longitudeDelta: 0,
            });
            setDriverCoords({ lat, lng });
            prevCoords.current = { lat, lng };
          }
        } catch (locErr) {
          console.warn('Could not get initial location:', locErr);
        }

        try {
          await locationService.startBackgroundTracking();
        } catch (bgErr) {
          console.warn('Could not start background tracking:', bgErr);
        }
      } catch (permErr) {
        console.warn('Location permission error:', permErr);
      }
    })();

    return () => {
      mounted = false;
      locationService.stopBackgroundTracking().catch(() => {});
    };
  }, [orderId, animatedCoord]);

  // Real-time order updates
  useEffect(() => {
    const unsub = ordersService.subscribeToDriverOrders(
      order?.delivery_driver_id ?? '',
      (updated) => {
        if (updated.id === orderId) {
          setOrder(updated);
          if (updated.status === 'DELIVERED') {
            locationService.stopBackgroundTracking();
          }
        }
      },
    );

    return unsub;
  }, [orderId, order?.delivery_driver_id]);

  // Periodic GPS update with smooth animation
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const loc = await locationService.getCurrentLocation();
        animateToPosition(loc.coords.latitude, loc.coords.longitude);
      } catch {}
    }, 5_000); // Update every 5 seconds for smoother tracking

    return () => clearInterval(interval);
  }, [animateToPosition]);

  // Fetch route polyline from Directions API
  useEffect(() => {
    if (!order || !driverCoords || !GOOGLE_MAPS_KEY) return;
    if (!isValidCoordinate(order.client_lat, order.client_lng)) return;

    const fetchRoute = async () => {
      try {
        const origin = `${driverCoords.lat},${driverCoords.lng}`;
        const destination = `${order.client_lat},${order.client_lng}`;
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&key=${GOOGLE_MAPS_KEY}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.routes?.[0]) {
          const route = data.routes[0];
          // Decode polyline
          const points = decodePolyline(
            route.overview_polyline.points,
          );
          setRouteCoords(points);

          // Extract ETA
          const leg = route.legs?.[0];
          if (leg?.duration?.text) {
            setEta(leg.duration.text);
          }
        }
      } catch (err) {
        console.warn('Could not fetch directions:', err);
      }
    };

    fetchRoute();
    // Refresh route every 30 seconds
    const interval = setInterval(fetchRoute, 30_000);
    return () => clearInterval(interval);
  }, [order?.id, driverCoords?.lat, driverCoords?.lng]);

  // Fit map to markers
  useEffect(() => {
    if (!order || !driverCoords || !mapRef.current) return;
    if (!isValidCoordinate(order.client_lat, order.client_lng)) return;

    const coords = [
      { latitude: order.client_lat, longitude: order.client_lng },
      { latitude: driverCoords.lat, longitude: driverCoords.lng },
    ];

    if (isValidCoordinate(restaurant?.lat, restaurant?.lng)) {
      coords.push({
        latitude: restaurant!.lat!,
        longitude: restaurant!.lng!,
      });
    }

    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 100, right: 60, bottom: 220, left: 60 },
      animated: true,
    });
  }, [order, driverCoords, restaurant]);

  const handleComplete = () => {
    if (!order) return;

    Alert.alert(
      'Confirmar entrega',
      `¿Confirmas que entregaste el pedido #${order.order_number}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, entregado',
          style: 'default',
          onPress: async () => {
            setCompleting(true);
            try {
              await deliveryService.completeDelivery(order.id);
              await locationService.stopBackgroundTracking();
              Alert.alert(
                'Entrega completada',
                `Pedido #${order.order_number} entregado exitosamente.`,
                [{ text: 'OK', onPress: () => navigation.popToTop() }],
              );
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setCompleting(false);
            }
          },
        },
      ],
    );
  };

  const openNavigation = () => {
    if (!order) return;
    const url = Platform.select({
      ios: `maps://app?daddr=${order.client_lat},${order.client_lng}`,
      android: `google.navigation:q=${order.client_lat},${order.client_lng}`,
    });
    if (url) Linking.openURL(url);
  };

  const callClient = () => {
    if (order?.client_phone) {
      Linking.openURL(`tel:${order.client_phone}`);
    }
  };

  if (loading || !order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const hasClientCoords = isValidCoordinate(order?.client_lat, order?.client_lng);
  const distanceKm =
    driverCoords && hasClientCoords
      ? haversineKm(driverCoords.lat, driverCoords.lng, order.client_lat, order.client_lng)
      : null;

  return (
    <View style={styles.container}>
      {/* Full-screen map */}
      {hasClientCoords ? (
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{
            latitude: order!.client_lat,
            longitude: order!.client_lng,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          mapPadding={{ top: 0, right: 0, bottom: 200, left: 0 }}
        >
          {/* Route polyline */}
          {routeCoords.length > 0 && (
            <Polyline
              coordinates={routeCoords}
              strokeWidth={4}
              strokeColor={colors.primary}
              lineDashPattern={[0]}
            />
          )}

          {/* Client marker — destination */}
          <Marker
            coordinate={{
              latitude: order!.client_lat,
              longitude: order!.client_lng,
            }}
            title={order!.client_name || 'Cliente'}
            description={order!.client_location_note || undefined}
          >
            <View style={styles.markerClient}>
              <Ionicons name="home" size={18} color={colors.white} />
            </View>
          </Marker>

          {/* Restaurant marker — origin */}
          {isValidCoordinate(restaurant?.lat, restaurant?.lng) && (
            <Marker
              coordinate={{
                latitude: restaurant!.lat!,
                longitude: restaurant!.lng!,
              }}
              title={restaurant!.name}
            >
              <View style={styles.markerRestaurant}>
                <Ionicons name="restaurant" size={16} color={colors.white} />
              </View>
            </Marker>
          )}

          {/* Driver marker — animated with rotation */}
          {driverCoords && (
            <Marker.Animated
              ref={markerRef}
              coordinate={animatedCoord as any}
              title="Tu ubicación"
              anchor={{ x: 0.5, y: 0.5 }}
              flat={true}
              rotation={bearing}
            >
              <View style={styles.driverMarkerWrapper}>
                <Animated.View
                  style={[
                    styles.driverPulse,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                />
                <View style={styles.driverDot}>
                  <Ionicons name="bicycle" size={18} color={colors.white} />
                </View>
              </View>
            </Marker.Animated>
          )}
        </MapView>
      ) : (
        <View
          style={[
            styles.map,
            {
              backgroundColor: colors.background,
              justifyContent: 'center',
              alignItems: 'center',
            },
          ]}
        >
          <Ionicons
            name="location-outline"
            size={48}
            color={colors.textMuted}
          />
          <Text
            style={{ color: colors.textMuted, marginTop: 8, fontSize: 15 }}
          >
            Sin ubicación del cliente
          </Text>
          {driverCoords && (
            <Text
              style={{
                color: colors.textSecondary,
                marginTop: 4,
                fontSize: 13,
              }}
            >
              Tu posición: {driverCoords.lat.toFixed(4)},{' '}
              {driverCoords.lng.toFixed(4)}
            </Text>
          )}
        </View>
      )}

      {/* Status pill overlay with ETA */}
      <View style={styles.statusPill}>
        <View style={styles.statusDot} />
        <Text style={styles.statusPillText}>
          Entrega en curso - #{order.order_number}
        </Text>
        {eta && (
          <View style={styles.etaBadge}>
            <Text style={styles.etaText}>{eta}</Text>
          </View>
        )}
      </View>

      {/* Distance badge */}
      {distanceKm !== null && (
        <View style={styles.distanceBadge}>
          <Ionicons name="navigate-outline" size={14} color={colors.primary} />
          <Text style={styles.distanceText}>
            {formatDistance(distanceKm)}
          </Text>
        </View>
      )}

      {/* Bottom card */}
      <View style={styles.bottomCard}>
        {/* Client info */}
        <View style={styles.clientInfo}>
          <View style={styles.clientAvatar}>
            <Ionicons name="person" size={20} color={colors.white} />
          </View>
          <View style={styles.clientDetails}>
            <Text style={styles.clientName}>
              {order.client_name || 'Cliente'}
            </Text>
            {order.client_location_note && (
              <Text style={styles.clientNote} numberOfLines={1}>
                📍 {order.client_location_note}
              </Text>
            )}
          </View>
          <Text style={styles.totalText}>{formatPrice(order.total)}</Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={callClient}
            activeOpacity={0.7}
          >
            <Ionicons name="call" size={22} color={colors.primary} />
            <Text style={styles.actionLabel}>Llamar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={openNavigation}
            activeOpacity={0.7}
          >
            <Ionicons name="navigate" size={22} color={colors.primary} />
            <Text style={styles.actionLabel}>Ruta</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.completeBtn,
              completing && styles.buttonDisabled,
            ]}
            onPress={handleComplete}
            disabled={completing}
            activeOpacity={0.8}
          >
            {completing ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={colors.white}
                />
                <Text style={styles.completeBtnText}>Entregado</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  map: { ...StyleSheet.absoluteFillObject },

  // Markers
  markerClient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  markerRestaurant: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.tierra,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
    elevation: 4,
  },
  driverMarkerWrapper: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverPulse: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary + '30',
  },
  driverDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },

  // Status pill
  statusPill: {
    position: 'absolute',
    top: spacing.xxl + spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
  },
  statusPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  etaBadge: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    marginLeft: 2,
  },
  etaText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },

  // Distance badge
  distanceBadge: {
    position: 'absolute',
    top: spacing.xxl + spacing.md + 44,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  distanceText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },

  // Bottom card
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl + spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  clientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  clientAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  clientDetails: { flex: 1 },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  clientNote: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  totalText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    gap: 4,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  completeBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  completeBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  buttonDisabled: { opacity: 0.6 },
});

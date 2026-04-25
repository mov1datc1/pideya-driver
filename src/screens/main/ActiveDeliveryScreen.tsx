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
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ordersService from '../../services/orders';
import * as deliveryService from '../../services/delivery';
import * as locationService from '../../services/location';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius } from '../../constants/theme';
import {
  formatPrice,
  isValidCoordinate,
  haversineKm,
  formatDistance,
  normalizeItem,
} from '../../utils/formatters';
import type { Order } from '../../types/database';
import type { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveDelivery'>;

// Try importing MapView — may crash on some devices
let MapView: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = undefined;
try {
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
} catch {
  // Maps not available — will use fallback
}

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
  const [mapError, setMapError] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string>('Iniciando GPS...');

  const mapRef = useRef<any>(null);

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

  // Start GPS tracking — wrapped in robust try/catch
  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        const granted = await locationService.requestLocationPermissions();
        if (!granted) {
          setGpsStatus('Sin permisos de ubicación');
          return;
        }

        locationService.setActiveOrderId(orderId);

        // Get initial position
        try {
          const loc = await locationService.getCurrentLocation();
          if (mounted) {
            setDriverCoords({
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
            });
            setGpsStatus('GPS activo');
          }
        } catch {
          setGpsStatus('Esperando señal GPS...');
        }

        // Try background tracking (may fail on some devices)
        try {
          await locationService.startBackgroundTracking();
          if (mounted) setGpsStatus('GPS activo · Compartiendo ubicación');
        } catch {
          if (mounted) setGpsStatus('GPS sin background — usando primer plano');
        }

        // Periodic foreground updates every 8 seconds
        interval = setInterval(async () => {
          try {
            const loc = await locationService.getCurrentLocation();
            if (mounted) {
              setDriverCoords({
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
              });
            }
          } catch {}
        }, 8_000);
      } catch {
        if (mounted) setGpsStatus('Error de GPS');
      }
    })();

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
      locationService.stopBackgroundTracking().catch(() => {});
    };
  }, [orderId]);

  // Real-time order updates
  useEffect(() => {
    if (!order?.delivery_driver_id) return;

    const unsub = ordersService.subscribeToDriverOrders(
      order.delivery_driver_id,
      (updated) => {
        if (updated.id === orderId) {
          setOrder(updated);
          if (updated.status === 'DELIVERED') {
            locationService.stopBackgroundTracking().catch(() => {});
          }
        }
      },
    );

    return unsub;
  }, [orderId, order?.delivery_driver_id]);

  // Fit map to markers when coords update
  useEffect(() => {
    if (!order || !driverCoords || !mapRef.current || mapError) return;
    if (!isValidCoordinate(order.client_lat, order.client_lng)) return;

    try {
      const coords = [
        { latitude: order.client_lat, longitude: order.client_lng },
        { latitude: driverCoords.lat, longitude: driverCoords.lng },
      ];

      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 60, bottom: 300, left: 60 },
        animated: true,
      });
    } catch {}
  }, [order, driverCoords, mapError]);

  /** Take a photo as delivery proof */
  const takeDeliveryPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permisos de cámara',
          'Se necesitan permisos de cámara para tomar la foto de evidencia.',
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.5, // Compress for faster upload
        exif: false,
      });

      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (err) {
      console.warn('Camera error:', err);
    }
  };

  const handleComplete = () => {
    if (!order) return;

    const confirmMessage = photoUri
      ? `¿Confirmas la entrega del pedido ${order.reference_code}? La foto de evidencia se guardará.`
      : `¿Confirmas la entrega del pedido ${order.reference_code}?\n\n⚠️ No tomaste foto de evidencia. ¿Continuar sin foto?`;

    Alert.alert('Confirmar entrega', confirmMessage, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, entregado',
        style: 'default',
        onPress: async () => {
          setCompleting(true);
          try {
            // Upload photo if taken
            let photoUrl = '';
            if (photoUri) {
              photoUrl = await deliveryService.uploadDeliveryPhoto(
                order.id,
                photoUri,
              );
            }

            await deliveryService.completeDelivery(order.id, photoUrl || undefined);
            await locationService.stopBackgroundTracking().catch(() => {});
            Alert.alert(
              '¡Entrega completada!',
              `Pedido ${order.reference_code} entregado exitosamente.${photoUrl ? '\n📸 Foto guardada como evidencia.' : ''}`,
              [{ text: 'OK', onPress: () => navigation.popToTop() }],
            );
          } catch (err: any) {
            Alert.alert('Error', err.message);
          } finally {
            setCompleting(false);
          }
        },
      },
    ]);
  };

  /** Open Google Maps with turn-by-turn navigation */
  const openGoogleMaps = () => {
    if (!order) return;
    const url = Platform.select({
      ios: `comgooglemaps://?daddr=${order.client_lat},${order.client_lng}&directionsmode=driving`,
      android: `google.navigation:q=${order.client_lat},${order.client_lng}&mode=d`,
    });

    // Try Google Maps first, fallback to generic maps
    if (url) {
      Linking.canOpenURL(url).then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          // Fallback to web
          Linking.openURL(
            `https://www.google.com/maps/dir/?api=1&destination=${order.client_lat},${order.client_lng}&travelmode=driving`,
          );
        }
      });
    }
  };

  /** Open Waze */
  const openWaze = () => {
    if (!order) return;
    const url = `https://waze.com/ul?ll=${order.client_lat},${order.client_lng}&navigate=yes`;
    Linking.openURL(url);
  };

  /** Call client */
  const callClient = () => {
    if (order?.client_phone) {
      Linking.openURL(`tel:${order.client_phone}`);
    }
  };

  /** WhatsApp client */
  const whatsappClient = () => {
    if (!order?.client_phone) return;
    const phone = order.client_phone.replace(/\D/g, '');
    const withCountry = phone.startsWith('52') ? phone : `52${phone}`;
    const message = `Hola, soy tu repartidor de Pide ya 🛵. Voy en camino con tu pedido ${order.reference_code}. ¿Alguna indicación adicional?`;
    Linking.openURL(
      `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`,
    );
  };

  if (loading || !order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>
          Cargando pedido...
        </Text>
      </View>
    );
  }

  const hasClientCoords = isValidCoordinate(order.client_lat, order.client_lng);
  const distanceKm =
    driverCoords && hasClientCoords
      ? haversineKm(
          driverCoords.lat,
          driverCoords.lng,
          order.client_lat,
          order.client_lng,
        )
      : null;

  // Estimated time based on distance (rough: 25 km/h for moto in city)
  const etaMinutes = distanceKm ? Math.max(1, Math.round((distanceKm / 25) * 60)) : null;

  const isDelivered = order.status === 'DELIVERED';

  return (
    <View style={styles.container}>
      {/* Map section — with crash protection */}
      <View style={styles.mapSection}>
        {hasClientCoords && MapView && !mapError ? (
          <MapView
            ref={mapRef}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            style={StyleSheet.absoluteFillObject}
            initialRegion={{
              latitude: order.client_lat,
              longitude: order.client_lng,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
            showsUserLocation={true}
            showsMyLocationButton={false}
            onMapReady={() => setMapError(false)}
            onError={() => setMapError(true)}
          >
            {/* Client destination marker */}
            <Marker
              coordinate={{
                latitude: order.client_lat,
                longitude: order.client_lng,
              }}
              title={order.client_name || 'Cliente'}
              description={order.client_location_note || undefined}
            >
              <View style={styles.markerClient}>
                <Ionicons name="home" size={18} color={colors.white} />
              </View>
            </Marker>

            {/* Restaurant marker */}
            {isValidCoordinate(restaurant?.lat, restaurant?.lng) && (
              <Marker
                coordinate={{
                  latitude: restaurant!.lat!,
                  longitude: restaurant!.lng!,
                }}
                title={restaurant!.name}
              >
                <View style={styles.markerRestaurant}>
                  <Ionicons
                    name="restaurant"
                    size={14}
                    color={colors.white}
                  />
                </View>
              </Marker>
            )}
          </MapView>
        ) : (
          <View style={styles.mapFallback}>
            <Ionicons name="map-outline" size={48} color={colors.textMuted} />
            <Text style={styles.mapFallbackText}>
              {mapError ? 'Error al cargar mapa' : 'Mapa no disponible'}
            </Text>
            <Text style={styles.mapFallbackHint}>
              Usa Google Maps para navegar
            </Text>
          </View>
        )}

        {/* Status pill overlay */}
        <View style={styles.statusPill}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: isDelivered
                  ? colors.success
                  : colors.statusOnTheWay,
              },
            ]}
          />
          <Text style={styles.statusPillText}>
            {isDelivered
              ? '✅ Entregado'
              : `En camino — ${order.reference_code}`}
          </Text>
          {etaMinutes && !isDelivered && (
            <View style={styles.etaBadge}>
              <Text style={styles.etaText}>~{etaMinutes} min</Text>
            </View>
          )}
        </View>

        {/* Distance badge */}
        {distanceKm !== null && !isDelivered && (
          <View style={styles.distanceBadge}>
            <Ionicons
              name="navigate-outline"
              size={14}
              color={colors.primary}
            />
            <Text style={styles.distanceText}>
              {formatDistance(distanceKm)}
            </Text>
          </View>
        )}
      </View>

      {/* Bottom card — scrollable */}
      <ScrollView
        style={styles.bottomCard}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* GPS status */}
        <View style={styles.gpsRow}>
          <Ionicons
            name="radio-outline"
            size={14}
            color={
              gpsStatus.includes('activo')
                ? colors.success
                : colors.textMuted
            }
          />
          <Text
            style={[
              styles.gpsText,
              gpsStatus.includes('activo') && { color: colors.success },
            ]}
          >
            {gpsStatus}
          </Text>
        </View>

        {/* Client info card */}
        <View style={styles.clientCard}>
          <View style={styles.clientAvatar}>
            <Ionicons name="person" size={20} color={colors.white} />
          </View>
          <View style={styles.clientDetails}>
            <Text style={styles.clientName}>
              {order.client_name || 'Cliente'}
            </Text>
            {order.client_location_note && (
              <Text style={styles.clientNote} numberOfLines={2}>
                📍 {order.client_location_note}
              </Text>
            )}
            {order.client_phone && (
              <Text style={styles.clientPhone}>
                📱 {order.client_phone}
              </Text>
            )}
          </View>
          <Text style={styles.totalText}>{formatPrice(order.total)}</Text>
        </View>

        {/* === NAVIGATION BUTTONS — Primary CTA === */}
        <View style={styles.navButtons}>
          <TouchableOpacity
            style={styles.googleMapsBtn}
            onPress={openGoogleMaps}
            activeOpacity={0.8}
          >
            <Ionicons name="navigate" size={22} color={colors.white} />
            <Text style={styles.googleMapsBtnText}>
              Ir con Google Maps
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.wazeBtn}
            onPress={openWaze}
            activeOpacity={0.8}
          >
            <Ionicons name="compass" size={20} color={colors.primary} />
            <Text style={styles.wazeBtnText}>Waze</Text>
          </TouchableOpacity>
        </View>

        {/* Contact buttons */}
        <View style={styles.contactButtons}>
          {order.client_phone && (
            <>
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={whatsappClient}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
                <Text style={[styles.contactBtnText, { color: '#25D366' }]}>
                  WhatsApp
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.contactBtn}
                onPress={callClient}
                activeOpacity={0.7}
              >
                <Ionicons name="call" size={22} color={colors.primary} />
                <Text style={styles.contactBtnText}>Llamar</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Items summary (collapsible feel) */}
        <View style={styles.itemsSummary}>
          <Text style={styles.itemsSummaryTitle}>
            {order.items.reduce(
              (s, i) => s + (normalizeItem(i).quantity),
              0,
            )}{' '}
            productos · {formatPrice(order.total)}
          </Text>
          {order.items.map((raw, idx) => {
            const item = normalizeItem(raw);
            return (
              <Text key={idx} style={styles.itemLine}>
                {item.quantity}x {item.name}
              </Text>
            );
          })}
        </View>

        {/* Photo proof section */}
        {!isDelivered && (
          <View style={styles.photoSection}>
            <Text style={styles.photoSectionTitle}>📸 Foto de evidencia</Text>
            {photoUri ? (
              <View style={styles.photoPreview}>
                <Image
                  source={{ uri: photoUri }}
                  style={styles.photoImage}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  style={styles.retakeBtn}
                  onPress={takeDeliveryPhoto}
                >
                  <Ionicons name="camera" size={16} color={colors.primary} />
                  <Text style={styles.retakeBtnText}>Volver a tomar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.takePhotoBtn}
                onPress={takeDeliveryPhoto}
                activeOpacity={0.7}
              >
                <Ionicons name="camera-outline" size={32} color={colors.primary} />
                <Text style={styles.takePhotoText}>Tomar foto de entrega</Text>
                <Text style={styles.takePhotoHint}>Evidencia para el restaurante y el cliente</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Complete delivery button */}
        {!isDelivered && (
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
                  size={24}
                  color={colors.white}
                />
                <Text style={styles.completeBtnText}>
                  {photoUri ? 'Confirmar entrega con foto' : 'Marcar como entregado'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {isDelivered && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.popToTop()}
            activeOpacity={0.8}
          >
            <Text style={styles.backBtnText}>Volver al inicio</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },

  // Map
  mapSection: {
    height: '45%',
    backgroundColor: colors.background,
    position: 'relative',
  },
  mapFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    gap: 8,
  },
  mapFallbackText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
  },
  mapFallbackHint: {
    fontSize: 13,
    color: colors.textSecondary,
  },

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
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.tierra,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
    elevation: 4,
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
  },
  etaText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },

  // Distance
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
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    marginTop: -16,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 10,
  },

  // GPS status
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.md,
  },
  gpsText: {
    fontSize: 12,
    color: colors.textMuted,
  },

  // Client card
  clientCard: {
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
  clientPhone: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
    marginTop: 2,
  },
  totalText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // Navigation buttons
  navButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  googleMapsBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#4285F4',
    paddingVertical: 16,
    borderRadius: radius.md,
    shadowColor: '#4285F4',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  googleMapsBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  wazeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  wazeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },

  // Contact buttons
  contactButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  contactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 6,
  },
  contactBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },

  // Items summary
  itemsSummary: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  itemsSummaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  itemLine: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 2,
  },

  // Complete button
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success,
    paddingVertical: 16,
    borderRadius: radius.md,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  completeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  buttonDisabled: { opacity: 0.6 },

  // Back button
  backBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },

  // Photo proof
  photoSection: {
    marginBottom: spacing.lg,
  },
  photoSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  takePhotoBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.primary + '30',
    borderStyle: 'dashed',
    backgroundColor: colors.primaryFaint,
    gap: spacing.xs,
  },
  takePhotoText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  takePhotoHint: {
    fontSize: 12,
    color: colors.textMuted,
  },
  photoPreview: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  photoImage: {
    width: '100%',
    height: 200,
    borderRadius: radius.lg,
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  retakeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
});

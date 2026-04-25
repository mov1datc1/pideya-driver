import React, { useEffect, useState } from 'react';
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
// ImagePicker loaded lazily to avoid native crashes on old devices
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ordersService from '../../services/orders';
import * as deliveryService from '../../services/delivery';
import * as locationService from '../../services/location';
import { supabase } from '../../services/supabase';
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

export default function ActiveDeliveryScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [driverCoords, setDriverCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [gpsStatus, setGpsStatus] = useState('Iniciando GPS...');

  // Fetch order
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await ordersService.getOrderById(orderId);
        if (mounted) setOrder(data);
      } catch (err: any) {
        Alert.alert('Error', err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [orderId]);

  // Start simple foreground GPS tracking
  useEffect(() => {
    let mounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        const granted = await locationService.requestLocationPermissions();
        if (!granted) {
          if (mounted) setGpsStatus('Sin permisos de ubicación');
          return;
        }

        locationService.setActiveOrderId(orderId);

        // Get initial position
        try {
          const loc = await locationService.getCurrentLocation();
          if (mounted) {
            setDriverCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
            setGpsStatus('GPS activo');
          }
        } catch {
          if (mounted) setGpsStatus('Esperando señal GPS...');
        }

        // Start foreground watch
        try {
          await locationService.startForegroundTracking();
          if (mounted) setGpsStatus('GPS activo · Compartiendo ubicación');
        } catch {
          if (mounted) setGpsStatus('GPS en modo básico');
        }

        // Also poll every 10 seconds to update UI
        intervalId = setInterval(async () => {
          try {
            const loc = await locationService.getCurrentLocation();
            if (mounted) {
              setDriverCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
            }
          } catch {}
        }, 10_000);

      } catch {
        if (mounted) setGpsStatus('Error de GPS');
      }
    })();

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
      locationService.stopTracking().catch(() => {});
    };
  }, [orderId]);

  // Real-time order updates — unique channel name to avoid collision with DashboardScreen
  useEffect(() => {
    if (!order?.delivery_driver_id) return;

    let channel: any = null;
    try {
      channel = supabase
        .channel(`active-delivery-${orderId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `id=eq.${orderId}`,
          },
          (payload: any) => {
            setOrder(payload.new as Order);
          },
        )
        .subscribe();
    } catch (err) {
      console.warn('Realtime subscription error:', err);
    }

    return () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
  }, [orderId]);

  /** Take delivery proof photo */
  const takeDeliveryPhoto = async () => {
    try {
      const ImagePicker = require('expo-image-picker');
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permisos', 'Se necesitan permisos de cámara para la foto de evidencia.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.5,
        exif: false,
      });
      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (err) {
      console.warn('Camera error:', err);
      Alert.alert('Cámara no disponible', 'No se pudo abrir la cámara en este dispositivo.');
    }
  };

  /** Complete delivery */
  const handleComplete = () => {
    if (!order) return;
    const msg = photoUri
      ? `¿Confirmas la entrega del pedido ${order.reference_code || '#' + order.order_number}?`
      : `¿Confirmas la entrega?\n\n⚠️ No tomaste foto de evidencia.`;

    Alert.alert('Confirmar entrega', msg, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, entregado',
        onPress: async () => {
          setCompleting(true);
          try {
            let photoUrl = '';
            if (photoUri) {
              photoUrl = await deliveryService.uploadDeliveryPhoto(order.id, photoUri);
            }
            await deliveryService.completeDelivery(order.id, photoUrl || undefined);
            await locationService.stopTracking().catch(() => {});
            Alert.alert(
              '¡Entrega completada!',
              `Pedido ${order.reference_code || '#' + order.order_number} entregado.${photoUrl ? '\n📸 Foto guardada.' : ''}`,
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

  /** Open Google Maps navigation */
  const openGoogleMaps = () => {
    if (!order) return;
    const lat = order.client_lat;
    const lng = order.client_lng;
    const url = Platform.select({
      ios: `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`,
      android: `google.navigation:q=${lat},${lng}&mode=d`,
    });
    if (url) {
      Linking.canOpenURL(url).then((ok) => {
        if (ok) Linking.openURL(url);
        else Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
      });
    }
  };

  /** Open Waze */
  const openWaze = () => {
    if (!order) return;
    Linking.openURL(`https://waze.com/ul?ll=${order.client_lat},${order.client_lng}&navigate=yes`);
  };

  /** Call client */
  const callClient = () => {
    if (order?.client_phone) Linking.openURL(`tel:${order.client_phone}`);
  };

  /** WhatsApp client */
  const whatsappClient = () => {
    if (!order?.client_phone) return;
    const phone = order.client_phone.replace(/\D/g, '');
    const withCountry = phone.startsWith('52') ? phone : `52${phone}`;
    const ref = order.reference_code || `#${order.order_number}`;
    const msg = `Hola, soy tu repartidor de Pide ya 🛵. Voy en camino con tu pedido ${ref}. ¿Alguna indicación adicional?`;
    Linking.openURL(`https://wa.me/${withCountry}?text=${encodeURIComponent(msg)}`);
  };

  if (loading || !order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>Cargando pedido...</Text>
      </View>
    );
  }

  const hasClientCoords = isValidCoordinate(order.client_lat, order.client_lng);
  const distanceKm = driverCoords && hasClientCoords
    ? haversineKm(driverCoords.lat, driverCoords.lng, order.client_lat, order.client_lng)
    : null;
  const etaMinutes = distanceKm ? Math.max(1, Math.round((distanceKm / 25) * 60)) : null;
  const isDelivered = order.status === 'DELIVERED';
  const refCode = order.reference_code || `#${order.order_number}`;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backArrow}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {isDelivered ? '✅ Entregado' : '🛵 Entrega en curso'}
          </Text>
          <Text style={styles.headerSub}>{refCode}</Text>
        </View>
        {etaMinutes && !isDelivered && (
          <View style={styles.etaBadge}>
            <Text style={styles.etaText}>~{etaMinutes} min</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} bounces={false}>
        {/* GPS + Distance info */}
        <View style={styles.infoBar}>
          <View style={styles.infoItem}>
            <Ionicons
              name="radio-outline"
              size={16}
              color={gpsStatus.includes('activo') ? colors.success : colors.textMuted}
            />
            <Text style={[styles.infoItemText, gpsStatus.includes('activo') && { color: colors.success }]}>
              {gpsStatus}
            </Text>
          </View>
          {distanceKm !== null && (
            <View style={styles.infoItem}>
              <Ionicons name="navigate-outline" size={16} color={colors.primary} />
              <Text style={[styles.infoItemText, { color: colors.primary, fontWeight: '700' }]}>
                {formatDistance(distanceKm)}
              </Text>
            </View>
          )}
        </View>

        {/* ===== NAVIGATION BUTTONS (Primary CTA) ===== */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.googleMapsBtn} onPress={openGoogleMaps} activeOpacity={0.8}>
            <Ionicons name="navigate" size={24} color={colors.white} />
            <View>
              <Text style={styles.googleMapsBtnTitle}>Ir con Google Maps</Text>
              <Text style={styles.googleMapsBtnSub}>Navegación paso a paso</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.wazeBtn} onPress={openWaze} activeOpacity={0.8}>
            <Ionicons name="compass-outline" size={20} color={colors.primary} />
            <Text style={styles.wazeBtnText}>Abrir con Waze</Text>
          </TouchableOpacity>
        </View>

        {/* Client info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CLIENTE</Text>
          <View style={styles.card}>
            <View style={styles.clientRow}>
              <View style={styles.clientAvatar}>
                <Ionicons name="person" size={20} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.clientName}>{order.client_name || 'Cliente'}</Text>
                {order.client_location_note && (
                  <Text style={styles.clientNote} numberOfLines={2}>📍 {order.client_location_note}</Text>
                )}
              </View>
              <Text style={styles.totalBig}>{formatPrice(order.total)}</Text>
            </View>

            {/* Contact buttons */}
            {order.client_phone && (
              <View style={styles.contactRow}>
                <TouchableOpacity style={styles.contactBtn} onPress={callClient}>
                  <Ionicons name="call" size={20} color={colors.primary} />
                  <Text style={styles.contactBtnText}>Llamar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.contactBtn, styles.whatsappBtnStyle]} onPress={whatsappClient}>
                  <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                  <Text style={[styles.contactBtnText, { color: '#25D366' }]}>WhatsApp</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            PRODUCTOS · {order.items.reduce((s, i) => s + normalizeItem(i).quantity, 0)} items
          </Text>
          <View style={styles.card}>
            {order.items.map((raw, idx) => {
              const item = normalizeItem(raw);
              return (
                <Text key={idx} style={styles.itemLine}>
                  {item.quantity}x {item.name}
                  {item.options?.map((o, i) => ` + ${o.label}`).join('')}
                </Text>
              );
            })}
          </View>
        </View>

        {/* Photo proof */}
        {!isDelivered && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📸 FOTO DE EVIDENCIA</Text>
            {photoUri ? (
              <View style={styles.card}>
                <Image source={{ uri: photoUri }} style={styles.photoImage} resizeMode="cover" />
                <TouchableOpacity style={styles.retakeRow} onPress={takeDeliveryPhoto}>
                  <Ionicons name="camera" size={16} color={colors.primary} />
                  <Text style={styles.retakeText}>Volver a tomar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.takePhotoBtn} onPress={takeDeliveryPhoto} activeOpacity={0.7}>
                <Ionicons name="camera-outline" size={36} color={colors.primary} />
                <Text style={styles.takePhotoText}>Tomar foto de entrega</Text>
                <Text style={styles.takePhotoHint}>Evidencia para el restaurante</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Complete button */}
        {!isDelivered && (
          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.completeBtn, completing && { opacity: 0.6 }]}
              onPress={handleComplete}
              disabled={completing}
              activeOpacity={0.8}
            >
              {completing ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={24} color={colors.white} />
                  <Text style={styles.completeBtnText}>
                    {photoUri ? 'Confirmar entrega con foto' : 'Marcar como entregado'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {isDelivered && (
          <View style={styles.section}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.popToTop()}>
              <Text style={styles.backBtnText}>Volver al inicio</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingTop: spacing.xxl + spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  backArrow: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.white },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  etaBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  etaText: { fontSize: 14, fontWeight: '700', color: colors.white },
  // Scroll
  scroll: { flex: 1 },
  // Info bar
  infoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoItemText: { fontSize: 12, color: colors.textMuted },
  // Sections
  section: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  sectionTitle: {
    fontSize: 12, fontWeight: '600', color: colors.textSecondary,
    marginBottom: spacing.sm, letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  // Google Maps button
  googleMapsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: '#4285F4', paddingVertical: 18, paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    shadowColor: '#4285F4', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  googleMapsBtnTitle: { fontSize: 17, fontWeight: '700', color: colors.white },
  googleMapsBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  wazeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: spacing.sm, paddingVertical: 12,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary,
  },
  wazeBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  // Client
  clientRow: { flexDirection: 'row', alignItems: 'center' },
  clientAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm,
  },
  clientName: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  clientNote: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  totalBig: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  // Contact
  contactRow: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md,
  },
  contactBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.primary,
  },
  contactBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  whatsappBtnStyle: { borderColor: '#25D366' },
  // Items
  itemLine: { fontSize: 14, color: colors.textPrimary, paddingVertical: 4 },
  // Photo
  photoImage: { width: '100%', height: 180, borderRadius: radius.md },
  retakeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingTop: spacing.sm,
  },
  retakeText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  takePhotoBtn: {
    alignItems: 'center', paddingVertical: spacing.xl,
    borderRadius: radius.lg, borderWidth: 2,
    borderColor: colors.primary + '30', borderStyle: 'dashed',
    backgroundColor: colors.primaryFaint, gap: spacing.xs,
  },
  takePhotoText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  takePhotoHint: { fontSize: 12, color: colors.textMuted },
  // Complete
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.success, paddingVertical: 18,
    borderRadius: radius.lg,
    shadowColor: colors.success, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  completeBtnText: { fontSize: 17, fontWeight: '700', color: colors.white },
  // Back
  backBtn: {
    alignItems: 'center', paddingVertical: 14, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.primary,
  },
  backBtnText: { fontSize: 15, fontWeight: '600', color: colors.primary },
});

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ordersService from '../../services/orders';
import * as deliveryService from '../../services/delivery';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius } from '../../constants/theme';
import {
  formatPrice,
  statusLabel,
  haversineKm,
  formatDistance,
  normalizeItem,
  isValidCoordinate,
} from '../../utils/formatters';
import type { Order } from '../../types/database';
import type { RootStackParamList } from '../../types/navigation';

// Safe MapView import
let MapView: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = undefined;
try {
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
} catch {}

type Props = NativeStackScreenProps<RootStackParamList, 'OrderDetail'>;

export default function OrderDetailScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const { driver, restaurant } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState(false);
  const [hasActiveDelivery, setHasActiveDelivery] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await ordersService.getOrderById(orderId);
        setOrder(data);

        // Check if driver already has an ON_THE_WAY order
        if (driver) {
          const allOrders = await ordersService.getAssignedOrders(driver.id);
          const activeOtw = allOrders.find(
            (o) => o.status === 'ON_THE_WAY' && o.id !== orderId,
          );
          setHasActiveDelivery(!!activeOtw);
        }
      } catch (err: any) {
        Alert.alert('Error', err.message);
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId, driver]);

  const handleTakeOrder = async () => {
    if (!order) return;

    // Block if there's another active delivery
    if (hasActiveDelivery) {
      Alert.alert(
        'Entrega en curso',
        'Debes terminar tu entrega actual antes de iniciar otra. Vuelve al menú y completa el pedido en marcha.',
        [{ text: 'Entendido' }],
      );
      return;
    }

    Alert.alert(
      'Iniciar entrega',
      `¿Quieres iniciar la entrega del pedido ${order.reference_code}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Iniciar',
          onPress: async () => {
            setTaking(true);
            try {
              await deliveryService.takeOrder(order.id);
              navigation.replace('ActiveDelivery', { orderId: order.id });
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setTaking(false);
            }
          },
        },
      ],
    );
  };

  const openNavigation = () => {
    if (!order) return;
    const url = Platform.select({
      ios: `comgooglemaps://?daddr=${order.client_lat},${order.client_lng}&directionsmode=driving`,
      android: `google.navigation:q=${order.client_lat},${order.client_lng}`,
    });
    if (url) {
      Linking.canOpenURL(url).then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Linking.openURL(
            `https://www.google.com/maps/dir/?api=1&destination=${order.client_lat},${order.client_lng}`,
          );
        }
      });
    }
  };

  const callClient = () => {
    if (order?.client_phone) {
      Linking.openURL(`tel:${order.client_phone}`);
    }
  };

  const whatsappClient = () => {
    if (!order?.client_phone) return;
    const phone = order.client_phone.replace(/\D/g, '');
    const withCountry = phone.startsWith('52') ? phone : `52${phone}`;
    const message = `Hola, soy tu repartidor de Pide ya 🛵. Tengo tu pedido ${order.reference_code} asignado. ¿Alguna indicación adicional para llegar?`;
    Linking.openURL(
      `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`,
    );
  };

  if (loading || !order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const hasClientCoords = isValidCoordinate(order.client_lat, order.client_lng);
  const hasRestCoords = isValidCoordinate(restaurant?.lat, restaurant?.lng);
  const distance =
    hasClientCoords && hasRestCoords
      ? haversineKm(
          restaurant!.lat!,
          restaurant!.lng!,
          order.client_lat,
          order.client_lng,
        )
      : null;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Map preview */}
        <View style={styles.mapContainer}>
          {hasClientCoords && MapView ? (
            <MapView
              provider={
                Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined
              }
              style={styles.map}
              initialRegion={{
                latitude: order.client_lat,
                longitude: order.client_lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
            >
              <Marker
                coordinate={{
                  latitude: order.client_lat,
                  longitude: order.client_lng,
                }}
                title="Cliente"
              >
                <View style={styles.markerClient}>
                  <Ionicons name="home" size={16} color={colors.white} />
                </View>
              </Marker>

              {hasRestCoords && (
                <Marker
                  coordinate={{
                    latitude: restaurant!.lat!,
                    longitude: restaurant!.lng!,
                  }}
                  title="Restaurante"
                >
                  <View style={styles.markerRestaurant}>
                    <Ionicons
                      name="restaurant"
                      size={16}
                      color={colors.white}
                    />
                  </View>
                </Marker>
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
                size={32}
                color={colors.textMuted}
              />
              <Text
                style={{
                  color: colors.textMuted,
                  marginTop: 4,
                  fontSize: 13,
                }}
              >
                Sin ubicación GPS
              </Text>
            </View>
          )}

          {/* Distance badge */}
          {distance !== null && (
            <View style={styles.distanceBadge}>
              <Ionicons name="navigate" size={14} color={colors.primary} />
              <Text style={styles.distanceText}>
                {formatDistance(distance)}
              </Text>
            </View>
          )}
        </View>

        {/* Order header with reference code */}
        <View style={styles.section}>
          <View style={styles.orderHeaderRow}>
            <View>
              <Text style={styles.orderRefCode}>
                {order.reference_code}
              </Text>
              <Text style={styles.orderNumberSub}>
                Pedido #{order.order_number}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    order.status === 'ACCEPTED'
                      ? colors.statusAccepted + '18'
                      : colors.statusOnTheWay + '18',
                },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  {
                    color:
                      order.status === 'ACCEPTED'
                        ? colors.statusAccepted
                        : colors.statusOnTheWay,
                  },
                ]}
              >
                {statusLabel(order.status)}
              </Text>
            </View>
          </View>

          {/* Queue warning */}
          {hasActiveDelivery && order.status === 'ACCEPTED' && (
            <View style={styles.queueWarning}>
              <Ionicons name="time-outline" size={16} color="#E07C24" />
              <Text style={styles.queueWarningText}>
                Tienes una entrega en curso. Termínala antes de iniciar esta.
              </Text>
            </View>
          )}
        </View>

        {/* Client info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="person" size={18} color={colors.primary} />
              <Text style={styles.infoText}>
                {order.client_name || 'Sin nombre'}
              </Text>
            </View>

            {order.client_phone && (
              <View style={styles.contactRow}>
                <TouchableOpacity
                  style={styles.contactAction}
                  onPress={callClient}
                >
                  <Ionicons name="call" size={18} color={colors.primary} />
                  <Text style={[styles.infoText, styles.linkText]}>
                    {order.client_phone}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.whatsappBtn}
                  onPress={whatsappClient}
                >
                  <Ionicons
                    name="logo-whatsapp"
                    size={20}
                    color="#25D366"
                  />
                </TouchableOpacity>
              </View>
            )}

            {order.client_location_note && (
              <View style={styles.infoRow}>
                <Ionicons
                  name="location"
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.infoText}>
                  {order.client_location_note}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Productos</Text>

          <View style={styles.infoCard}>
            {order.items.map((raw, idx) => {
              const item = normalizeItem(raw);
              return (
                <View
                  key={item.id + idx}
                  style={[
                    styles.itemRow,
                    idx < order.items.length - 1 && styles.itemBorder,
                  ]}
                >
                  <View style={styles.itemQty}>
                    <Text style={styles.itemQtyText}>{item.quantity}x</Text>
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.options?.map((opt, oi) => (
                      <Text key={oi} style={styles.itemOption}>
                        + {opt.label}
                      </Text>
                    ))}
                    {item.notes ? (
                      <Text style={styles.itemNotes}>"{item.notes}"</Text>
                    ) : null}
                  </View>
                  <Text style={styles.itemPrice}>
                    {formatPrice(item.price * item.quantity)}
                  </Text>
                </View>
              );
            })}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>
                {formatPrice(order.total)}
              </Text>
            </View>
          </View>
        </View>

        {/* Spacer for button */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom actions */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={openNavigation}
          activeOpacity={0.7}
        >
          <Ionicons name="navigate" size={22} color={colors.primary} />
          <Text style={styles.navButtonText}>Ruta</Text>
        </TouchableOpacity>

        {order.status === 'ACCEPTED' && (
          <TouchableOpacity
            style={[
              styles.takeButton,
              (taking || hasActiveDelivery) && styles.buttonDisabled,
            ]}
            onPress={handleTakeOrder}
            disabled={taking || hasActiveDelivery}
            activeOpacity={0.8}
          >
            {taking ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="bicycle" size={22} color={colors.white} />
                <Text style={styles.takeButtonText}>
                  {hasActiveDelivery
                    ? 'Termina tu entrega actual'
                    : 'Iniciar entrega'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {order.status === 'ON_THE_WAY' && (
          <TouchableOpacity
            style={styles.activeDeliveryBtn}
            onPress={() =>
              navigation.replace('ActiveDelivery', { orderId: order.id })
            }
            activeOpacity={0.8}
          >
            <Ionicons name="bicycle" size={22} color={colors.white} />
            <Text style={styles.takeButtonText}>Ver entrega activa</Text>
          </TouchableOpacity>
        )}
      </View>
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
  scroll: { flex: 1 },
  mapContainer: { height: 200, position: 'relative' },
  map: { ...StyleSheet.absoluteFillObject },
  markerClient: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  markerRestaurant: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.tierra,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  distanceBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  distanceText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  section: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  orderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderRefCode: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  orderNumberSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  statusText: { fontSize: 13, fontWeight: '600' },

  // Queue warning
  queueWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFF3E0',
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  queueWarningText: {
    flex: 1,
    fontSize: 13,
    color: '#E07C24',
    fontWeight: '500',
  },

  // Info card
  infoCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  contactAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  whatsappBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#25D36615',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoText: { fontSize: 15, color: colors.textPrimary, flex: 1 },
  linkText: { color: colors.primary, fontWeight: '500' },

  // Items
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemQty: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primaryFaint,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  itemQtyText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  itemOption: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  itemNotes: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  itemPrice: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  totalLabel: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  totalValue: { fontSize: 18, fontWeight: '700', color: colors.primary },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  navButtonText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  takeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  activeDeliveryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.statusOnTheWay,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  takeButtonText: { fontSize: 16, fontWeight: '600', color: colors.white },
  buttonDisabled: { opacity: 0.5 },
});

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
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as ordersService from '../../services/orders';
import * as deliveryService from '../../services/delivery';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius } from '../../constants/theme';
import { formatPrice, statusLabel, haversineKm, formatDistance, normalizeItem, isValidCoordinate } from '../../utils/formatters';
import type { Order } from '../../types/database';
import type { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderDetail'>;

export default function OrderDetailScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const { restaurant } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await ordersService.getOrderById(orderId);
        setOrder(data);
      } catch (err: any) {
        Alert.alert('Error', err.message);
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  const handleTakeOrder = async () => {
    if (!order) return;

    Alert.alert(
      'Iniciar entrega',
      `¿Quieres iniciar la entrega del pedido #${order.order_number}?`,
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
          {hasClientCoords ? (
            <MapView
              provider={PROVIDER_GOOGLE}
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
                    <Ionicons name="restaurant" size={16} color={colors.white} />
                  </View>
                </Marker>
              )}
            </MapView>
          ) : (
            <View style={[styles.map, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="location-outline" size={32} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, marginTop: 4, fontSize: 13 }}>Sin ubicación GPS</Text>
            </View>
          )}

          {/* Overlay distance badge */}
          {distance !== null && (
            <View style={styles.distanceBadge}>
              <Ionicons name="navigate" size={14} color={colors.primary} />
              <Text style={styles.distanceText}>
                {formatDistance(distance)}
              </Text>
            </View>
          )}
        </View>

        {/* Order header */}
        <View style={styles.section}>
          <View style={styles.orderHeaderRow}>
            <Text style={styles.orderNumber}>
              Pedido #{order.order_number}
            </Text>
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
              <TouchableOpacity style={styles.infoRow} onPress={callClient}>
                <Ionicons name="call" size={18} color={colors.primary} />
                <Text style={[styles.infoText, styles.linkText]}>
                  {order.client_phone}
                </Text>
              </TouchableOpacity>
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
            style={[styles.takeButton, taking && styles.buttonDisabled]}
            onPress={handleTakeOrder}
            disabled={taking}
            activeOpacity={0.8}
          >
            {taking ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="bicycle" size={22} color={colors.white} />
                <Text style={styles.takeButtonText}>Iniciar entrega</Text>
              </>
            )}
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
  orderNumber: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  statusBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  statusText: { fontSize: 13, fontWeight: '600' },
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
  // Bottom
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
  takeButtonText: { fontSize: 16, fontWeight: '600', color: colors.white },
  buttonDisabled: { opacity: 0.6 },
});

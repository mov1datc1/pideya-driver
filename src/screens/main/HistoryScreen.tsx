import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import * as ordersService from '../../services/orders';
import { colors, spacing, radius } from '../../constants/theme';
import { formatPrice } from '../../utils/formatters';
import type { Order } from '../../types/database';

const STATUS_LABELS: Record<string, string> = {
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
  REJECTED: 'Rechazado',
};

const STATUS_COLORS: Record<string, string> = {
  DELIVERED: '#2D8B7A',
  CANCELLED: '#E03131',
  REJECTED: '#F59F00',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${day}/${month}/${year}  ${hours}:${mins}`;
}

export default function HistoryScreen() {
  const { driver } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!driver) return;
    try {
      const data = await ordersService.getDeliveryHistory(driver.id, 100);
      setOrders(data);
    } catch (err) {
      console.warn('Error fetching history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [driver]);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory]),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  const totalDelivered = orders.filter((o) => o.status === 'DELIVERED').length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const renderOrder = ({ item }: { item: Order }) => {
    const statusLabel = STATUS_LABELS[item.status] ?? item.status;
    const statusColor = STATUS_COLORS[item.status] ?? colors.textSecondary;
    const items = Array.isArray(item.items) ? item.items : [];
    const itemCount = items.reduce((sum: number, i: any) => sum + (i.quantity || 1), 0);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.refRow}>
            <Ionicons name="receipt-outline" size={16} color={colors.primary} />
            <Text style={styles.refCode}>{item.reference_code || `#${item.order_number}`}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
            <Text style={styles.infoText}>{formatDate(item.delivered_at || item.created_at)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="fast-food-outline" size={14} color={colors.textMuted} />
            <Text style={styles.infoText}>{itemCount} {itemCount === 1 ? 'producto' : 'productos'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={14} color={colors.textMuted} />
            <Text style={styles.infoText} numberOfLines={1}>{item.client_name || 'Cliente'}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatPrice(item.total)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Historial</Text>
        <View style={styles.statsPill}>
          <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
          <Text style={styles.statsText}>{totalDelivered} entregas</Text>
        </View>
      </View>

      {orders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="time-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Sin entregas aún</Text>
          <Text style={styles.emptySubtext}>
            Tus pedidos completados aparecerán aquí
          </Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl + 16,
    paddingBottom: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryFaint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  statsText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  refCode: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { Order } from '../types/database';

async function secureOrders(orderId: string | null, history: boolean): Promise<Order[]> {
  const token = await AsyncStorage.getItem('@pideya_driver_token');
  if (!token) throw new Error('Inicia sesión con el código del negocio.');
  const { data, error } = await supabase.rpc('driver_orders_secure', { p_token: token, p_order_id: orderId, p_history: history });
  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}
export const getAssignedOrders = async (_driverId: string): Promise<Order[]> => (await secureOrders(null, false)).sort((a,b)=>a.created_at.localeCompare(b.created_at));
export const getDeliveryHistory = async (_driverId: string, limit=50): Promise<Order[]> => (await secureOrders(null, true)).slice(0,limit);
export const getOrderById = async (orderId: string): Promise<Order> => {
 const rows=await secureOrders(orderId,false);if(!rows[0])throw new Error('Pedido no asignado o no disponible');return rows[0];
};

/**
 * Suscripción en tiempo real a cambios en pedidos del repartidor.
 */
export const subscribeToDriverOrders = (
  driverId: string,
  callback: (order: Order) => void,
) => {
  const channel = supabase
    .channel(`driver-orders-${driverId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `delivery_driver_id=eq.${driverId}`,
      },
      (payload) => {
        callback(payload.new as Order);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

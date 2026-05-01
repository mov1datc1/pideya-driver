/**
 * Types que coinciden con el schema de Supabase (rancho_eats)
 * Enfocados en la funcionalidad del repartidor
 */

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'ON_THE_WAY'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED';

/**
 * Order item as stored in JSONB. Two formats exist:
 *
 * Legacy (mobile):  { id, name, price, quantity, notes?, options? }
 * Web (rancho_eats): { menu_item_id, name, unit_price, qty, subtotal, option_id?, option_label? }
 *
 * Use `normalizeItem()` from utils/formatters to get a consistent shape.
 */
export interface OrderItemJSON {
  // --- Common ---
  name: string;

  // --- Legacy format ---
  id?: string;
  price?: number;
  quantity?: number;
  notes?: string;
  options?: { label: string; price: number }[];

  // --- Web format ---
  menu_item_id?: string;
  unit_price?: number;
  qty?: number;
  subtotal?: number;
  option_id?: string | null;
  option_label?: string | null;
}

export interface DriverProfile {
  id: string;
  restaurant_id: string;
  user_id: string | null;
  name: string;
  phone: string;
  vehicle_label: string | null;
  avatar_url: string | null;
  notes: string | null;
  is_active: boolean;
  push_token: string | null;
  last_location_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriverLocation {
  driver_id: string;
  order_id: string | null;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  heading: number | null;
  speed_mps: number | null;
  recorded_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_number: number;
  reference_code: string; // PY-XXXXXX
  restaurant_id: string;
  client_name: string | null;
  client_phone: string | null;
  client_lat: number;
  client_lng: number;
  client_location_note: string | null;
  items: OrderItemJSON[];
  total: number;
  subtotal: number | null;
  delivery_amount: number;
  status: OrderStatus;
  delivery_driver_id: string | null;
  delivery_driver_name: string | null;
  delivery_driver_phone: string | null;
  delivery_assigned_at: string | null;
  delivery_started_at: string | null;
  delivered_at: string | null;
  driver_last_lat: number | null;
  driver_last_lng: number | null;
  created_at: string;
  updated_at: string;
}

export interface Restaurant {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  logo_url: string | null;
}

/** Resultado de driver_get_session() */
export interface DriverSession {
  driver: DriverProfile;
  restaurant: Restaurant;
}

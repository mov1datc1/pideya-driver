import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { DriverProfile, Restaurant } from '../types/database';

const DRIVER_TOKEN_KEY = '@pideya_driver_token';
const DRIVER_PROFILE_KEY = '@pideya_driver_profile';

/**
 * Extracts the raw access_token from user input.
 * Handles both:
 *   - Raw token: "77badbc573920b2c7ecc79a92af618ae4fa1"
 *   - Full URL:  "https://rancho-eats.vercel.app/repartidor?token=77badbc573920b2c7ecc79a92af618ae4fa1"
 */
const extractTokenFromInput = (input: string): string => {
  const trimmed = input.trim();
  // If it looks like a URL, try to extract the token query param
  if (trimmed.includes('://') || trimmed.includes('?token=')) {
    try {
      // Handle URLs with or without protocol
      const urlStr = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      const url = new URL(urlStr);
      const tokenParam = url.searchParams.get('token');
      if (tokenParam) return tokenParam.trim();
    } catch {
      // URL parsing failed, try regex fallback
      const match = trimmed.match(/[?&]token=([^&#\s]+)/);
      if (match?.[1]) return match[1].trim();
    }
  }
  return trimmed;
};

// ── Token-based auth (existing system) ──────────────────────

export interface DriverSessionResult {
  driver: DriverProfile;
  restaurant: Restaurant;
}

/**
 * Valida un access_token llamando al RPC driver_get_session.
 * Retorna el perfil del repartidor y su restaurante.
 */
export const loginWithToken = async (
  rawInput: string,
): Promise<DriverSessionResult> => {
  const token = extractTokenFromInput(rawInput);
  if (!token) throw new Error('No se encontró un token válido en el texto ingresado.');

  const { data, error } = await supabase.rpc('driver_get_session', {
    p_access_token: token,
  });

  if (error) throw new Error(error.message);
  if (!data || (Array.isArray(data) && data.length === 0)) {
    throw new Error('Token inválido o repartidor inactivo');
  }

  const row = Array.isArray(data) ? data[0] : data;

  const driver: DriverProfile = {
    id: row.driver_id,
    restaurant_id: row.restaurant_id,
    user_id: row.user_id ?? null,
    name: row.driver_name,
    phone: row.driver_phone,
    vehicle_label: row.vehicle_label ?? null,
    notes: null,
    is_active: row.is_active ?? true,
    push_token: row.push_token ?? null,
    last_location_at: row.last_location_at ?? null,
    created_at: '',
    updated_at: '',
  };

  const restaurant: Restaurant = {
    id: row.restaurant_id,
    name: row.restaurant_name,
    phone: row.restaurant_phone ?? '',
    address: row.restaurant_address ?? null,
    lat: row.restaurant_lat ?? null,
    lng: row.restaurant_lng ?? null,
    logo_url: row.restaurant_logo ?? null,
  };

  // Persist the clean token (not the full URL)
  await AsyncStorage.setItem(DRIVER_TOKEN_KEY, token);
  await AsyncStorage.setItem(
    DRIVER_PROFILE_KEY,
    JSON.stringify({ driver, restaurant }),
  );

  return { driver, restaurant };
};

// ── Phone OTP auth (new - links driver to auth.users) ───────

/**
 * Envía OTP por SMS al teléfono del repartidor.
 */
export const sendPhoneOtp = async (phone: string): Promise<void> => {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw new Error(error.message);
};

/**
 * Verifica el OTP y vincula el user_id al driver_profile.
 */
export const verifyPhoneOtp = async (
  phone: string,
  otp: string,
  driverId: string,
): Promise<void> => {
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token: otp,
    type: 'sms',
  });
  if (error) throw new Error(error.message);

  const userId = data.user?.id;
  if (!userId) throw new Error('No se pudo obtener el usuario');

  // Link user_id to driver_profile
  const { error: updateError } = await supabase
    .from('driver_profiles')
    .update({ user_id: userId })
    .eq('id', driverId);

  if (updateError) {
    console.warn('No se pudo vincular user_id:', updateError.message);
  }
};

// ── Session management ──────────────────────────────────────

/**
 * Recupera la sesión guardada localmente.
 */
export const getSavedSession =
  async (): Promise<DriverSessionResult | null> => {
    try {
      const profileJson = await AsyncStorage.getItem(DRIVER_PROFILE_KEY);
      if (!profileJson) return null;
      return JSON.parse(profileJson) as DriverSessionResult;
    } catch {
      return null;
    }
  };

/**
 * Recupera el token guardado y revalida con el backend.
 */
export const restoreSession =
  async (): Promise<DriverSessionResult | null> => {
    try {
      const token = await AsyncStorage.getItem(DRIVER_TOKEN_KEY);
      if (!token) return null;
      return await loginWithToken(token);
    } catch {
      await clearSession();
      return null;
    }
  };

/**
 * Limpia toda la sesión local.
 */
export const clearSession = async (): Promise<void> => {
  await AsyncStorage.removeItem(DRIVER_TOKEN_KEY);
  await AsyncStorage.removeItem(DRIVER_PROFILE_KEY);
  await supabase.auth.signOut().catch(() => {});
};

/**
 * Guarda el push token en el perfil del repartidor.
 */
export const savePushToken = async (
  driverId: string,
  pushToken: string,
): Promise<void> => {
  const { error } = await supabase
    .from('driver_profiles')
    .update({ push_token: pushToken })
    .eq('id', driverId);

  if (error) console.warn('Error guardando push token:', error.message);
};

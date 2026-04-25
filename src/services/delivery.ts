import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DRIVER_TOKEN_KEY = '@pideya_driver_token';

/**
 * Helper para obtener el token guardado.
 */
const getToken = async (): Promise<string> => {
  const token = await AsyncStorage.getItem(DRIVER_TOKEN_KEY);
  if (!token) throw new Error('No hay sesión activa');
  return token;
};

/**
 * Tomar un pedido: cambia status a ON_THE_WAY.
 * Usa el RPC existente driver_take_order.
 */
export const takeOrder = async (orderId: string): Promise<void> => {
  const token = await getToken();

  const { error } = await supabase.rpc('driver_take_order', {
    p_access_token: token,
    p_order_id: orderId,
  });

  if (error) throw new Error(error.message);
};

/**
 * Upload delivery proof photo to Supabase Storage.
 * Returns the public URL of the uploaded image.
 */
export const uploadDeliveryPhoto = async (
  orderId: string,
  photoUri: string,
): Promise<string> => {
  // Read the file as blob
  const response = await fetch(photoUri);
  const blob = await response.blob();

  const fileName = `${orderId}_${Date.now()}.jpg`;
  const filePath = `deliveries/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('delivery-photos')
    .upload(filePath, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (uploadError) {
    console.warn('Upload error:', uploadError.message);
    // Don't block delivery if photo upload fails
    return '';
  }

  const { data: urlData } = supabase.storage
    .from('delivery-photos')
    .getPublicUrl(filePath);

  return urlData?.publicUrl || '';
};

/**
 * Marcar pedido como entregado, con foto opcional.
 */
export const completeDelivery = async (
  orderId: string,
  photoUrl?: string,
): Promise<void> => {
  const updateData: Record<string, unknown> = {
    status: 'DELIVERED',
    delivered_at: new Date().toISOString(),
  };

  if (photoUrl) {
    updateData.delivery_photo_url = photoUrl;
  }

  const { error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId);

  if (error) throw new Error(error.message);
};

/**
 * Actualizar ubicación del repartidor.
 * Usa el RPC existente driver_update_location.
 */
export const updateDriverLocation = async (params: {
  orderId: string | null;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  heading: number | null;
  speed_mps: number | null;
}): Promise<void> => {
  const token = await getToken();

  const { error } = await supabase.rpc('driver_update_location', {
    p_access_token: token,
    p_order_id: params.orderId,
    p_lat: params.lat,
    p_lng: params.lng,
    p_accuracy_m: params.accuracy_m,
    p_heading: params.heading,
    p_speed_mps: params.speed_mps,
  });

  if (error) {
    console.warn('Error actualizando ubicación:', error.message);
  }
};

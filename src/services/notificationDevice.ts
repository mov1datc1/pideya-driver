import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type { SupabaseClient } from '@supabase/supabase-js';

// Kept identical in the three independently deployed mobile repositories.
export const notificationV2 = process.env.EXPO_PUBLIC_NOTIFICATION_V2 === 'true';
type App = 'client' | 'restaurant' | 'driver';
const key = (app: App) => `@pideya_notification_endpoint_${app}`;
let displayQueue: Promise<unknown> = Promise.resolve();
const displayed = new Set<string>();
export function shouldDisplayEvent(data: Record<string, unknown>): Promise<boolean> {
  const eventId = data.eventId;
  if (typeof eventId !== 'string') return Promise.resolve(true);
  const result = displayQueue.then(async () => {
    if (displayed.has(eventId)) return false;
    let previous: string[] = [];
    try {
      const saved = JSON.parse(await AsyncStorage.getItem('@pideya_displayed_events') || '[]');
      if (Array.isArray(saved)) previous = saved.filter(id => typeof id === 'string');
    } catch {}
    if (previous.includes(eventId)) return false;
    displayed.add(eventId);
    if (displayed.size > 256) displayed.delete(displayed.values().next().value!);
    try { await AsyncStorage.setItem('@pideya_displayed_events', JSON.stringify([...previous.slice(-255), eventId])); } catch {}
    return true;
  });
  displayQueue = result.catch(() => {});
  return result;
}

export async function unregisterNotificationDevice(db: SupabaseClient, app: App, driverToken?: string) {
  const id = await AsyncStorage.getItem(key(app));
  if (!id) return;
  const { error } = await db.rpc('unregister_notification_endpoint', { p_id: id, p_driver_token: driverToken || null });
  if (error) throw error;
  await AsyncStorage.removeItem(key(app));
}

export function watchNotificationDevice(db: SupabaseClient, app: App, userId: string | null, driverToken?: string) {
  if (!notificationV2 || (!userId && !driverToken) || !Device.isDevice) return () => {};
  let disposed = false;
  let running = false;
  let lastSuccess = 0;
  let refreshPending = false;
  let latestNative: Notifications.DevicePushToken | undefined;
  const register = async (nativeToken?: Notifications.DevicePushToken) => {
    if (nativeToken) latestNative = nativeToken;
    if (running) { refreshPending = true; return; }
    if (disposed) return;
    running = true;
    try {
      const channelId = app === 'driver' ? 'deliveries' : app === 'restaurant' ? 'kds_new_order_alarm_v2' : 'default';
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(channelId, {
        name: app === 'restaurant' ? 'Pedidos del negocio' : 'Pedidos y entregas',
        importance: Notifications.AndroidImportance.HIGH, sound: 'default', vibrationPattern: [0, 250, 250, 250],
      });
      let permission = await Notifications.getPermissionsAsync();
      if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        await unregisterNotificationDevice(db, app, driverToken);
        return;
      }
      const provider = process.env.EXPO_PUBLIC_NOTIFICATION_PROVIDER === 'fcm' ? 'fcm' : 'expo';
      if (provider === 'fcm' && Platform.OS !== 'android') throw new Error('Direct FCM rollout currently requires Android');
      const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) throw new Error('Missing EAS projectId');
      const token = provider === 'fcm'
        ? String((latestNative || await Notifications.getDevicePushTokenAsync()).data)
        : (await Notifications.getExpoPushTokenAsync({ projectId, ...(latestNative ? { devicePushToken: latestNative } : {}) })).data;
      if (disposed) return;
      if (userId) {
        const { data } = await db.auth.getUser();
        if (data.user?.id !== userId) return;
      }
      const { data: id, error } = await db.rpc('register_notification_endpoint', {
        p_app: app, p_provider: provider, p_token: token, p_driver_token: driverToken || null,
      });
      if (error) throw error;
      if (disposed) {
        await db.rpc('unregister_notification_endpoint', { p_id: id, p_driver_token: driverToken || null });
        return;
      }
      const previous = await AsyncStorage.getItem(key(app));
      if (previous && previous !== id) await db.rpc('unregister_notification_endpoint', { p_id: previous, p_driver_token: driverToken || null });
      await AsyncStorage.setItem(key(app), id);
      lastSuccess = Date.now();
    } catch {
      console.warn('[Notifications] No se pudo registrar el dispositivo; se reintentará al volver a la app.');
    } finally {
      running = false;
      if (refreshPending && !disposed) { refreshPending = false; void register(latestNative); }
    }
  };
  void register();
  const rotation = Notifications.addPushTokenListener(token => { void register(token); });
  const resume = AppState.addEventListener('change', state => {
    if (state === 'active' && Date.now() - lastSuccess > 60_000) void register();
  });
  return () => { disposed = true; rotation.remove(); resume.remove(); };
}

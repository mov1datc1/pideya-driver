import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import * as deliveryService from '../../services/delivery';
import { colors, spacing, radius } from '../../constants/theme';

export default function ProfileScreen() {
  const { driver, restaurant, logout, updateDriverInfo } = useAuth();
  const [uploading, setUploading] = useState(false);

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Deseas cerrar tu sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: logout,
      },
    ]);
  };

  const handleChangePhoto = async () => {
    try {
      const ImagePicker = require('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permisos', 'Se necesitan permisos para acceder a las fotos.');
        return;
      }

      Alert.alert('Foto de perfil', '¿De dónde quieres seleccionar tu foto?', [
        {
          text: 'Cámara',
          onPress: async () => {
            const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
            if (camStatus !== 'granted') {
              Alert.alert('Permisos', 'Se necesitan permisos de cámara.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.6,
            });
            if (!result.canceled && result.assets[0]) {
              await uploadPhoto(result.assets[0].uri);
            }
          },
        },
        {
          text: 'Galería',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.6,
            });
            if (!result.canceled && result.assets[0]) {
              await uploadPhoto(result.assets[0].uri);
            }
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    } catch (err) {
      console.warn('Photo picker error:', err);
      Alert.alert('Error', 'No se pudo abrir el selector de fotos.');
    }
  };

  const uploadPhoto = async (uri: string) => {
    if (!driver) return;
    setUploading(true);
    try {
      const url = await deliveryService.uploadDriverAvatar(driver.id, uri);
      await deliveryService.updateDriverAvatar(url);
      // Update local state
      if (updateDriverInfo) {
        updateDriverInfo({ avatar_url: url });
      }
      Alert.alert('✅ Listo', 'Tu foto de perfil ha sido actualizada.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo subir la foto.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={handleChangePhoto}
          activeOpacity={0.8}
          disabled={uploading}
        >
          {driver?.avatar_url ? (
            <Image
              source={{ uri: driver.avatar_url }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={styles.avatar}>
              <Ionicons name="person" size={40} color={colors.white} />
            </View>
          )}
          <View style={styles.cameraOverlay}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="camera" size={16} color={colors.white} />
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.photoHint}>Toca para cambiar foto</Text>
        <Text style={styles.name}>{driver?.name}</Text>
        <Text style={styles.phone}>{driver?.phone}</Text>
        {driver?.vehicle_label && (
          <View style={styles.vehicleBadge}>
            <Ionicons name="bicycle" size={14} color={colors.primary} />
            <Text style={styles.vehicleText}>{driver.vehicle_label}</Text>
          </View>
        )}
      </View>

      {/* Restaurant info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Restaurante</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons name="restaurant" size={20} color={colors.primary} />
            <View style={styles.cardRowText}>
              <Text style={styles.cardLabel}>Nombre</Text>
              <Text style={styles.cardValue}>{restaurant?.name}</Text>
            </View>
          </View>
          {restaurant?.phone && (
            <View style={styles.cardRow}>
              <Ionicons name="call" size={20} color={colors.primary} />
              <View style={styles.cardRowText}>
                <Text style={styles.cardLabel}>Teléfono</Text>
                <Text style={styles.cardValue}>{restaurant.phone}</Text>
              </View>
            </View>
          )}
          {restaurant?.address && (
            <View style={styles.cardRow}>
              <Ionicons name="location" size={20} color={colors.primary} />
              <View style={styles.cardRowText}>
                <Text style={styles.cardLabel}>Dirección</Text>
                <Text style={styles.cardValue}>{restaurant.address}</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Account info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cuenta</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons
              name={driver?.user_id ? 'checkmark-circle' : 'alert-circle'}
              size={20}
              color={driver?.user_id ? colors.success : colors.warning}
            />
            <View style={styles.cardRowText}>
              <Text style={styles.cardLabel}>Verificación</Text>
              <Text style={styles.cardValue}>
                {driver?.user_id
                  ? 'Teléfono verificado'
                  : 'Teléfono no verificado'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* App info */}
      <View style={styles.section}>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons
              name="information-circle"
              size={20}
              color={colors.textSecondary}
            />
            <View style={styles.cardRowText}>
              <Text style={styles.cardLabel}>Versión</Text>
              <Text style={styles.cardValue}>1.0.1</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingTop: spacing.xxl + spacing.lg,
    paddingBottom: spacing.xl,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: spacing.sm,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
  },
  phone: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  vehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    marginTop: spacing.md,
    gap: 6,
  },
  vehicleText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  section: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardRowText: { flex: 1 },
  cardLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  cardValue: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.xl,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.danger,
  },
});

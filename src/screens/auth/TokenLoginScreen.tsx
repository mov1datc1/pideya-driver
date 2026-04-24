import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius } from '../../constants/theme';
import type { AuthStackParamList } from '../../types/navigation';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'TokenLogin'>;

export default function TokenLoginScreen() {
  const navigation = useNavigation<Nav>();
  const { loginWithToken } = useAuth();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Ingresa tu token de acceso');
      return;
    }

    setLoading(true);
    try {
      await loginWithToken(trimmed);
      // AuthContext handles navigation via needsPhoneVerify or isAuthenticated
    } catch (err: any) {
      const msg = err.message || 'Token inválido';
      Alert.alert(
        'No se pudo iniciar sesión',
        msg.includes('inválido') || msg.includes('inactivo')
          ? 'El token no es válido o el repartidor está inactivo. Verifica con tu restaurante.'
          : msg,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="bicycle" size={48} color={colors.white} />
        </View>
        <Text style={styles.title}>Pide ya</Text>
        <Text style={styles.subtitle}>Panel de Repartidor</Text>
      </View>

      {/* Form */}
      <View style={styles.card}>
        <Text style={styles.label}>Token de acceso</Text>
        <Text style={styles.hint}>
          Pega el enlace completo o solo el token que te compartió tu restaurante
        </Text>

        <View style={styles.inputRow}>
          <Ionicons
            name="key-outline"
            size={20}
            color={colors.textSecondary}
          />
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            placeholder="URL o token de acceso"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            editable={!loading}
            multiline={false}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="log-in-outline" size={20} color={colors.white} />
              <Text style={styles.buttonText}>Iniciar sesión</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.infoText}>
            Tu restaurante te envía un enlace por WhatsApp cuando te registra
            como repartidor. Puedes pegar el enlace completo o solo el código.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  header: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  hint: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.primaryFaint,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.primaryDark,
    lineHeight: 18,
  },
});

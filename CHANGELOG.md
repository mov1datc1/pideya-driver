# PideYa — App Repartidor — Changelog

## En desarrollo — 2026-10-21: registro durable de notificaciones
- Registro v2 mediante token de repartidor, rotación del dispositivo, canales Android antes del permiso y revocación antes de logout.
- Expo projectId explícito y opción FCM Android. Requiere backend 031/032 y flag EXPO_PUBLIC_NOTIFICATION_V2=true. No activado en producción.

> Package: `com.pideya.repartidores` | Expo SDK 54 | RN 0.81.5

---

## v1.0.2 (vCode 5) — Current Production
- **Play Store**: AAB build activo
- Auth por `access_token` (link desde restaurante)
- Dashboard con pedidos asignados en tiempo real
- GPS background tracking (expo-task-manager + Location.startLocationUpdatesAsync)
- RPC `driver_update_location` con auto-transición ACCEPTED→ON_THE_WAY
- Historial de entregas completadas
- Perfil con datos del repartidor
- `newArchEnabled: false` (estable)
- Permisos: ACCESS_BACKGROUND_LOCATION, FOREGROUND_SERVICE, CAMERA

### Pendientes / Tech Debt
- [ ] No hay builds iOS configurados
- [ ] No hay foto de evidencia de entrega (cámara habilitada pero no implementada)
- [ ] No hay sistema de ganancias/comisiones visible para el repartidor
- [ ] No hay chat con el negocio o cliente

---

## Historial de Builds
| Fecha | Version | vCode | Notas |
|-------|---------|-------|-------|
| Jul 2026 | 1.0.2 | 5 | Versión estable actual en Play Store |

## 2026-10-22

Verificación de código activo antes de consultar pedidos, ámbito repartidor/negocio, FIFO y GPS solo después de verificar entrega ON_THE_WAY. Cinco pruebas de acceso y TypeScript correctos. Pendiente compilar/publicar esta app.

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import DashboardScreen from '../screens/main/DashboardScreen';
import HistoryScreen from '../screens/main/HistoryScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import { colors } from '../constants/theme';
import type { MainTabParamList } from '../types/navigation';

const Tab = createBottomTabNavigator<MainTabParamList>();

const tabConfig: Record<
  keyof MainTabParamList,
  { label: string; icon: keyof typeof Ionicons.glyphMap; iconOutline: keyof typeof Ionicons.glyphMap }
> = {
  DashboardTab: {
    label: 'Pedidos',
    icon: 'receipt',
    iconOutline: 'receipt-outline',
  },
  HistoryTab: {
    label: 'Historial',
    icon: 'time',
    iconOutline: 'time-outline',
  },
  ProfileTab: {
    label: 'Perfil',
    icon: 'person',
    iconOutline: 'person-outline',
  },
};

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused, color, size }) => {
          const cfg = tabConfig[route.name];
          const iconName = focused ? cfg.icon : cfg.iconOutline;
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarLabel: tabConfig[route.name].label,
      })}
    >
      <Tab.Screen name="DashboardTab" component={DashboardScreen} />
      <Tab.Screen name="HistoryTab" component={HistoryScreen} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

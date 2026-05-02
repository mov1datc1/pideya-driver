import type { Order } from './database';

export type AuthStackParamList = {
  TokenLogin: undefined;
  PhoneVerify: {
    driverId: string;
    driverPhone: string;
    driverName: string;
  };
};

export type MainTabParamList = {
  DashboardTab: undefined;
  HistoryTab: undefined;
  ProfileTab: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  OrderDetail: { orderId: string };
  ActiveDelivery: { orderId: string };
};

// Utility for navigation typing
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

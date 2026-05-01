import React, { createContext, useContext, useEffect, useState } from 'react';
import type { DriverProfile, Restaurant } from '../types/database';
import * as authService from '../services/auth';
import { setupPushNotifications } from '../services/notifications';

interface AuthState {
  driver: DriverProfile | null;
  restaurant: Restaurant | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsPhoneVerify: boolean;
}

interface AuthContextValue extends AuthState {
  loginWithToken: (token: string) => Promise<void>;
  completePhoneVerify: () => void;
  updateDriverInfo: (updates: Partial<DriverProfile>) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<AuthState>({
    driver: null,
    restaurant: null,
    isLoading: true,
    isAuthenticated: false,
    needsPhoneVerify: false,
  });

  // Restore session on app start
  useEffect(() => {
    (async () => {
      try {
        const session = await authService.restoreSession();
        if (session) {
          setState({
            driver: session.driver,
            restaurant: session.restaurant,
            isLoading: false,
            isAuthenticated: true,
            needsPhoneVerify: !session.driver.user_id,
          });

          if (session.driver.user_id) {
            setupPushNotifications(session.driver.id).catch(console.warn);
          }
        } else {
          setState((s) => ({ ...s, isLoading: false }));
        }
      } catch {
        setState((s) => ({ ...s, isLoading: false }));
      }
    })();
  }, []);

  const loginWithToken = async (token: string) => {
    const session = await authService.loginWithToken(token);

    setState({
      driver: session.driver,
      restaurant: session.restaurant,
      isLoading: false,
      isAuthenticated: true,
      needsPhoneVerify: !session.driver.user_id,
    });

    // Setup push if already verified
    if (session.driver.user_id) {
      setupPushNotifications(session.driver.id).catch(console.warn);
    }
  };

  const completePhoneVerify = () => {
    setState((s) => ({
      ...s,
      isAuthenticated: true,
      needsPhoneVerify: false,
    }));

    if (state.driver) {
      setupPushNotifications(state.driver.id).catch(console.warn);
    }
  };

  const updateDriverInfo = (updates: Partial<DriverProfile>) => {
    setState((s) => ({
      ...s,
      driver: s.driver ? { ...s.driver, ...updates } : null,
    }));
  };

  const logout = async () => {
    await authService.clearSession();
    setState({
      driver: null,
      restaurant: null,
      isLoading: false,
      isAuthenticated: false,
      needsPhoneVerify: false,
    });
  };

  return (
    <AuthContext.Provider
      value={{ ...state, loginWithToken, completePhoneVerify, updateDriverInfo, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

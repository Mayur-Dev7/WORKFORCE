import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, PermissionKey, ApiResponse } from '@workforce/shared';
import { api, setAccessToken, getAccessToken } from '../services/api.js';
import { firebaseLogin, firebaseGoogleLogin } from '../features/firebase-auth/firebaseAuthAdapter.js';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (identifier: string, password: string, coords?: { lat: number; lon: number }) => Promise<User>;
  loginWithGoogle?: (onLinkPasswordRequired?: (email: string) => Promise<string>) => Promise<User>;

  logout: () => Promise<void>;
  leaveCompany?: () => Promise<void>;
  hasPermission: (permission: PermissionKey) => boolean;
  hasAnyPermission: (permissions: PermissionKey[]) => boolean;
  refreshUser: () => Promise<User | null>;
}


const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user_info');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const token = getAccessToken();
      if (!token) {
        setUser(null);
        localStorage.removeItem('user_info');
        setLoading(false);
        return null;
      }
      const res = await api.get<ApiResponse<User>>('/auth/me');
      const freshUser = res.data.data;
      setUser(freshUser);
      localStorage.setItem('user_info', JSON.stringify(freshUser));
      return freshUser;
    } catch {
      setUser(null);
      localStorage.removeItem('user_info');
      setAccessToken(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();

    const handleOfficeUpdated = () => {
      refreshUser();
    };

    window.addEventListener('workforce:office_updated', handleOfficeUpdated);
    return () => {
      window.removeEventListener('workforce:office_updated', handleOfficeUpdated);
    };
  }, [refreshUser]);

  const login = async (
    identifier: string,
    password: string,
    coords?: { lat: number; lon: number }
  ): Promise<User> => {
    const authProvider = (import.meta.env.VITE_AUTH_PROVIDER || 'legacy').toLowerCase().trim();

    let accessToken: string;
    let loggedInUser: User;

    if (authProvider !== 'legacy') {
      const result = await firebaseLogin(identifier, password, coords);
      accessToken = result.accessToken;
      loggedInUser = result.user;
    } else {

      const res = await api.post<ApiResponse<{ accessToken: string; user: User }>>('/auth/login', {
        identifier,
        password,
        latitude: coords?.lat,
        longitude: coords?.lon,
      });
      accessToken = res.data.data.accessToken;
      loggedInUser = res.data.data.user;
    }

    setAccessToken(accessToken);
    setUser(loggedInUser);
    localStorage.setItem('user_info', JSON.stringify(loggedInUser));
    return loggedInUser;
  };

  const loginWithGoogle = async (
    onLinkPasswordRequired?: (email: string) => Promise<string>
  ): Promise<User> => {
    const authProvider = (import.meta.env.VITE_AUTH_PROVIDER || 'legacy').toLowerCase().trim();
    if (authProvider === 'legacy') {
      throw new Error('Google sign-in is not supported in legacy authentication mode');
    }

    const result = await firebaseGoogleLogin(onLinkPasswordRequired);
    setAccessToken(result.accessToken);
    setUser(result.user);
    localStorage.setItem('user_info', JSON.stringify(result.user));
    return result.user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    } finally {
      setAccessToken(null);
      setUser(null);
      localStorage.removeItem('user_info');
    }
  };

  const leaveCompany = async () => {
    await api.post('/companies/leave');
    await refreshUser();
  };

  const hasPermission = (permission: PermissionKey): boolean => {
    if (!user || !user.permissions) return false;
    return user.permissions.includes(permission);
  };

  const hasAnyPermission = (permissions: PermissionKey[]): boolean => {
    if (!user || !user.permissions) return false;
    return permissions.some((p) => user.permissions?.includes(p));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        loginWithGoogle,
        logout,
        leaveCompany,
        hasPermission,
        hasAnyPermission,
        refreshUser,
      }}
    >

      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

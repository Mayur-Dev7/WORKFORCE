import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, PermissionKey, ApiResponse } from '@workforce/shared';
import { api, setAccessToken, getAccessToken } from '../services/api.js';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (identifier: string, password: string, coords?: { lat: number; lon: number }) => Promise<User>;
  logout: () => Promise<void>;
  hasPermission: (permission: PermissionKey) => boolean;
  hasAnyPermission: (permissions: PermissionKey[]) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user_info');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const token = getAccessToken();
      if (!token) {
        setUser(null);
        localStorage.removeItem('user_info');
        setLoading(false);
        return;
      }
      const res = await api.get<ApiResponse<User>>('/auth/me');
      setUser(res.data.data);
      localStorage.setItem('user_info', JSON.stringify(res.data.data));
    } catch {
      setUser(null);
      localStorage.removeItem('user_info');
      setAccessToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (
    identifier: string,
    password: string,
    coords?: { lat: number; lon: number }
  ): Promise<User> => {
    const res = await api.post<ApiResponse<{ accessToken: string; user: User }>>('/auth/login', {
      identifier,
      password,
      latitude: coords?.lat,
      longitude: coords?.lon,
    });

    const { accessToken, user: loggedInUser } = res.data.data;
    setAccessToken(accessToken);
    setUser(loggedInUser);
    localStorage.setItem('user_info', JSON.stringify(loggedInUser));
    return loggedInUser;
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
        logout,
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

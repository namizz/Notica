"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setAccessToken } from '../lib/api';

export interface User {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  isTwoFactorEnabled: boolean;
  authProvider: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ mfaRequired?: boolean; user?: User; accessToken?: string }>;
  register: (email: string, password: string, companyName: string) => Promise<{ user: User; accessToken: string; project: { id: string; name: string; apiKeyPrefix: string; apiKey: string } }>;
  mfaAuthenticate: (email: string, code: string) => Promise<{ user: User; accessToken: string }>;
  logout: () => Promise<void>;
  setOAuthSession: (data: { accessToken: string; refreshToken: string; user: User }) => void;
  forgotPassword: (email: string) => Promise<{ message: string; token?: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<{ message: string }>;
  updateUser: (updatedFields: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize and check for existing session
  useEffect(() => {
    async function initializeAuth() {
      const storedRefreshToken = localStorage.getItem('refreshToken');
      const storedUser = localStorage.getItem('user');

      if (storedRefreshToken && storedUser) {
        try {
          // Attempt silent refresh to acquire new access token on boot
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: storedRefreshToken }),
          });

          if (res.ok) {
            const data = await res.json();
            setAccessToken(data.accessToken);
            setUser(data.user);
            localStorage.setItem('refreshToken', data.refreshToken);
            localStorage.setItem('user', JSON.stringify(data.user));
          } else {
            // Token expired/invalid
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            setAccessToken(null);
            setUser(null);
          }
        } catch (e) {
          console.error('Silent refresh failed during initialization', e);
          // Keep local user details for fallback or clear depending on strictness
          setUser(JSON.parse(storedUser));
        }
      }
      setLoading(false);
    }

    initializeAuth();

    // Event listeners for token updates and expiration from API client
    const handleRefreshed = (e: Event) => {
      const { user: updatedUser, accessToken: updatedToken } = (e as CustomEvent).detail;
      setAccessToken(updatedToken);
      setUser(updatedUser);
    };

    const handleExpired = () => {
      setAccessToken(null);
      setUser(null);
    };

    window.addEventListener('auth-token-refreshed', handleRefreshed);
    window.addEventListener('auth-session-expired', handleExpired);

    return () => {
      window.removeEventListener('auth-token-refreshed', handleRefreshed);
      window.removeEventListener('auth-session-expired', handleExpired);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password }, { skipAuth: true });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Login failed');
    }

    const data = await res.json();

    if (data.mfaRequired) {
      return { mfaRequired: true };
    }

    // Save tokens and session details
    setAccessToken(data.accessToken);
    setUser(data.user);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));

    return { user: data.user, accessToken: data.accessToken };
  };

  const register = async (email: string, password: string, companyName: string) => {
    const res = await api.post('/auth/register', { email, password, companyName }, { skipAuth: true });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Registration failed');
    }

    const data = await res.json();

    // Save tokens and session details
    setAccessToken(data.accessToken);
    setUser(data.user);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));

    return {
      user: data.user,
      accessToken: data.accessToken,
      project: data.project,
    };
  };

  const mfaAuthenticate = async (email: string, code: string) => {
    const res = await api.post('/auth/2fa/authenticate', { email, code }, { skipAuth: true });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Verification failed');
    }

    const data = await res.json();

    // Save tokens and session details
    setAccessToken(data.accessToken);
    setUser(data.user);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));

    return { user: data.user, accessToken: data.accessToken };
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error('Logout request failed', e);
    } finally {
      // Clear client session anyway
      setAccessToken(null);
      setUser(null);
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  };

  const setOAuthSession = (data: { accessToken: string; refreshToken: string; user: User }) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const forgotPassword = async (email: string) => {
    const res = await api.post('/auth/forgot-password', { email }, { skipAuth: true });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Forgot password failed');
    }
    return res.json();
  };

  const resetPassword = async (token: string, newPassword: string) => {
    const res = await api.post('/auth/reset-password', { token, newPassword }, { skipAuth: true });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Reset password failed');
    }
    return res.json();
  };

  const updateUser = (updatedFields: Partial<User>) => {
    if (!user) return;
    const newUser = { ...user, ...updatedFields };
    setUser(newUser);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        mfaAuthenticate,
        logout,
        setOAuthSession,
        forgotPassword,
        resetPassword,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

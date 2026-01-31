'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getDeviceFingerprint, DeviceInfo } from './deviceFingerprint';

interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  signup: (email: string, password: string, name: string, role?: string) => Promise<{ success: boolean; message: string }>;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; message: string; role?: string; user?: User }>;
  verifyEmail: (email: string, code: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message: string }>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  requestChangePassword: () => Promise<{ success: boolean; message: string }>;
  changePassword: (code: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  updateProfile: (name: string) => Promise<{ success: boolean; user: User }>;
  refreshUser: () => Promise<void>;
  resendVerificationCode: (email: string) => Promise<{ success: boolean; message: string }>;
  deleteAccount: () => Promise<{ success: boolean; message: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function apiCall<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string>),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || error.message || `API Error: ${response.statusText}`);
  }

  return response.json();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      const storedToken = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const storedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      const storedRole = typeof window !== 'undefined' ? localStorage.getItem('user_role') : null;
      const rememberMe = typeof window !== 'undefined' ? localStorage.getItem('remember_me') === 'true' : false;

      if (storedToken && storedUser && rememberMe) {
        try {
          // Verify token is still valid
          const response = await fetch(`${API_URL}/auth/me`, {
            headers: {
              Authorization: `Bearer ${storedToken}`,
            },
          });

          if (response.ok) {
            const userData = JSON.parse(storedUser);
            if (storedRole && !userData.role) {
              userData.role = storedRole;
            }
            setToken(storedToken);
            setUser(userData);

            // Auto-redirect to dashboard if on auth page
            const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
            if (currentPath === '/auth' || currentPath === '/') {
              const redirectPath = userData.role === 'student' ? '/student/dashboard' : '/dashboard';
              router.push(redirectPath);
            }
          } else {
            // Token invalid, clear everything
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            localStorage.removeItem('user_role');
            localStorage.removeItem('remember_me');
          }
        } catch (error) {
          console.error('Session check error:', error);
          localStorage.removeItem('access_token');
          localStorage.removeItem('user');
          localStorage.removeItem('user_role');
          localStorage.removeItem('remember_me');
        }
      } else if (storedToken && storedUser) {
        // User logged in but didn't check remember me - still set state but don't auto-redirect
        try {
          const userData = JSON.parse(storedUser);
          if (storedRole && !userData.role) {
            userData.role = storedRole;
          }
          setToken(storedToken);
          setUser(userData);
        } catch (error) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('user');
          localStorage.removeItem('user_role');
        }
      }
      
      setLoading(false);
    };

    checkExistingSession();
  }, [router]);

  const signup = async (email: string, password: string, name: string, role: string = 'teacher') => {
    try {
      const endpoint = role === 'student' ? '/auth/student/signup' : '/auth/signup';

      // Only collect device fingerprint for students
      let deviceInfo = null;
      if (role === 'student') {
        deviceInfo = await getDeviceFingerprint();
        console.log('📱 Student signup - Device fingerprint collected:', deviceInfo);
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('pending_signup_role', role);
      }

      const body: any = { email, password, name, role };

      // Only add device info for students
      if (role === 'student' && deviceInfo) {
        body.device_id = deviceInfo.id;
        body.device_info = deviceInfo;
      }

      const response = await apiCall(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      return { success: true, message: 'Verification code sent to your email' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Signup failed' };
    }
  };

  const login = async (email: string, password: string, rememberMe: boolean = false) => {
    try {
      let response: any;
      let role: string = 'teacher';
      let deviceInfo: DeviceInfo | null = null;

      // Try teacher login first (NO device fingerprinting)
      try {
        console.log('🔍 Attempting teacher login...');
        response = await apiCall('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        role = 'teacher';
        console.log('✅ Teacher login successful');
      } catch (teacherError: any) {
        // Try student login WITH device fingerprinting
        try {
          console.log('🔍 Attempting student login...');
          deviceInfo = await getDeviceFingerprint();
          console.log('📱 Student login - Device fingerprint:', deviceInfo);

          response = await apiCall('/auth/student/login', {
            method: 'POST',
            body: JSON.stringify({
              email,
              password,
              device_id: deviceInfo.id,
              device_info: deviceInfo,
            }),
          });
          role = 'student';
          console.log('✅ Student login successful');
        } catch (studentError: any) {
          // Check if it's a device authorization error
          if (studentError.message.includes('not authorized') ||
            studentError.message.includes('trusted device')) {
            throw new Error('🚫 Login blocked: This device is not authorized. Please use the trusted device that was used to create this student account.');
          }
          throw new Error('Invalid email or password');
        }
      }

      // Save login data
      const userData = { ...response.user, role };

      localStorage.setItem('access_token', response.access_token);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('user_role', role);
      localStorage.setItem('remember_me', rememberMe.toString());

      setToken(response.access_token);
      setUser(userData);

      console.log(`✅ Login successful - Remember Me: ${rememberMe}`);

      return {
        success: true,
        message: 'Login successful',
        role: role,
        user: userData
      };
    } catch (error: any) {
      return { success: false, message: error.message || 'Login failed' };
    }
  };

  const verifyEmail = async (email: string, code: string) => {
    try {
      const pendingRole = typeof window !== 'undefined' ? localStorage.getItem('pending_signup_role') : null;
      const role = pendingRole || 'teacher';
      const endpoint = role === 'student' ? '/auth/student/verify-email' : '/auth/verify-email';

      const response = await apiCall(endpoint, {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      });

      const userData = { ...response.user, role: response.user.role || role };

      localStorage.setItem('access_token', response.access_token);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('user_role', userData.role);
      // Set remember_me to true by default after signup verification
      localStorage.setItem('remember_me', 'true');

      if (typeof window !== 'undefined') {
        localStorage.removeItem('pending_signup_role');
      }

      setToken(response.access_token);
      setUser(userData);

      return { success: true, message: 'Email verified successfully' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Verification failed' };
    }
  };

  const resendVerificationCode = async (email: string) => {
    try {
      const response = await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true, message: data.message || 'Verification code resent successfully' };
      } else {
        let errorMessage = 'Failed to resend verification code';
        if (data.detail) {
          if (typeof data.detail === 'string') {
            errorMessage = data.detail;
          } else if (Array.isArray(data.detail)) {
            errorMessage = data.detail
              .map((err: any) => {
                if (typeof err === 'string') return err;
                if (err.msg) return err.msg;
                return 'Validation error';
              })
              .join(', ');
          } else if (typeof data.detail === 'object') {
            errorMessage = data.detail.msg || JSON.stringify(data.detail);
          }
        }
        return { success: false, message: errorMessage };
      }
    } catch (error: any) {
      console.error('Resend verification error:', error);
      return { success: false, message: error?.message || 'An error occurred while resending the code' };
    }
  };

  const requestPasswordReset = async (email: string) => {
    try {
      const response = await apiCall('/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      return { success: true, message: 'Reset code sent to your email' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Request failed' };
    }
  };

  const resetPassword = async (email: string, code: string, newPassword: string) => {
    try {
      await apiCall('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code, new_password: newPassword }),
      });
      return { success: true, message: 'Password reset successfully' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Reset failed' };
    }
  };

  const requestChangePassword = async () => {
    try {
      const response = await apiCall('/auth/request-change-password', {
        method: 'POST',
      });
      return { success: true, message: 'Verification code sent to your email' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Request failed' };
    }
  };

  const changePassword = async (code: string, newPassword: string) => {
    try {
      await apiCall('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ code, new_password: newPassword }),
      });
      return { success: true, message: 'Password changed successfully' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Change failed' };
    }
  };

  const updateProfile = async (name: string) => {
    try {
      const response = await apiCall('/auth/update-profile', {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });

      const updatedUser = { ...user!, name: response.name };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));

      return { success: true, user: updatedUser };
    } catch (error: any) {
      return { success: false, user: user! };
    }
  };

  const refreshUser = async () => {
    try {
      const response = await apiCall('/auth/me');
      const updatedUser = {
        id: response.id,
        email: response.email,
        name: response.name,
        role: response.role || user?.role,
      };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  const logout = async () => {
    try {
      await apiCall('/auth/logout', {
        method: 'POST',
      });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      // Clear ALL session data including remember_me
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      localStorage.removeItem('user_role');
      localStorage.removeItem('pending_signup_role');
      localStorage.removeItem('remember_me');
      setToken(null);
      setUser(null);
    }
  };

  const deleteAccount = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const endpoint = user?.role === 'student' ? '/auth/student/delete-account' : '/auth/delete-account';
      await apiCall(endpoint, {
        method: 'DELETE',
      });

      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      localStorage.removeItem('user_role');
      localStorage.removeItem('pending_signup_role');
      localStorage.removeItem('remember_me');
      setToken(null);
      setUser(null);

      return { success: true, message: 'Account deleted successfully' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Delete failed' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        signup,
        login,
        verifyEmail,
        logout,
        isAuthenticated: !!token,
        requestPasswordReset,
        resetPassword,
        requestChangePassword,
        changePassword,
        updateProfile,
        refreshUser,
        resendVerificationCode,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export async function apiCallWithAuth(endpoint: string, options: RequestInit = {}) {
  return apiCall(endpoint, options);
}
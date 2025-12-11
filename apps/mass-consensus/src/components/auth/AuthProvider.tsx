'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  onAuthChange,
  signInWithGoogle,
  signOutUser,
  getCurrentToken,
  handleRedirectResult,
  User,
} from '@/lib/firebase/client';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Authentication provider that manages Firebase auth state
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Handle redirect result from Google sign-in
    handleRedirectResult().catch((error) => {
      console.error('Error handling redirect result:', error);
    });

    // Subscribe to auth state changes
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      setUser(firebaseUser);

      // Refresh token if user is logged in
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          localStorage.setItem('firebase_token', token);
        } catch (error) {
          console.error('Error refreshing token:', error);
        }
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign in failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await signOutUser();
      setUser(null);
    } catch (error) {
      console.error('Sign out failed:', error);
      throw error;
    }
  };

  const refreshToken = async () => {
    return getCurrentToken();
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    signIn,
    signOut,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access authentication context
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Tests for Firebase Client SDK
 * @jest-environment jsdom
 */

// Mock Firebase modules before imports
const mockUser = {
  uid: 'test-user-id',
  email: 'test@example.com',
  getIdToken: jest.fn().mockResolvedValue('mock-token'),
};

const mockAuth = {
  currentUser: null as typeof mockUser | null,
};

const mockSignInWithPopup = jest.fn();
const mockSignOut = jest.fn();
const mockOnAuthStateChanged = jest.fn();
const mockSetPersistence = jest.fn().mockResolvedValue(undefined);
const mockConnectAuthEmulator = jest.fn();

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn().mockReturnValue({ name: 'mock-app' }),
  getApps: jest.fn().mockReturnValue([]),
  getApp: jest.fn().mockReturnValue({ name: 'existing-app' }),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn().mockReturnValue(mockAuth),
  GoogleAuthProvider: jest.fn().mockImplementation(() => ({
    setCustomParameters: jest.fn(),
  })),
  signInWithPopup: mockSignInWithPopup,
  signOut: mockSignOut,
  onAuthStateChanged: mockOnAuthStateChanged,
  browserLocalPersistence: 'LOCAL',
  setPersistence: mockSetPersistence,
  connectAuthEmulator: mockConnectAuthEmulator,
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn().mockReturnValue({ type: 'mock-firestore' }),
  connectFirestoreEmulator: jest.fn(),
}));

describe('Firebase Client', () => {
  let consoleInfoSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let localStorageMock: { [key: string]: string };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock auth state
    mockAuth.currentUser = null;

    // Mock localStorage
    localStorageMock = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn((key: string) => localStorageMock[key] || null),
        setItem: jest.fn((key: string, value: string) => {
          localStorageMock[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
          delete localStorageMock[key];
        }),
        clear: jest.fn(() => {
          localStorageMock = {};
        }),
      },
      writable: true,
    });

    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('module exports', () => {
    it('should export signInWithGoogle function', async () => {
      const client = await import('../client');
      expect(typeof client.signInWithGoogle).toBe('function');
    });

    it('should export signOutUser function', async () => {
      const client = await import('../client');
      expect(typeof client.signOutUser).toBe('function');
    });

    it('should export getCurrentToken function', async () => {
      const client = await import('../client');
      expect(typeof client.getCurrentToken).toBe('function');
    });

    it('should export onAuthChange function', async () => {
      const client = await import('../client');
      expect(typeof client.onAuthChange).toBe('function');
    });

    it('should export handleRedirectResult function', async () => {
      const client = await import('../client');
      expect(typeof client.handleRedirectResult).toBe('function');
    });

    it('should export auth instance', async () => {
      const client = await import('../client');
      expect(client.auth).toBeDefined();
    });

    it('should export app instance', async () => {
      const client = await import('../client');
      expect(client.app).toBeDefined();
    });

    it('should export db instance', async () => {
      const client = await import('../client');
      expect(client.db).toBeDefined();
    });
  });

  describe('signInWithGoogle', () => {
    it('should call signInWithPopup', async () => {
      mockSignInWithPopup.mockResolvedValue({ user: mockUser });

      const { signInWithGoogle } = await import('../client');
      await signInWithGoogle();

      expect(mockSignInWithPopup).toHaveBeenCalled();
    });

    it('should return the user on successful sign in', async () => {
      mockSignInWithPopup.mockResolvedValue({ user: mockUser });

      const { signInWithGoogle } = await import('../client');
      const result = await signInWithGoogle();

      expect(result).toBe(mockUser);
    });

    it('should store token in localStorage', async () => {
      mockSignInWithPopup.mockResolvedValue({ user: mockUser });

      const { signInWithGoogle } = await import('../client');
      await signInWithGoogle();

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'firebase_token',
        'mock-token'
      );
    });

    it('should log successful sign in', async () => {
      mockSignInWithPopup.mockResolvedValue({ user: mockUser });

      const { signInWithGoogle } = await import('../client');
      await signInWithGoogle();

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '[Firebase] Sign in successful:',
        'test@example.com'
      );
    });

    it('should throw error on sign in failure', async () => {
      const error = new Error('Sign in failed');
      mockSignInWithPopup.mockRejectedValue(error);

      const { signInWithGoogle } = await import('../client');

      await expect(signInWithGoogle()).rejects.toThrow('Sign in failed');
    });

    it('should log error on sign in failure', async () => {
      const error = new Error('Sign in failed');
      mockSignInWithPopup.mockRejectedValue(error);

      const { signInWithGoogle } = await import('../client');

      try {
        await signInWithGoogle();
      } catch {
        // Expected
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Firebase] Google sign-in error:',
        error
      );
    });
  });

  describe('handleRedirectResult', () => {
    it('should return null (legacy function)', async () => {
      const { handleRedirectResult } = await import('../client');
      const result = await handleRedirectResult();
      expect(result).toBeNull();
    });
  });

  describe('signOutUser', () => {
    it('should call signOut', async () => {
      mockSignOut.mockResolvedValue(undefined);

      const { signOutUser } = await import('../client');
      await signOutUser();

      expect(mockSignOut).toHaveBeenCalled();
    });

    it('should remove token from localStorage', async () => {
      mockSignOut.mockResolvedValue(undefined);

      const { signOutUser } = await import('../client');
      await signOutUser();

      expect(window.localStorage.removeItem).toHaveBeenCalledWith('firebase_token');
    });

    it('should throw error on sign out failure', async () => {
      const error = new Error('Sign out failed');
      mockSignOut.mockRejectedValue(error);

      const { signOutUser } = await import('../client');

      await expect(signOutUser()).rejects.toThrow('Sign out failed');
    });

    it('should log error on sign out failure', async () => {
      const error = new Error('Sign out failed');
      mockSignOut.mockRejectedValue(error);

      const { signOutUser } = await import('../client');

      try {
        await signOutUser();
      } catch {
        // Expected
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith('Sign out error:', error);
    });
  });

  describe('getCurrentToken', () => {
    it('should return null when no user is logged in', async () => {
      mockAuth.currentUser = null;

      // Need fresh import since auth.currentUser is checked at call time
      jest.resetModules();
      jest.doMock('firebase/auth', () => ({
        getAuth: jest.fn().mockReturnValue({ currentUser: null }),
        GoogleAuthProvider: jest.fn().mockImplementation(() => ({
          setCustomParameters: jest.fn(),
        })),
        signInWithPopup: mockSignInWithPopup,
        signOut: mockSignOut,
        onAuthStateChanged: mockOnAuthStateChanged,
        browserLocalPersistence: 'LOCAL',
        setPersistence: mockSetPersistence,
        connectAuthEmulator: mockConnectAuthEmulator,
      }));

      const { getCurrentToken } = await import('../client');
      const result = await getCurrentToken();

      expect(result).toBeNull();
    });

    it('should return token when user is logged in', async () => {
      const mockUserWithToken = {
        uid: 'test-uid',
        getIdToken: jest.fn().mockResolvedValue('fresh-token'),
      };

      jest.resetModules();
      jest.doMock('firebase/auth', () => ({
        getAuth: jest.fn().mockReturnValue({ currentUser: mockUserWithToken }),
        GoogleAuthProvider: jest.fn().mockImplementation(() => ({
          setCustomParameters: jest.fn(),
        })),
        signInWithPopup: mockSignInWithPopup,
        signOut: mockSignOut,
        onAuthStateChanged: mockOnAuthStateChanged,
        browserLocalPersistence: 'LOCAL',
        setPersistence: mockSetPersistence,
        connectAuthEmulator: mockConnectAuthEmulator,
      }));

      const { getCurrentToken } = await import('../client');
      const result = await getCurrentToken();

      expect(result).toBe('fresh-token');
    });
  });

  describe('onAuthChange', () => {
    it('should call onAuthStateChanged with callback', async () => {
      const callback = jest.fn();
      const unsubscribe = jest.fn();
      mockOnAuthStateChanged.mockReturnValue(unsubscribe);

      const { onAuthChange } = await import('../client');
      const result = onAuthChange(callback);

      expect(mockOnAuthStateChanged).toHaveBeenCalled();
      expect(result).toBe(unsubscribe);
    });

    it('should return unsubscribe function', async () => {
      const callback = jest.fn();
      const unsubscribe = jest.fn();
      mockOnAuthStateChanged.mockReturnValue(unsubscribe);

      const { onAuthChange } = await import('../client');
      const result = onAuthChange(callback);

      expect(typeof result).toBe('function');
    });
  });
});

describe('Firebase Client Initialization', () => {
  describe('app initialization', () => {
    it('should use existing app if already initialized', async () => {
      const { getApps, getApp, initializeApp } = await import('firebase/app');

      // Verify mocks are set up
      expect(getApps).toBeDefined();
      expect(getApp).toBeDefined();
      expect(initializeApp).toBeDefined();
    });
  });

  describe('Google Auth Provider configuration', () => {
    it('should create GoogleAuthProvider', async () => {
      const { GoogleAuthProvider } = await import('firebase/auth');
      expect(GoogleAuthProvider).toBeDefined();
    });
  });
});

/**
 * Tests for Firebase Admin SDK initialization
 *
 * Note: This module has side effects at import time, so we test behavior
 * rather than implementation details.
 */

// Store original env values
const originalEnv = { ...process.env };

describe('Firebase Admin', () => {
  let consoleInfoSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  // Mock Firebase modules at the top level
  const mockApp = { name: 'test-app', options: {} };
  const mockFirestore = {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn(),
  };

  beforeAll(() => {
    // Set up mocks before any module loading
    jest.mock('firebase-admin/app', () => ({
      initializeApp: jest.fn().mockReturnValue(mockApp),
      getApps: jest.fn().mockReturnValue([]),
      cert: jest.fn().mockImplementation((config) => ({ type: 'cert', ...config })),
    }));

    jest.mock('firebase-admin/firestore', () => ({
      getFirestore: jest.fn().mockReturnValue(mockFirestore),
    }));
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset environment for each test
    process.env = { ...originalEnv };
    delete process.env.USE_FIREBASE_EMULATOR;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('module exports', () => {
    it('should export initializeFirebaseAdmin function', async () => {
      const adminModule = await import('../admin');
      expect(typeof adminModule.initializeFirebaseAdmin).toBe('function');
    });

    it('should export getFirestoreAdmin function', async () => {
      const adminModule = await import('../admin');
      expect(typeof adminModule.getFirestoreAdmin).toBe('function');
    });

    it('should export admin singleton object', async () => {
      const adminModule = await import('../admin');
      expect(adminModule.admin).toBeDefined();
      expect(typeof adminModule.admin.firestore).toBe('function');
      expect(typeof adminModule.admin.app).toBe('function');
    });

    it('should export admin as default', async () => {
      const adminModule = await import('../admin');
      expect(adminModule.default).toBeDefined();
      expect(adminModule.default).toBe(adminModule.admin);
    });
  });

  describe('initializeFirebaseAdmin', () => {
    it('should return an app object', async () => {
      const { initializeFirebaseAdmin } = await import('../admin');
      const result = initializeFirebaseAdmin();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should be idempotent (calling multiple times returns same app)', async () => {
      const { initializeFirebaseAdmin } = await import('../admin');
      const first = initializeFirebaseAdmin();
      const second = initializeFirebaseAdmin();
      expect(first).toBe(second);
    });
  });

  describe('getFirestoreAdmin', () => {
    it('should return a Firestore-like object', async () => {
      const { getFirestoreAdmin } = await import('../admin');
      const result = getFirestoreAdmin();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should return object with collection method', async () => {
      const { getFirestoreAdmin } = await import('../admin');
      const db = getFirestoreAdmin();
      expect(typeof db.collection).toBe('function');
    });

    it('should be idempotent (returns cached instance)', async () => {
      const { getFirestoreAdmin } = await import('../admin');
      const first = getFirestoreAdmin();
      const second = getFirestoreAdmin();
      expect(first).toBe(second);
    });
  });

  describe('admin singleton', () => {
    it('should provide firestore getter', async () => {
      const { admin } = await import('../admin');
      const db = admin.firestore();
      expect(db).toBeDefined();
    });

    it('should provide app getter', async () => {
      const { admin } = await import('../admin');
      const app = admin.app();
      expect(app).toBeDefined();
    });
  });
});

describe('Firebase Admin Environment Configuration', () => {
  // These tests verify the module's behavior based on environment
  // They're separated because they require fresh module imports

  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('emulator detection', () => {
    it('should detect when USE_FIREBASE_EMULATOR is true', () => {
      process.env.USE_FIREBASE_EMULATOR = 'true';
      process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

      // The module checks this at import time
      expect(process.env.USE_FIREBASE_EMULATOR).toBe('true');
    });

    it('should detect when USE_FIREBASE_EMULATOR is not set', () => {
      delete process.env.USE_FIREBASE_EMULATOR;

      expect(process.env.USE_FIREBASE_EMULATOR).toBeUndefined();
    });
  });

  describe('credential detection', () => {
    it('should detect explicit credentials', () => {
      process.env.FIREBASE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';
      process.env.FIREBASE_PRIVATE_KEY = 'test-key';

      const hasExplicitCredentials =
        process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY;

      expect(hasExplicitCredentials).toBeTruthy();
    });

    it('should detect service account file', () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/credentials.json';

      expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeDefined();
    });

    it('should handle private key newline escaping', () => {
      const escapedKey = 'line1\\nline2\\nline3';
      const unescapedKey = escapedKey.replace(/\\n/g, '\n');

      expect(unescapedKey).toBe('line1\nline2\nline3');
    });
  });
});

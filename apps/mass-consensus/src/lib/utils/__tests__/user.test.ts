/**
 * Tests for user utility functions
 */
import {
  generateAnonymousUserId,
  getOrCreateAnonymousUser,
  getUserIdFromCookie,
  getUserIdFromCookies,
  getAnonymousDisplayName,
} from '../user';

describe('user utilities', () => {
  describe('generateAnonymousUserId', () => {
    it('should generate an ID with anon_ prefix', () => {
      const id = generateAnonymousUserId();
      expect(id).toMatch(/^anon_/);
    });

    it('should include timestamp in the ID', () => {
      const before = Date.now();
      const id = generateAnonymousUserId();
      const after = Date.now();

      // Extract timestamp from ID: anon_TIMESTAMP_random
      const match = id.match(/^anon_(\d+)_/);
      expect(match).toBeTruthy();

      const timestamp = parseInt(match![1]);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should include random suffix', () => {
      const id = generateAnonymousUserId();
      // Format: anon_timestamp_randomsuffix
      const parts = id.split('_');
      expect(parts).toHaveLength(3);
      expect(parts[2]).toBeTruthy();
      expect(parts[2].length).toBe(9); // substring(2, 11) = 9 chars
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateAnonymousUserId());
      }
      expect(ids.size).toBe(100);
    });

    it('should return a string', () => {
      const id = generateAnonymousUserId();
      expect(typeof id).toBe('string');
    });
  });

  describe('getOrCreateAnonymousUser', () => {
    // Mock window, localStorage, and document
    const mockLocalStorage: Record<string, string> = {};
    let documentCookieSetter: jest.Mock;

    beforeEach(() => {
      // Clear mock storage
      Object.keys(mockLocalStorage).forEach(key => delete mockLocalStorage[key]);

      // Mock localStorage
      Object.defineProperty(global, 'localStorage', {
        value: {
          getItem: jest.fn((key: string) => mockLocalStorage[key] || null),
          setItem: jest.fn((key: string, value: string) => {
            mockLocalStorage[key] = value;
          }),
          removeItem: jest.fn((key: string) => {
            delete mockLocalStorage[key];
          }),
        },
        writable: true,
      });

      // Mock document.cookie
      documentCookieSetter = jest.fn();
      Object.defineProperty(global, 'document', {
        value: {
          get cookie() {
            return '';
          },
          set cookie(value: string) {
            documentCookieSetter(value);
          },
        },
        writable: true,
      });

      // Mock window
      Object.defineProperty(global, 'window', {
        value: {},
        writable: true,
      });
    });

    afterEach(() => {
      // @ts-expect-error - Cleaning up global mocks
      delete global.localStorage;
      // @ts-expect-error - Cleaning up global mocks
      delete global.document;
      // @ts-expect-error - Cleaning up global mocks
      delete global.window;
    });

    it('should create new user ID if none exists', () => {
      const userId = getOrCreateAnonymousUser();
      expect(userId).toMatch(/^anon_/);
      expect(localStorage.setItem).toHaveBeenCalledWith('anonymousUserId', userId);
    });

    it('should return existing user ID from localStorage', () => {
      mockLocalStorage['anonymousUserId'] = 'existing_user_id';
      const userId = getOrCreateAnonymousUser();
      expect(userId).toBe('existing_user_id');
    });

    it('should set cookie for server-side access', () => {
      getOrCreateAnonymousUser();
      expect(documentCookieSetter).toHaveBeenCalled();
      const cookieValue = documentCookieSetter.mock.calls[0][0];
      expect(cookieValue).toContain('userId=');
      expect(cookieValue).toContain('path=/');
      expect(cookieValue).toContain('SameSite=Lax');
    });

    it('should throw error when called on server-side', () => {
      // Save original window
      const originalWindow = global.window;

      // Set window to undefined to simulate server-side
      // @ts-expect-error - Simulating server-side
      global.window = undefined;

      try {
        expect(() => getOrCreateAnonymousUser()).toThrow(
          'getOrCreateAnonymousUser can only be called on client-side'
        );
      } finally {
        // Restore window
        global.window = originalWindow;
      }
    });
  });

  describe('getUserIdFromCookie', () => {
    it('should return null for null cookie header', () => {
      const result = getUserIdFromCookie(null);
      expect(result).toBeNull();
    });

    it('should return null for empty cookie header', () => {
      const result = getUserIdFromCookie('');
      expect(result).toBeNull();
    });

    it('should extract userId from cookie header', () => {
      const cookieHeader = 'userId=anon_123_abc; other=value';
      const result = getUserIdFromCookie(cookieHeader);
      expect(result).toBe('anon_123_abc');
    });

    it('should handle userId at the end of cookie string', () => {
      const cookieHeader = 'other=value; userId=anon_456_def';
      const result = getUserIdFromCookie(cookieHeader);
      expect(result).toBe('anon_456_def');
    });

    it('should handle userId as only cookie', () => {
      const cookieHeader = 'userId=anon_789_ghi';
      const result = getUserIdFromCookie(cookieHeader);
      expect(result).toBe('anon_789_ghi');
    });

    it('should return null when userId is not present', () => {
      const cookieHeader = 'sessionId=abc123; theme=dark';
      const result = getUserIdFromCookie(cookieHeader);
      expect(result).toBeNull();
    });

    it('should not match partial key names', () => {
      // Should not match "otherUserId"
      const cookieHeader = 'otherUserId=wrong; userId=correct';
      const result = getUserIdFromCookie(cookieHeader);
      expect(result).toBe('correct');
    });

    it('should handle special characters in userId value', () => {
      const cookieHeader = 'userId=anon_123_abc-def';
      const result = getUserIdFromCookie(cookieHeader);
      expect(result).toBe('anon_123_abc-def');
    });
  });

  describe('getUserIdFromCookies', () => {
    it('should return null when cookie is not found', () => {
      const cookieStore = {
        get: jest.fn().mockReturnValue(undefined),
      };
      const result = getUserIdFromCookies(cookieStore);
      expect(result).toBeNull();
      expect(cookieStore.get).toHaveBeenCalledWith('userId');
    });

    it('should return userId when cookie exists', () => {
      const cookieStore = {
        get: jest.fn().mockReturnValue({ value: 'anon_123_abc' }),
      };
      const result = getUserIdFromCookies(cookieStore);
      expect(result).toBe('anon_123_abc');
    });

    it('should handle empty string value', () => {
      const cookieStore = {
        get: jest.fn().mockReturnValue({ value: '' }),
      };
      const result = getUserIdFromCookies(cookieStore);
      expect(result).toBe('');
    });
  });

  describe('getAnonymousDisplayName', () => {
    it('should generate an Adjective Noun Number format name', () => {
      const userId = 'anon_1704067200123_abc123';
      const displayName = getAnonymousDisplayName(userId);
      expect(displayName).toMatch(/^\w+ \w+ \d+$/);
    });

    it('should generate a distinguished name for any format', () => {
      const userId = 'invalid_format';
      const displayName = getAnonymousDisplayName(userId);
      expect(displayName).toMatch(/^\w+ \w+ \d+$/);
    });

    it('should handle any userId format', () => {
      const userId = 'some_random_id';
      const displayName = getAnonymousDisplayName(userId);
      expect(displayName).toMatch(/^\w+ \w+ \d+$/);
    });

    it('should handle empty string', () => {
      const displayName = getAnonymousDisplayName('');
      expect(displayName).toMatch(/^\w+ \w+ \d+$/);
    });

    it('should generate consistent display names for same userId', () => {
      const userId = 'anon_1704067200123_abc';
      const name1 = getAnonymousDisplayName(userId);
      const name2 = getAnonymousDisplayName(userId);
      expect(name1).toBe(name2);
    });

    it('should generate different display names for different userIds', () => {
      const userId1 = 'anon_1704067200111_abc';
      const userId2 = 'anon_1704067200222_abc';
      const name1 = getAnonymousDisplayName(userId1);
      const name2 = getAnonymousDisplayName(userId2);
      expect(name1).not.toBe(name2);
    });

    it('should handle real generated userId', () => {
      const userId = generateAnonymousUserId();
      const displayName = getAnonymousDisplayName(userId);
      expect(displayName).toMatch(/^\w+ \w+ \d+$/);
    });
  });

  describe('integration', () => {
    it('should generate userId that can be parsed for display name', () => {
      const userId = generateAnonymousUserId();
      const displayName = getAnonymousDisplayName(userId);
      expect(displayName).toMatch(/^\w+ \w+ \d+$/);
    });
  });
});

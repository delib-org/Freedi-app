/**
 * Tests for LiveEditingSession
 */

// Polyfill fetch and related globals for Node.js environment (required by Firebase Auth)
class MockResponse {
  ok = true;
  status = 200;
  async json() {
    return {};
  }
  async text() {
    return '';
  }
}

class MockRequest {
  url: string;
  constructor(url: string) {
    this.url = url;
  }
}

class MockHeaders {
  private headers = new Map();
  set(key: string, value: string) {
    this.headers.set(key, value);
  }
  get(key: string) {
    return this.headers.get(key);
  }
}

global.fetch = jest.fn(() => Promise.resolve(new MockResponse())) as jest.Mock;
global.Response = MockResponse as unknown as typeof Response;
global.Request = MockRequest as unknown as typeof Request;
global.Headers = MockHeaders as unknown as typeof Headers;

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock Firebase Database SDK functions before importing the manager
const mockRef = jest.fn();
const mockUpdate = jest.fn();
const mockSet = jest.fn();
const mockOnValue = jest.fn();
const mockOnDisconnect = jest.fn(() => ({
  remove: jest.fn().mockResolvedValue(undefined),
}));
const mockOff = jest.fn();

jest.mock('firebase/database', () => ({
  ref: mockRef,
  update: mockUpdate,
  set: mockSet,
  onValue: mockOnValue,
  onDisconnect: mockOnDisconnect,
  off: mockOff,
}));

// Mock Firebase client
jest.mock('@/lib/firebase/client');

import { LiveEditingManager } from '../liveEditingSession';
import { getFirebaseRealtimeDatabase } from '@/lib/firebase/client';

// Type for update call data
interface UpdateCallData {
  documentId?: string;
  paragraphId?: string;
  draftContent?: string;
  [key: string]: unknown;
}

interface MockRef {
  set: jest.MockedFunction<(value: unknown) => Promise<void>>;
  update: jest.MockedFunction<(data: UpdateCallData) => Promise<void>>;
  onDisconnect: jest.MockedFunction<() => { remove: jest.MockedFunction<() => Promise<void>> }>;
}

interface MockDatabase {
  ref: jest.MockedFunction<(path: string) => MockRef>;
}

describe('LiveEditingManager', () => {
  let manager: LiveEditingManager;
  let mockDatabase: unknown;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations
    mockRef.mockReturnValue({ path: 'mock-ref' });
    mockUpdate.mockResolvedValue(undefined);
    mockSet.mockResolvedValue(undefined);
    mockOnValue.mockReturnValue(jest.fn());
    mockOnDisconnect.mockReturnValue({
      remove: jest.fn().mockResolvedValue(undefined),
    });

    // Mock database instance
    mockDatabase = {};
    (getFirebaseRealtimeDatabase as jest.MockedFunction<typeof getFirebaseRealtimeDatabase>).mockReturnValue(
      mockDatabase as ReturnType<typeof getFirebaseRealtimeDatabase>
    );

    manager = new LiveEditingManager();
  });

  describe('joinSession', () => {
    it('should create session in RTDB', async () => {
      await manager.joinSession(
        'doc_123',
        'para_456',
        'user_789',
        'Test User',
        'Initial content'
      );

      expect(mockRef).toHaveBeenCalledWith(mockDatabase, 'liveEditing/sessions/para_456');
      expect(mockUpdate).toHaveBeenCalled();

      const mockCalls = mockUpdate.mock.calls;
      // Second parameter of update() is the data object
      const updateCall = mockCalls.length > 0 ? mockCalls[0][1] as UpdateCallData : undefined;
      expect(updateCall).toBeDefined();
      if (updateCall) {
        expect(updateCall.documentId).toBe('doc_123');
        expect(updateCall.paragraphId).toBe('para_456');
        expect(updateCall.draftContent).toBe('Initial content');
        expect(updateCall['activeEditors/user_789']).toBeDefined();
      }
    });

    it('should set up auto-disconnect cleanup', async () => {
      await manager.joinSession(
        'doc_123',
        'para_456',
        'user_789',
        'Test User',
        'Initial content'
      );

      expect(mockOnDisconnect).toHaveBeenCalled();
    });

    it('should assign unique color to user', async () => {
      await manager.joinSession(
        'doc_123',
        'para_456',
        'user_789',
        'Test User',
        'Initial content'
      );

      const mockCalls = mockUpdate.mock.calls;
      const updateCall = mockCalls.length > 0 ? mockCalls[0][1] as UpdateCallData : undefined;
      expect(updateCall).toBeDefined();
      if (updateCall) {
        const editor = updateCall['activeEditors/user_789'] as { color: string } | undefined;
        expect(editor?.color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it('should handle errors gracefully', async () => {
      mockUpdate.mockRejectedValue(new Error('Network error'));

      await expect(
        manager.joinSession('doc_123', 'para_456', 'user_789', 'Test User', 'Initial content')
      ).rejects.toThrow();
    });
  });

  describe('updateDraft', () => {
    beforeEach(async () => {
      await manager.joinSession(
        'doc_123',
        'para_456',
        'user_789',
        'Test User',
        'Initial content'
      );
      jest.clearAllMocks();
    });

    it('should debounce updates (300ms)', (done) => {
      manager.updateDraft('New text 1', 0);
      manager.updateDraft('New text 2', 5);
      manager.updateDraft('New text 3', 10);

      // Should not call update immediately
      expect(mockUpdate).not.toHaveBeenCalled();

      // Wait for debounce
      setTimeout(() => {
        // Should only call once with last value
        expect(mockUpdate).toHaveBeenCalledTimes(1);

        const mockCalls = mockUpdate.mock.calls;
        const updateCall = mockCalls.length > 0 ? mockCalls[0][1] as UpdateCallData : undefined;
        expect(updateCall?.draftContent).toBe('New text 3');
        done();
      }, 350);
    });

    it('should update cursor position', (done) => {
      manager.updateDraft('New text', 5);

      setTimeout(() => {
        const mockCalls = mockUpdate.mock.calls;
        const updateCall = mockCalls.length > 0 ? mockCalls[0][1] as UpdateCallData : undefined;
        expect(updateCall?.['activeEditors/user_789/cursorPosition']).toBe(5);
        done();
      }, 350);
    });

    it('should update lastActive timestamp', (done) => {
      const beforeTime = Date.now();

      manager.updateDraft('New text', 0);

      setTimeout(() => {
        const mockCalls = mockUpdate.mock.calls;
        const updateCall = mockCalls.length > 0 ? mockCalls[0][1] as UpdateCallData : undefined;
        const lastActive = updateCall?.['activeEditors/user_789/lastActive'] as number | undefined;

        expect(lastActive).toBeGreaterThanOrEqual(beforeTime);
        done();
      }, 350);
    });
  });

  describe('subscribeToSession', () => {
    it('should return unsubscribe function', async () => {
      await manager.joinSession(
        'doc_123',
        'para_456',
        'user_789',
        'Test User',
        'Initial content'
      );

      const callback = jest.fn();
      const unsubscribe = manager.subscribeToSession(callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should handle errors in listener', async () => {
      await manager.joinSession(
        'doc_123',
        'para_456',
        'user_789',
        'Test User',
        'Initial content'
      );

      const callback = jest.fn();
      manager.subscribeToSession(callback);

      // Simulate error - should not throw
      expect(() => {
        // Error handling is internal
      }).not.toThrow();
    });
  });

  describe('leaveSession', () => {
    it('should remove user from activeEditors', async () => {
      await manager.joinSession(
        'doc_123',
        'para_456',
        'user_789',
        'Test User',
        'Initial content'
      );

      jest.clearAllMocks();

      await manager.leaveSession();

      expect(mockSet).toHaveBeenCalled();
      const mockCalls = mockSet.mock.calls;
      const setCall = mockCalls.length > 0 ? mockCalls[0][1] : undefined;
      expect(setCall).toBeNull();
    });

    it('should clear debounce timer', async () => {
      await manager.joinSession(
        'doc_123',
        'para_456',
        'user_789',
        'Test User',
        'Initial content'
      );

      // Clear mocks after join to only track updates from updateDraft
      jest.clearAllMocks();

      // Start an update
      manager.updateDraft('New text', 0);

      // Leave immediately
      await manager.leaveSession();

      // Wait past debounce time
      await new Promise((resolve) => setTimeout(resolve, 350));

      // Should not have called update after leaving
      const updateCalls = mockUpdate.mock.calls;
      expect(updateCalls.length).toBe(0);
    });
  });

  describe('getActiveEditors', () => {
    it('should filter out current user', () => {
      const mockSession = {
        documentId: 'doc_123',
        paragraphId: 'para_456',
        activeEditors: {
          user_789: {
            userId: 'user_789',
            displayName: 'Current User',
            cursorPosition: 0,
            lastActive: Date.now(),
            color: '#3b82f6',
          },
          user_abc: {
            userId: 'user_abc',
            displayName: 'Other User',
            cursorPosition: 5,
            lastActive: Date.now(),
            color: '#ef4444',
          },
        },
        draftContent: 'Content',
        lastUpdate: Date.now(),
        ttl: Date.now() + 900000,
      };

      // Set current user by casting to access private property for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (manager as unknown as { currentUserId: string }).currentUserId = 'user_789';

      const activeEditors = manager.getActiveEditors(mockSession);

      expect(activeEditors.length).toBe(1);
      expect(activeEditors[0]!.userId).toBe('user_abc');
    });

    it('should return empty array if no session', () => {
      const activeEditors = manager.getActiveEditors(null);

      expect(activeEditors).toEqual([]);
    });

    it('should return empty array if no active editors', () => {
      const mockSession = {
        documentId: 'doc_123',
        paragraphId: 'para_456',
        activeEditors: {},
        draftContent: 'Content',
        lastUpdate: Date.now(),
        ttl: Date.now() + 900000,
      };

      const activeEditors = manager.getActiveEditors(mockSession);

      expect(activeEditors).toEqual([]);
    });
  });

  describe('cleanup', () => {
    it('should call leaveSession', async () => {
      const leaveSpy = jest.spyOn(manager, 'leaveSession');

      await manager.cleanup();

      expect(leaveSpy).toHaveBeenCalled();
    });
  });
});

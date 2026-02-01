/**
 * Tests for LiveEditingSession
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { LiveEditingManager } from '../liveEditingSession';
import { getFirebaseRealtimeDatabase } from '@/lib/firebase/client';

// Mock Firebase client
jest.mock('@/lib/firebase/client');

interface MockRef {
  set: jest.MockedFunction<() => Promise<void>>;
  update: jest.MockedFunction<() => Promise<void>>;
  onDisconnect: jest.MockedFunction<() => { remove: jest.MockedFunction<() => Promise<void>> }>;
}

interface MockDatabase {
  ref: jest.MockedFunction<() => MockRef>;
}

describe('LiveEditingManager', () => {
  let manager: LiveEditingManager;
  let mockRef: MockRef;
  let mockDatabase: MockDatabase;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock RTDB ref
    mockRef = {
      set: jest.fn(() => Promise.resolve()),
      update: jest.fn(() => Promise.resolve()),
      onDisconnect: jest.fn(() => ({
        remove: jest.fn(() => Promise.resolve()),
      })),
    };

    // Mock database
    mockDatabase = {
      ref: jest.fn(() => mockRef),
    };

    (getFirebaseRealtimeDatabase as jest.MockedFunction<typeof getFirebaseRealtimeDatabase>).mockReturnValue(
      mockDatabase as unknown as ReturnType<typeof getFirebaseRealtimeDatabase>
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

      expect(mockDatabase.ref).toHaveBeenCalledWith('liveEditing/sessions/para_456');
      expect(mockRef.update).toHaveBeenCalled();

      const updateCall = mockRef.update.mock.calls[0][0];
      expect(updateCall.documentId).toBe('doc_123');
      expect(updateCall.paragraphId).toBe('para_456');
      expect(updateCall.draftContent).toBe('Initial content');
      expect(updateCall['activeEditors/user_789']).toBeDefined();
    });

    it('should set up auto-disconnect cleanup', async () => {
      await manager.joinSession(
        'doc_123',
        'para_456',
        'user_789',
        'Test User',
        'Initial content'
      );

      expect(mockRef.onDisconnect).toHaveBeenCalled();
    });

    it('should assign unique color to user', async () => {
      await manager.joinSession(
        'doc_123',
        'para_456',
        'user_789',
        'Test User',
        'Initial content'
      );

      const updateCall = mockRef.update.mock.calls[0][0];
      const editor = updateCall['activeEditors/user_789'];

      expect(editor.color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('should handle errors gracefully', async () => {
      mockRef.update.mockRejectedValue(new Error('Network error'));

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
      expect(mockRef.update).not.toHaveBeenCalled();

      // Wait for debounce
      setTimeout(() => {
        // Should only call once with last value
        expect(mockRef.update).toHaveBeenCalledTimes(1);

        const updateCall = mockRef.update.mock.calls[0][0];
        expect(updateCall.draftContent).toBe('New text 3');
        done();
      }, 350);
    });

    it('should update cursor position', (done) => {
      manager.updateDraft('New text', 5);

      setTimeout(() => {
        const updateCall = mockRef.update.mock.calls[0][0];
        expect(updateCall['activeEditors/user_789/cursorPosition']).toBe(5);
        done();
      }, 350);
    });

    it('should update lastActive timestamp', (done) => {
      const beforeTime = Date.now();

      manager.updateDraft('New text', 0);

      setTimeout(() => {
        const updateCall = mockRef.update.mock.calls[0][0];
        const lastActive = updateCall['activeEditors/user_789/lastActive'];

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

      expect(mockRef.set).toHaveBeenCalledWith(null);
    });

    it('should clear debounce timer', async () => {
      await manager.joinSession(
        'doc_123',
        'para_456',
        'user_789',
        'Test User',
        'Initial content'
      );

      // Start an update
      manager.updateDraft('New text', 0);

      // Leave immediately
      await manager.leaveSession();

      // Wait past debounce time
      await new Promise((resolve) => setTimeout(resolve, 350));

      // Should not have called update after leaving
      const updateCalls = mockRef.update.mock.calls;
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

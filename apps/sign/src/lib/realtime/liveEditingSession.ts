/**
 * Live Editing Session Manager
 *
 * Manages real-time collaborative editing using Firebase Realtime Database.
 * Supports multiple users editing the same paragraph simultaneously with
 * instant draft sync, cursor positions, and auto-disconnect cleanup.
 */

import {
  ref,
  set,
  update,
  onValue,
  onDisconnect,
  off,
  Unsubscribe,
  DatabaseReference,
} from 'firebase/database';
import { getFirebaseRealtimeDatabase } from '@/lib/firebase/client';
import { logError, DatabaseError } from '@/lib/utils/errorHandling';

/**
 * Session TTL (time-to-live) in milliseconds
 * Sessions older than this will be cleaned up by scheduled function
 */
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Debounce delay for draft updates in milliseconds
 * Prevents excessive RTDB writes during rapid typing
 */
const DRAFT_UPDATE_DEBOUNCE_MS = 300;

/**
 * Active editor information
 */
export interface ActiveEditor {
  userId: string;
  displayName: string;
  cursorPosition: number;
  lastActive: number;
  color: string; // Unique color for this editor's cursor
}

/**
 * Live editing session data structure
 */
export interface LiveEditingSession {
  documentId: string;
  paragraphId: string;
  activeEditors: Record<string, ActiveEditor>;
  draftContent: string;
  lastUpdate: number;
  ttl: number; // Timestamp when session expires
}

/**
 * Editor colors for cursor visualization
 * Each user gets a unique color from this pool
 */
const EDITOR_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
];

/**
 * Generates a consistent color for a user based on their userId
 */
function getUserColor(userId: string): string {
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return EDITOR_COLORS[hash % EDITOR_COLORS.length]!;
}

/**
 * Live Editing Manager
 *
 * Manages real-time collaborative editing sessions for paragraphs
 */
export class LiveEditingManager {
  private database = getFirebaseRealtimeDatabase();
  private sessionRef: DatabaseReference | null = null;
  private unsubscribe: Unsubscribe | null = null;
  private draftUpdateTimer: NodeJS.Timeout | null = null;
  private currentUserId: string | null = null;
  private currentParagraphId: string | null = null;

  /**
   * Join a live editing session for a paragraph
   *
   * @param documentId - The document containing the paragraph
   * @param paragraphId - The paragraph being edited
   * @param userId - The current user's ID
   * @param displayName - The current user's display name
   * @param initialContent - Initial draft content (current paragraph text)
   * @returns Promise<void>
   */
  async joinSession(
    documentId: string,
    paragraphId: string,
    userId: string,
    displayName: string,
    initialContent: string
  ): Promise<void> {
    try {
      // Leave any existing session first
      if (this.currentParagraphId) {
        await this.leaveSession();
      }

      this.currentUserId = userId;
      this.currentParagraphId = paragraphId;

      // Get session reference
      this.sessionRef = ref(this.database, `liveEditing/sessions/${paragraphId}`);

      // Get current session data to check if it exists
      const now = Date.now();
      const ttl = now + SESSION_TTL_MS;

      // Add this user to active editors
      const editorPath = `activeEditors/${userId}`;
      const editorData: ActiveEditor = {
        userId,
        displayName,
        cursorPosition: 0,
        lastActive: now,
        color: getUserColor(userId),
      };

      await update(this.sessionRef, {
        documentId,
        paragraphId,
        [editorPath]: editorData,
        draftContent: initialContent,
        lastUpdate: now,
        ttl,
      });

      // Set up auto-disconnect cleanup
      const disconnectRef = ref(this.database, `liveEditing/sessions/${paragraphId}/${editorPath}`);
      await onDisconnect(disconnectRef).remove();

      console.info('[LiveEditingManager] Joined session', { paragraphId, userId });
    } catch (error) {
      logError(error, {
        operation: 'liveEditingSession.joinSession',
        userId,
        paragraphId,
        documentId,
      });
      throw new DatabaseError('Failed to join editing session', { paragraphId });
    }
  }

  /**
   * Update draft content (debounced to prevent excessive writes)
   *
   * @param content - New draft content
   * @param cursorPosition - Current cursor position
   */
  updateDraft(content: string, cursorPosition: number): void {
    if (!this.sessionRef || !this.currentUserId) {
      logError(new Error('Cannot update draft: no active session'), {
        operation: 'liveEditingSession.updateDraft',
      });
      return;
    }

    // Clear existing timer
    if (this.draftUpdateTimer) {
      clearTimeout(this.draftUpdateTimer);
    }

    // Debounce: Wait 300ms before writing to RTDB
    this.draftUpdateTimer = setTimeout(() => {
      this.performDraftUpdate(content, cursorPosition);
    }, DRAFT_UPDATE_DEBOUNCE_MS);
  }

  /**
   * Perform the actual draft update to RTDB (called after debounce)
   */
  private async performDraftUpdate(content: string, cursorPosition: number): Promise<void> {
    if (!this.sessionRef || !this.currentUserId) {
      return;
    }

    try {
      const now = Date.now();

      await update(this.sessionRef, {
        draftContent: content,
        lastUpdate: now,
        [`activeEditors/${this.currentUserId}/cursorPosition`]: cursorPosition,
        [`activeEditors/${this.currentUserId}/lastActive`]: now,
      });
    } catch (error) {
      logError(error, {
        operation: 'liveEditingSession.performDraftUpdate',
        userId: this.currentUserId,
        paragraphId: this.currentParagraphId,
        metadata: { contentLength: content.length },
      });
    }
  }

  /**
   * Subscribe to session updates (real-time listener)
   *
   * @param callback - Callback invoked on every session change
   * @returns Unsubscribe function
   */
  subscribeToSession(callback: (session: LiveEditingSession | null) => void): Unsubscribe {
    if (!this.sessionRef) {
      throw new Error('Cannot subscribe: no active session');
    }

    // Set up real-time listener
    this.unsubscribe = onValue(
      this.sessionRef,
      (snapshot) => {
        const data = snapshot.val() as LiveEditingSession | null;
        callback(data);
      },
      (error) => {
        logError(error, {
          operation: 'liveEditingSession.subscribeToSession',
          userId: this.currentUserId ?? undefined,
          paragraphId: this.currentParagraphId ?? undefined,
        });
      }
    );

    return this.unsubscribe;
  }

  /**
   * Leave the current editing session
   */
  async leaveSession(): Promise<void> {
    try {
      // Clear debounce timer
      if (this.draftUpdateTimer) {
        clearTimeout(this.draftUpdateTimer);
        this.draftUpdateTimer = null;
      }

      // Remove listener
      if (this.unsubscribe && this.sessionRef) {
        off(this.sessionRef);
        this.unsubscribe = null;
      }

      // Remove this user from active editors
      if (this.sessionRef && this.currentUserId) {
        const editorRef = ref(
          this.database,
          `liveEditing/sessions/${this.currentParagraphId}/activeEditors/${this.currentUserId}`
        );
        await set(editorRef, null);

        console.info('[LiveEditingManager] Left session', {
          paragraphId: this.currentParagraphId,
          userId: this.currentUserId,
        });
      }

      this.sessionRef = null;
      this.currentUserId = null;
      this.currentParagraphId = null;
    } catch (error) {
      logError(error, {
        operation: 'liveEditingSession.leaveSession',
        userId: this.currentUserId ?? undefined,
        paragraphId: this.currentParagraphId ?? undefined,
      });
    }
  }

  /**
   * Get list of active editors (excluding current user)
   */
  getActiveEditors(session: LiveEditingSession | null): ActiveEditor[] {
    if (!session || !session.activeEditors) {
      return [];
    }

    return Object.values(session.activeEditors).filter(
      (editor) => editor.userId !== this.currentUserId
    );
  }

  /**
   * Cleanup - call this on component unmount
   */
  async cleanup(): Promise<void> {
    await this.leaveSession();
  }
}

/**
 * Create a new LiveEditingManager instance
 */
export function createLiveEditingManager(): LiveEditingManager {
  return new LiveEditingManager();
}

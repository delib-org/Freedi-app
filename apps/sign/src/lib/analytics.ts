/**
 * Google Analytics tracking for Sign app
 * Tracks user interactions with documents
 */

declare global {
  interface Window {
    gtag?: (
      command: 'event' | 'config' | 'set',
      action: string,
      params?: Record<string, unknown>
    ) => void;
  }
}

export enum AnalyticsEvent {
  // User actions
  USER_LOGIN = 'sign_user_login',
  USER_LOGOUT = 'sign_user_logout',

  // Document actions
  DOCUMENT_VIEW = 'sign_document_view',
  DOCUMENT_SIGN = 'sign_document_sign',
  DOCUMENT_REJECT = 'sign_document_reject',
  REJECTION_FEEDBACK = 'sign_rejection_feedback',

  // Admin actions
  DOCUMENT_CREATE = 'sign_document_create',
  PARAGRAPH_ADD = 'sign_paragraph_add',
  INVITE_SENT = 'sign_invite_sent',
  INVITE_ACCEPTED = 'sign_invite_accepted',
  ACCESS_REVOKED = 'sign_access_revoked',
}

/**
 * Track an analytics event using Google Analytics
 */
export function trackEvent(
  event: AnalyticsEvent,
  params?: Record<string, unknown>
): void {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', event, params);
  }
}

// Convenience functions for common events

export function trackUserLogin(userId: string, method: 'google' | 'anonymous'): void {
  trackEvent(AnalyticsEvent.USER_LOGIN, {
    user_id: userId,
    method,
  });
}

export function trackUserLogout(userId?: string): void {
  trackEvent(AnalyticsEvent.USER_LOGOUT, {
    user_id: userId,
  });
}

export function trackDocumentView(docId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.DOCUMENT_VIEW, {
    doc_id: docId,
    user_id: userId,
  });
}

export function trackDocumentSign(docId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.DOCUMENT_SIGN, {
    doc_id: docId,
    user_id: userId,
  });
}

export function trackDocumentReject(docId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.DOCUMENT_REJECT, {
    doc_id: docId,
    user_id: userId,
  });
}

export function trackRejectionFeedback(docId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.REJECTION_FEEDBACK, {
    doc_id: docId,
    user_id: userId,
  });
}

export function trackDocumentCreate(docId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.DOCUMENT_CREATE, {
    doc_id: docId,
    user_id: userId,
  });
}

export function trackParagraphAdd(docId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.PARAGRAPH_ADD, {
    doc_id: docId,
    user_id: userId,
  });
}

export function trackInviteSent(docId: string, userId?: string, permissionLevel?: string): void {
  trackEvent(AnalyticsEvent.INVITE_SENT, {
    doc_id: docId,
    user_id: userId,
    permission_level: permissionLevel,
  });
}

export function trackInviteAccepted(docId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.INVITE_ACCEPTED, {
    doc_id: docId,
    user_id: userId,
  });
}

export function trackAccessRevoked(docId: string, userId?: string, revokedUserId?: string): void {
  trackEvent(AnalyticsEvent.ACCESS_REVOKED, {
    doc_id: docId,
    user_id: userId,
    revoked_user_id: revokedUserId,
  });
}

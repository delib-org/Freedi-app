/**
 * Google Analytics tracking for mass-consensus app
 * Tracks user interactions with statements
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
  PAGE_VIEW = 'mc_page_view',
  EVALUATION = 'mc_evaluation',
  NEW_BATCH_REQUEST = 'mc_new_batch_request',
  ADD_SOLUTION_CLICK = 'mc_add_solution_click',
  SOLUTION_SUBMITTED = 'mc_solution_submitted',
  EMAIL_SUBSCRIBED = 'mc_email_subscribed',
}

/**
 * Track an analytics event using Google Analytics
 */
export function trackEvent(
  event: AnalyticsEvent,
  statementId: string,
  userId?: string,
  metadata?: Record<string, unknown>
): void {
  // Log to console for debugging
  console.info('[Analytics]', { event, statementId, userId, metadata });

  // Send to Google Analytics
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', event, {
      statement_id: statementId,
      user_id: userId,
      ...metadata,
    });
  }
}

// Convenience functions for common events

export function trackPageView(statementId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.PAGE_VIEW, statementId, userId);
}

export function trackEvaluation(
  statementId: string,
  userId?: string,
  evaluatedStatementId?: string,
  score?: number
): void {
  trackEvent(AnalyticsEvent.EVALUATION, statementId, userId, {
    evaluated_statement_id: evaluatedStatementId,
    score,
  });
}

export function trackNewBatchRequest(statementId: string, userId?: string, batchNumber?: number): void {
  trackEvent(AnalyticsEvent.NEW_BATCH_REQUEST, statementId, userId, {
    batch_number: batchNumber,
  });
}

export function trackAddSolutionClick(statementId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.ADD_SOLUTION_CLICK, statementId, userId);
}

export function trackSolutionSubmitted(statementId: string, userId?: string, isNew?: boolean): void {
  trackEvent(AnalyticsEvent.SOLUTION_SUBMITTED, statementId, userId, {
    is_new: isNew,
  });
}

export function trackEmailSubscribed(statementId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.EMAIL_SUBSCRIBED, statementId, userId);
}

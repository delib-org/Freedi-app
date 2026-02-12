/**
 * Google Analytics tracking for mass-consensus app
 * Tracks user interactions with statements
 */

// Window.gtag type is declared in GoogleAnalytics.tsx

export enum AnalyticsEvent {
  // Page views
  PAGE_VIEW = 'mc_page_view',
  RESULTS_VIEWED = 'mc_results_viewed',

  // User actions
  USER_LOGIN = 'mc_user_login',
  USER_LOGOUT = 'mc_user_logout',

  // Core engagement
  EVALUATION = 'mc_evaluation',
  NEW_BATCH_REQUEST = 'mc_new_batch_request',
  ADD_SOLUTION_CLICK = 'mc_add_solution_click',
  SOLUTION_SUBMITTED = 'mc_solution_submitted',

  // Sharing
  SURVEY_LINK_SHARED = 'mc_survey_link_shared',
  QR_CODE_DOWNLOADED = 'mc_qr_code_downloaded',

  // Email
  EMAIL_SUBSCRIBED = 'mc_email_subscribed',

  // Proposals
  PROPOSAL_SUBMITTED = 'mc_proposal_submitted',
  PROPOSAL_PROMPT_SHOWN = 'mc_proposal_prompt_shown',
  PROPOSAL_PROMPT_DISMISSED = 'mc_proposal_prompt_dismissed',
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

export function trackPageView(statementId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.PAGE_VIEW, {
    statement_id: statementId,
    user_id: userId,
  });
}

export function trackResultsViewed(statementId: string, userId?: string, tab?: string): void {
  trackEvent(AnalyticsEvent.RESULTS_VIEWED, {
    statement_id: statementId,
    user_id: userId,
    tab,
  });
}

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

export function trackEvaluation(
  statementId: string,
  userId?: string,
  evaluatedStatementId?: string,
  score?: number
): void {
  trackEvent(AnalyticsEvent.EVALUATION, {
    statement_id: statementId,
    user_id: userId,
    evaluated_statement_id: evaluatedStatementId,
    score,
  });
}

export function trackNewBatchRequest(statementId: string, userId?: string, batchNumber?: number): void {
  trackEvent(AnalyticsEvent.NEW_BATCH_REQUEST, {
    statement_id: statementId,
    user_id: userId,
    batch_number: batchNumber,
  });
}

export function trackAddSolutionClick(statementId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.ADD_SOLUTION_CLICK, {
    statement_id: statementId,
    user_id: userId,
  });
}

export function trackSolutionSubmitted(statementId: string, userId?: string, isNew?: boolean): void {
  trackEvent(AnalyticsEvent.SOLUTION_SUBMITTED, {
    statement_id: statementId,
    user_id: userId,
    is_new: isNew,
  });
}

export function trackSurveyLinkShared(statementId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.SURVEY_LINK_SHARED, {
    statement_id: statementId,
    user_id: userId,
  });
}

export function trackQrCodeDownloaded(statementId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.QR_CODE_DOWNLOADED, {
    statement_id: statementId,
    user_id: userId,
  });
}

export function trackEmailSubscribed(statementId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.EMAIL_SUBSCRIBED, {
    statement_id: statementId,
    user_id: userId,
  });
}

export function trackProposalSubmitted(
  questionId: string,
  userId?: string,
  proposalLength?: number
): void {
  trackEvent(AnalyticsEvent.PROPOSAL_SUBMITTED, {
    question_id: questionId,
    user_id: userId,
    proposal_length: proposalLength,
  });
}

export function trackProposalPromptShown(questionId: string, userId?: string, cardCount?: number): void {
  trackEvent(AnalyticsEvent.PROPOSAL_PROMPT_SHOWN, {
    question_id: questionId,
    user_id: userId,
    card_count: cardCount,
  });
}

export function trackProposalPromptDismissed(questionId: string, userId?: string): void {
  trackEvent(AnalyticsEvent.PROPOSAL_PROMPT_DISMISSED, {
    question_id: questionId,
    user_id: userId,
  });
}

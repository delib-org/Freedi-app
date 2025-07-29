import { logEvent as firebaseLogEvent, setUserId, setUserProperties } from 'firebase/analytics';
import { analytics } from '../../controllers/db/config';
import { logger } from '../logger';
import { store } from '../../redux/store';

// Event names as constants to ensure consistency
export const AnalyticsEvents = {
  // User lifecycle
  USER_SIGNUP: 'user_signup',
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  
  // Statement events
  STATEMENT_CREATED: 'statement_created',
  STATEMENT_VIEWED: 'statement_viewed',
  STATEMENT_VOTED: 'statement_voted',
  STATEMENT_COMMENTED: 'statement_commented',
  STATEMENT_SHARED: 'statement_shared',
  STATEMENT_VIEW_TIME: 'statement_view_time',
  STATEMENT_ENGAGEMENT: 'statement_engagement',
  
  // Feature events
  NOTIFICATION_ENABLED: 'notification_enabled',
  SEARCH_PERFORMED: 'search_performed',
  
  // Error events
  VALIDATION_ERROR: 'validation_error',
  OPERATION_FAILED: 'operation_failed',
} as const;

type EventName = typeof AnalyticsEvents[keyof typeof AnalyticsEvents];

interface BaseEventParams {
  [key: string]: unknown;
}

interface StatementEventParams extends BaseEventParams {
  statementId: string;
}

interface UserLifecycleParams extends BaseEventParams {
  method?: string;
}

interface StatementViewParams extends StatementEventParams {
  viewSource: 'feed' | 'direct' | 'search' | 'share';
  viewDuration?: number;
}

interface StatementVoteParams extends StatementEventParams {
  vote: number;
  voteMethod: 'button' | 'swipe';
}

interface StatementViewTimeParams extends StatementEventParams {
  timeSpent: number; // seconds
  interactionType: 'read_only' | 'engaged';
  scrollDepth?: number; // 0-100
}

interface ValidationErrorParams extends BaseEventParams {
  errorType: string;
  formName: string;
  fieldName?: string;
}

// Type-safe event parameters
type EventParams = {
  [AnalyticsEvents.USER_SIGNUP]: UserLifecycleParams;
  [AnalyticsEvents.USER_LOGIN]: UserLifecycleParams;
  [AnalyticsEvents.USER_LOGOUT]: BaseEventParams;
  [AnalyticsEvents.STATEMENT_CREATED]: StatementEventParams & { statementType?: string; hasImage?: boolean };
  [AnalyticsEvents.STATEMENT_VIEWED]: StatementViewParams;
  [AnalyticsEvents.STATEMENT_VOTED]: StatementVoteParams;
  [AnalyticsEvents.STATEMENT_COMMENTED]: StatementEventParams & { commentLength: number };
  [AnalyticsEvents.STATEMENT_SHARED]: StatementEventParams & { shareMethod: 'link' | 'social' };
  [AnalyticsEvents.STATEMENT_VIEW_TIME]: StatementViewTimeParams;
  [AnalyticsEvents.STATEMENT_ENGAGEMENT]: StatementEventParams & { 
    engagementType: 'high' | 'medium' | 'low';
    metrics: {
      votes: number;
      comments: number;
      shares: number;
      avgViewTime: number;
    };
  };
  [AnalyticsEvents.NOTIFICATION_ENABLED]: { notificationType: 'all' | 'mentions' | 'updates' };
  [AnalyticsEvents.SEARCH_PERFORMED]: { searchTerm: string; resultsCount: number };
  [AnalyticsEvents.VALIDATION_ERROR]: ValidationErrorParams;
  [AnalyticsEvents.OPERATION_FAILED]: { operation: string; error: string; context?: unknown };
};

class AnalyticsService {
  private isInitialized = false;
  private pendingEvents: Array<{ event: EventName; params: BaseEventParams }> = [];

  constructor() {
    // Wait for analytics to be ready
    this.checkInitialization();
  }

  private checkInitialization() {
    const checkInterval = setInterval(() => {
      if (analytics) {
        this.isInitialized = true;
        clearInterval(checkInterval);
        this.flushPendingEvents();
      }
    }, 1000);
    
    // Stop checking after 10 seconds
    setTimeout(() => clearInterval(checkInterval), 10000);
  }

  private flushPendingEvents() {
    this.pendingEvents.forEach(({ event, params }) => {
      this.logEventInternal(event, params);
    });
    this.pendingEvents = [];
  }

  private logEventInternal(event: EventName, params: BaseEventParams) {
    if (!analytics) {
      logger.debug('Analytics not available, skipping event', { event, params });
      
return;
    }

    try {
      firebaseLogEvent(analytics, event, params);
      logger.debug('Analytics event logged', { event, params });
    } catch (error) {
      logger.error('Failed to log analytics event', error, { event, params });
    }
  }

  // Type-safe event logging
  logEvent<T extends EventName>(event: T, params: EventParams[T]) {
    // Add common parameters
    const enrichedParams = {
      ...params,
      timestamp: Date.now(),
      environment: import.meta.env.MODE,
    };

    // Log to our logger as well
    logger.trackEvent(event, enrichedParams);

    if (this.isInitialized) {
      this.logEventInternal(event, enrichedParams);
    } else {
      // Queue event if analytics not ready
      this.pendingEvents.push({ event, params: enrichedParams });
    }
  }

  // Set user ID for all future events
  setUserId(userId: string | null) {
    if (!analytics) return;
    
    try {
      setUserId(analytics, userId);
      logger.info('Analytics user ID set', { userId });
    } catch (error) {
      logger.error('Failed to set analytics user ID', error);
    }
  }

  // Set user properties
  setUserProperties(properties: Record<string, unknown>) {
    if (!analytics) return;
    
    try {
      setUserProperties(analytics, properties);
      logger.info('Analytics user properties set', { properties });
    } catch (error) {
      logger.error('Failed to set analytics user properties', error);
    }
  }

  // Helper to get current user context
  private getUserContext() {
    const state = store.getState();
    const user = state.creator.creator;
    
    return user ? {
      userId: user.uid,
      userType: user.isAnonymous ? 'anonymous' : 'registered',
    } : null;
  }

  // Convenience methods for common events
  trackUserSignup(method: string = 'email') {
    this.logEvent(AnalyticsEvents.USER_SIGNUP, { method });
  }

  trackUserLogin(method: string = 'email') {
    const userContext = this.getUserContext();
    if (userContext) {
      this.setUserId(userContext.userId);
      this.setUserProperties({ userType: userContext.userType });
    }
    this.logEvent(AnalyticsEvents.USER_LOGIN, { method });
  }

  trackUserLogout() {
    this.logEvent(AnalyticsEvents.USER_LOGOUT, {});
    this.setUserId(null);
  }

  trackStatementView(statementId: string, viewSource: StatementViewParams['viewSource']) {
    this.logEvent(AnalyticsEvents.STATEMENT_VIEWED, { 
      statementId, 
      viewSource 
    });
  }

  trackStatementVote(statementId: string, vote: number, voteMethod: 'button' | 'swipe' = 'button') {
    this.logEvent(AnalyticsEvents.STATEMENT_VOTED, { 
      statementId, 
      vote, 
      voteMethod 
    });
  }

  trackStatementViewTime(
    statementId: string, 
    timeSpent: number, 
    interactionType: 'read_only' | 'engaged',
    scrollDepth?: number
  ) {
    this.logEvent(AnalyticsEvents.STATEMENT_VIEW_TIME, {
      statementId,
      timeSpent,
      interactionType,
      scrollDepth,
    });
  }

  trackValidationError(errorType: string, formName: string, fieldName?: string) {
    this.logEvent(AnalyticsEvents.VALIDATION_ERROR, {
      errorType,
      formName,
      fieldName,
    });
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();

// Export for testing
export { AnalyticsService };
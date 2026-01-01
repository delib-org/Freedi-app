/**
 * Tests for Google Analytics tracking functions
 * @jest-environment jsdom
 */
import {
  AnalyticsEvent,
  trackEvent,
  trackPageView,
  trackEvaluation,
  trackNewBatchRequest,
  trackAddSolutionClick,
  trackSolutionSubmitted,
  trackEmailSubscribed,
} from '../analytics';

describe('analytics', () => {
  let mockGtag: jest.Mock;
  let consoleInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console.info
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    // Mock window.gtag
    mockGtag = jest.fn();
    Object.defineProperty(window, 'gtag', {
      value: mockGtag,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    // Clean up gtag
    Object.defineProperty(window, 'gtag', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  describe('AnalyticsEvent enum', () => {
    it('should have correct event names', () => {
      expect(AnalyticsEvent.PAGE_VIEW).toBe('mc_page_view');
      expect(AnalyticsEvent.EVALUATION).toBe('mc_evaluation');
      expect(AnalyticsEvent.NEW_BATCH_REQUEST).toBe('mc_new_batch_request');
      expect(AnalyticsEvent.ADD_SOLUTION_CLICK).toBe('mc_add_solution_click');
      expect(AnalyticsEvent.SOLUTION_SUBMITTED).toBe('mc_solution_submitted');
      expect(AnalyticsEvent.EMAIL_SUBSCRIBED).toBe('mc_email_subscribed');
    });

    it('should have 6 event types', () => {
      const eventCount = Object.keys(AnalyticsEvent).length;
      expect(eventCount).toBe(6);
    });
  });

  describe('trackEvent', () => {
    it('should log event to console', () => {
      trackEvent(AnalyticsEvent.PAGE_VIEW, 'statement-123', 'user-456');

      expect(consoleInfoSpy).toHaveBeenCalledWith('[Analytics]', {
        event: AnalyticsEvent.PAGE_VIEW,
        statementId: 'statement-123',
        userId: 'user-456',
        metadata: undefined,
      });
    });

    it('should call gtag with correct parameters', () => {
      trackEvent(AnalyticsEvent.EVALUATION, 'stmt-1', 'user-1');

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.EVALUATION, {
        statement_id: 'stmt-1',
        user_id: 'user-1',
      });
    });

    it('should include metadata in gtag call', () => {
      const metadata = { custom_field: 'value', score: 5 };
      trackEvent(AnalyticsEvent.EVALUATION, 'stmt-1', 'user-1', metadata);

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.EVALUATION, {
        statement_id: 'stmt-1',
        user_id: 'user-1',
        custom_field: 'value',
        score: 5,
      });
    });

    it('should handle undefined userId', () => {
      trackEvent(AnalyticsEvent.PAGE_VIEW, 'stmt-1');

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.PAGE_VIEW, {
        statement_id: 'stmt-1',
        user_id: undefined,
      });
    });

    it('should not throw when gtag is undefined', () => {
      Object.defineProperty(window, 'gtag', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      expect(() => {
        trackEvent(AnalyticsEvent.PAGE_VIEW, 'stmt-1');
      }).not.toThrow();

      // Should still log to console
      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('should handle complex metadata objects', () => {
      const metadata = {
        nested: { value: 123 },
        array: [1, 2, 3],
        boolean: true,
      };
      trackEvent(AnalyticsEvent.EVALUATION, 'stmt-1', 'user-1', metadata);

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.EVALUATION, {
        statement_id: 'stmt-1',
        user_id: 'user-1',
        nested: { value: 123 },
        array: [1, 2, 3],
        boolean: true,
      });
    });
  });

  describe('trackPageView', () => {
    it('should call trackEvent with PAGE_VIEW event', () => {
      trackPageView('stmt-123', 'user-456');

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.PAGE_VIEW, {
        statement_id: 'stmt-123',
        user_id: 'user-456',
      });
    });

    it('should work without userId', () => {
      trackPageView('stmt-123');

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.PAGE_VIEW, {
        statement_id: 'stmt-123',
        user_id: undefined,
      });
    });

    it('should log to console', () => {
      trackPageView('stmt-123', 'user-456');

      expect(consoleInfoSpy).toHaveBeenCalledWith('[Analytics]', {
        event: AnalyticsEvent.PAGE_VIEW,
        statementId: 'stmt-123',
        userId: 'user-456',
        metadata: undefined,
      });
    });
  });

  describe('trackEvaluation', () => {
    it('should call trackEvent with EVALUATION event and metadata', () => {
      trackEvaluation('stmt-123', 'user-456', 'evaluated-stmt', 5);

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.EVALUATION, {
        statement_id: 'stmt-123',
        user_id: 'user-456',
        evaluated_statement_id: 'evaluated-stmt',
        score: 5,
      });
    });

    it('should handle missing optional parameters', () => {
      trackEvaluation('stmt-123');

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.EVALUATION, {
        statement_id: 'stmt-123',
        user_id: undefined,
        evaluated_statement_id: undefined,
        score: undefined,
      });
    });

    it('should handle partial optional parameters', () => {
      trackEvaluation('stmt-123', 'user-456');

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.EVALUATION, {
        statement_id: 'stmt-123',
        user_id: 'user-456',
        evaluated_statement_id: undefined,
        score: undefined,
      });
    });

    it('should handle negative scores', () => {
      trackEvaluation('stmt-123', 'user-456', 'evaluated-stmt', -1);

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.EVALUATION, {
        statement_id: 'stmt-123',
        user_id: 'user-456',
        evaluated_statement_id: 'evaluated-stmt',
        score: -1,
      });
    });

    it('should handle zero score', () => {
      trackEvaluation('stmt-123', 'user-456', 'evaluated-stmt', 0);

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.EVALUATION, {
        statement_id: 'stmt-123',
        user_id: 'user-456',
        evaluated_statement_id: 'evaluated-stmt',
        score: 0,
      });
    });
  });

  describe('trackNewBatchRequest', () => {
    it('should call trackEvent with NEW_BATCH_REQUEST event', () => {
      trackNewBatchRequest('stmt-123', 'user-456', 3);

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.NEW_BATCH_REQUEST, {
        statement_id: 'stmt-123',
        user_id: 'user-456',
        batch_number: 3,
      });
    });

    it('should handle missing optional parameters', () => {
      trackNewBatchRequest('stmt-123');

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.NEW_BATCH_REQUEST, {
        statement_id: 'stmt-123',
        user_id: undefined,
        batch_number: undefined,
      });
    });

    it('should handle batch number 0', () => {
      trackNewBatchRequest('stmt-123', 'user-456', 0);

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.NEW_BATCH_REQUEST, {
        statement_id: 'stmt-123',
        user_id: 'user-456',
        batch_number: 0,
      });
    });
  });

  describe('trackAddSolutionClick', () => {
    it('should call trackEvent with ADD_SOLUTION_CLICK event', () => {
      trackAddSolutionClick('stmt-123', 'user-456');

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.ADD_SOLUTION_CLICK, {
        statement_id: 'stmt-123',
        user_id: 'user-456',
      });
    });

    it('should work without userId', () => {
      trackAddSolutionClick('stmt-123');

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.ADD_SOLUTION_CLICK, {
        statement_id: 'stmt-123',
        user_id: undefined,
      });
    });
  });

  describe('trackSolutionSubmitted', () => {
    it('should call trackEvent with SOLUTION_SUBMITTED event', () => {
      trackSolutionSubmitted('stmt-123', 'user-456', true);

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.SOLUTION_SUBMITTED, {
        statement_id: 'stmt-123',
        user_id: 'user-456',
        is_new: true,
      });
    });

    it('should handle isNew as false', () => {
      trackSolutionSubmitted('stmt-123', 'user-456', false);

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.SOLUTION_SUBMITTED, {
        statement_id: 'stmt-123',
        user_id: 'user-456',
        is_new: false,
      });
    });

    it('should handle missing optional parameters', () => {
      trackSolutionSubmitted('stmt-123');

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.SOLUTION_SUBMITTED, {
        statement_id: 'stmt-123',
        user_id: undefined,
        is_new: undefined,
      });
    });
  });

  describe('trackEmailSubscribed', () => {
    it('should call trackEvent with EMAIL_SUBSCRIBED event', () => {
      trackEmailSubscribed('stmt-123', 'user-456');

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.EMAIL_SUBSCRIBED, {
        statement_id: 'stmt-123',
        user_id: 'user-456',
      });
    });

    it('should work without userId', () => {
      trackEmailSubscribed('stmt-123');

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.EMAIL_SUBSCRIBED, {
        statement_id: 'stmt-123',
        user_id: undefined,
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty statementId', () => {
      expect(() => {
        trackPageView('');
      }).not.toThrow();

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.PAGE_VIEW, {
        statement_id: '',
        user_id: undefined,
      });
    });

    it('should handle special characters in IDs', () => {
      const specialId = 'stmt-with-special-chars_123!@#$%';
      trackPageView(specialId, 'user-with-special_456');

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.PAGE_VIEW, {
        statement_id: specialId,
        user_id: 'user-with-special_456',
      });
    });

    it('should handle very long IDs', () => {
      const longId = 'a'.repeat(1000);
      trackPageView(longId);

      expect(mockGtag).toHaveBeenCalledWith('event', AnalyticsEvent.PAGE_VIEW, {
        statement_id: longId,
        user_id: undefined,
      });
    });
  });
});

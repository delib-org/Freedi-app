/**
 * Tests for rateLimit utility functions
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  withRateLimit,
  getRateLimitHeaders,
  createRateLimiter,
  RATE_LIMITS,
  RateLimitConfig,
} from '../rateLimit';

// Mock the errorHandling module
jest.mock('../errorHandling', () => ({
  logError: jest.fn(),
}));

// Mock NextResponse.json
jest.mock('next/server', () => {
  const actualModule = jest.requireActual('next/server');
  return {
    ...actualModule,
    NextResponse: {
      ...actualModule.NextResponse,
      json: jest.fn((body, init) => ({
        status: init?.status || 200,
        headers: new Map(Object.entries(init?.headers || {})),
        body,
      })),
    },
  };
});

describe('rateLimit', () => {
  // Helper to create mock NextRequest
  const createMockRequest = (options: {
    ip?: string;
    forwardedFor?: string;
    userId?: string;
  } = {}): NextRequest => {
    const headers = new Headers();
    if (options.forwardedFor) {
      headers.set('x-forwarded-for', options.forwardedFor);
    }

    const cookies = new Map<string, { value: string }>();
    if (options.userId) {
      cookies.set('userId', { value: options.userId });
    }

    return {
      headers,
      cookies: {
        get: (name: string) => cookies.get(name),
      },
      ip: options.ip || '127.0.0.1',
    } as unknown as NextRequest;
  };

  // Clear rate limit store between tests
  // We need to access it indirectly by making enough requests to reset
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset time to allow cleanup
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('RATE_LIMITS', () => {
    it('should have correct STANDARD configuration', () => {
      expect(RATE_LIMITS.STANDARD.maxRequests).toBe(60);
      expect(RATE_LIMITS.STANDARD.windowMs).toBe(60000);
    });

    it('should have correct READ configuration', () => {
      expect(RATE_LIMITS.READ.maxRequests).toBe(120);
      expect(RATE_LIMITS.READ.windowMs).toBe(60000);
    });

    it('should have correct WRITE configuration', () => {
      expect(RATE_LIMITS.WRITE.maxRequests).toBe(20);
      expect(RATE_LIMITS.WRITE.windowMs).toBe(60000);
    });

    it('should have correct SENSITIVE configuration', () => {
      expect(RATE_LIMITS.SENSITIVE.maxRequests).toBe(10);
      expect(RATE_LIMITS.SENSITIVE.windowMs).toBe(60000);
    });

    it('should have correct SURVEY configuration', () => {
      expect(RATE_LIMITS.SURVEY.maxRequests).toBe(100);
      expect(RATE_LIMITS.SURVEY.windowMs).toBe(60000);
    });

    it('should have correct ADMIN configuration', () => {
      expect(RATE_LIMITS.ADMIN.maxRequests).toBe(30);
      expect(RATE_LIMITS.ADMIN.windowMs).toBe(60000);
    });
  });

  describe('checkRateLimit', () => {
    const config: RateLimitConfig = {
      maxRequests: 3,
      windowMs: 1000,
    };

    it('should allow first request', () => {
      const request = createMockRequest({ forwardedFor: 'test-ip-1' });
      const result = checkRateLimit(request, config);
      expect(result).toBeNull();
    });

    it('should allow requests within limit', () => {
      const request = createMockRequest({ forwardedFor: 'test-ip-2' });

      expect(checkRateLimit(request, config)).toBeNull();
      expect(checkRateLimit(request, config)).toBeNull();
      expect(checkRateLimit(request, config)).toBeNull();
    });

    it('should block requests exceeding limit', () => {
      const request = createMockRequest({ forwardedFor: 'test-ip-3' });

      // Use up the limit
      checkRateLimit(request, config);
      checkRateLimit(request, config);
      checkRateLimit(request, config);

      // Fourth request should be blocked
      const result = checkRateLimit(request, config);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(429);
    });

    it('should return 429 response with retry-after header', () => {
      const request = createMockRequest({ forwardedFor: 'test-ip-4' });

      // Exhaust limit
      for (let i = 0; i < config.maxRequests; i++) {
        checkRateLimit(request, config);
      }

      const result = checkRateLimit(request, config);
      expect(result?.headers.get('Retry-After')).toBeDefined();
    });

    it('should use custom message when provided', () => {
      const customConfig: RateLimitConfig = {
        ...config,
        message: 'Custom rate limit message',
      };
      const request = createMockRequest({ forwardedFor: 'test-ip-5' });

      // Exhaust limit
      for (let i = 0; i < customConfig.maxRequests; i++) {
        checkRateLimit(request, customConfig);
      }

      const result = checkRateLimit(request, customConfig) as { body: { error: string } } | null;
      expect(result?.body.error).toBe('Custom rate limit message');
    });

    it('should reset after window expires', () => {
      const request = createMockRequest({ forwardedFor: 'test-ip-6' });

      // Exhaust limit
      for (let i = 0; i < config.maxRequests; i++) {
        checkRateLimit(request, config);
      }

      // Should be blocked
      expect(checkRateLimit(request, config)).not.toBeNull();

      // Advance time past window
      jest.advanceTimersByTime(config.windowMs + 100);

      // Should be allowed again
      expect(checkRateLimit(request, config)).toBeNull();
    });

    it('should use userId as key when available', () => {
      const userRequest = createMockRequest({
        forwardedFor: 'shared-ip',
        userId: 'user-123',
      });
      const anonRequest = createMockRequest({
        forwardedFor: 'shared-ip',
      });

      // Both should be allowed independently
      expect(checkRateLimit(userRequest, config)).toBeNull();
      expect(checkRateLimit(anonRequest, config)).toBeNull();
    });

    it('should use custom keyGenerator when provided', () => {
      const customConfig: RateLimitConfig = {
        ...config,
        keyGenerator: (_req) => 'custom-key',
      };

      const request1 = createMockRequest({ forwardedFor: 'ip-1' });
      const request2 = createMockRequest({ forwardedFor: 'ip-2' });

      // Both should share the same key
      checkRateLimit(request1, customConfig);
      checkRateLimit(request1, customConfig);
      checkRateLimit(request2, customConfig); // Uses same key

      // Should be blocked (3 requests to same key)
      expect(checkRateLimit(request2, customConfig)).not.toBeNull();
    });

    it('should handle missing x-forwarded-for header', () => {
      const request = createMockRequest({});
      const result = checkRateLimit(request, config);
      expect(result).toBeNull();
    });

    it('should use first IP from comma-separated x-forwarded-for', () => {
      const request = createMockRequest({
        forwardedFor: '1.2.3.4, 5.6.7.8, 9.10.11.12',
      });
      const result = checkRateLimit(request, config);
      expect(result).toBeNull();
    });
  });

  describe('withRateLimit', () => {
    const config: RateLimitConfig = {
      maxRequests: 2,
      windowMs: 1000,
    };

    it('should call handler when not rate limited', async () => {
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ success: true })
      );
      const wrapped = withRateLimit(handler, config);

      const request = createMockRequest({ forwardedFor: 'wrap-test-1' });
      await wrapped(request);

      expect(handler).toHaveBeenCalledWith(request, undefined);
    });

    it('should not call handler when rate limited', async () => {
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ success: true })
      );
      const wrapped = withRateLimit(handler, config);

      const request = createMockRequest({ forwardedFor: 'wrap-test-2' });

      // Exhaust limit
      await wrapped(request);
      await wrapped(request);

      // Clear call count
      handler.mockClear();

      // This should be blocked
      await wrapped(request);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should return rate limit response when blocked', async () => {
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ success: true })
      );
      const wrapped = withRateLimit(handler, config);

      const request = createMockRequest({ forwardedFor: 'wrap-test-3' });

      await wrapped(request);
      await wrapped(request);

      const result = await wrapped(request);
      expect(result.status).toBe(429);
    });

    it('should pass context to handler', async () => {
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ success: true })
      );
      const wrapped = withRateLimit(handler, config);

      const request = createMockRequest({ forwardedFor: 'wrap-test-4' });
      const context = { params: { id: '123' } };

      await wrapped(request, context);

      expect(handler).toHaveBeenCalledWith(request, context);
    });
  });

  describe('getRateLimitHeaders', () => {
    const config: RateLimitConfig = {
      maxRequests: 10,
      windowMs: 1000,
    };

    it('should return full limit when no requests made', () => {
      const request = createMockRequest({ forwardedFor: 'header-test-1' });
      const headers = getRateLimitHeaders(request, config);

      expect(headers['X-RateLimit-Limit']).toBe('10');
      expect(headers['X-RateLimit-Remaining']).toBe('10');
    });

    it('should return correct remaining after requests', () => {
      const request = createMockRequest({ forwardedFor: 'header-test-2' });

      // Make some requests
      checkRateLimit(request, config);
      checkRateLimit(request, config);
      checkRateLimit(request, config);

      const headers = getRateLimitHeaders(request, config);

      expect(headers['X-RateLimit-Limit']).toBe('10');
      expect(headers['X-RateLimit-Remaining']).toBe('7');
    });

    it('should return 0 remaining when limit reached', () => {
      const request = createMockRequest({ forwardedFor: 'header-test-3' });

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        checkRateLimit(request, config);
      }

      const headers = getRateLimitHeaders(request, config);

      expect(headers['X-RateLimit-Remaining']).toBe('0');
    });

    it('should include reset time when entry exists', () => {
      const request = createMockRequest({ forwardedFor: 'header-test-4' });

      checkRateLimit(request, config);

      const headers = getRateLimitHeaders(request, config);

      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('should use custom keyGenerator', () => {
      const customConfig: RateLimitConfig = {
        ...config,
        keyGenerator: () => 'custom-header-key',
      };

      const request1 = createMockRequest({ forwardedFor: 'ip-a' });
      const request2 = createMockRequest({ forwardedFor: 'ip-b' });

      checkRateLimit(request1, customConfig);
      checkRateLimit(request1, customConfig);

      // Request2 should see same remaining (shared key)
      const headers = getRateLimitHeaders(request2, customConfig);
      expect(headers['X-RateLimit-Remaining']).toBe('8');
    });
  });

  describe('createRateLimiter', () => {
    const config: RateLimitConfig = {
      maxRequests: 5,
      windowMs: 1000,
    };

    it('should create limiter with check method', () => {
      const limiter = createRateLimiter(config);
      expect(typeof limiter.check).toBe('function');
    });

    it('should create limiter with wrap method', () => {
      const limiter = createRateLimiter(config);
      expect(typeof limiter.wrap).toBe('function');
    });

    it('should create limiter with getHeaders method', () => {
      const limiter = createRateLimiter(config);
      expect(typeof limiter.getHeaders).toBe('function');
    });

    it('check method should work correctly', () => {
      const limiter = createRateLimiter(config);
      const request = createMockRequest({ forwardedFor: 'limiter-test-1' });

      expect(limiter.check(request)).toBeNull();
    });

    it('wrap method should work correctly', async () => {
      const limiter = createRateLimiter(config);
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ success: true })
      );
      const wrapped = limiter.wrap(handler);

      const request = createMockRequest({ forwardedFor: 'limiter-test-2' });
      await wrapped(request);

      expect(handler).toHaveBeenCalled();
    });

    it('getHeaders method should work correctly', () => {
      const limiter = createRateLimiter(config);
      const request = createMockRequest({ forwardedFor: 'limiter-test-3' });

      const headers = limiter.getHeaders(request);

      expect(headers['X-RateLimit-Limit']).toBe('5');
    });
  });

  describe('client identification', () => {
    const config: RateLimitConfig = {
      maxRequests: 3,
      windowMs: 1000,
    };

    it('should identify by IP when no userId', () => {
      const request1 = createMockRequest({ forwardedFor: 'unique-ip-1' });
      const request2 = createMockRequest({ forwardedFor: 'unique-ip-2' });

      // Both should be allowed independently
      checkRateLimit(request1, config);
      checkRateLimit(request1, config);
      checkRateLimit(request1, config);

      // request2 should still be allowed
      expect(checkRateLimit(request2, config)).toBeNull();
    });

    it('should identify by userId when present', () => {
      const request1 = createMockRequest({
        forwardedFor: 'same-ip',
        userId: 'user-1',
      });
      const request2 = createMockRequest({
        forwardedFor: 'same-ip',
        userId: 'user-2',
      });

      // Exhaust user-1 limit
      checkRateLimit(request1, config);
      checkRateLimit(request1, config);
      checkRateLimit(request1, config);

      // user-2 should still be allowed
      expect(checkRateLimit(request2, config)).toBeNull();
    });

    it('should prioritize userId over IP', () => {
      const userRequest = createMockRequest({
        forwardedFor: 'shared-ip',
        userId: 'special-user',
      });
      const ipRequest = createMockRequest({
        forwardedFor: 'shared-ip',
      });

      // These should be tracked separately
      checkRateLimit(userRequest, config);
      checkRateLimit(userRequest, config);
      checkRateLimit(userRequest, config);

      // IP-based should still be allowed
      expect(checkRateLimit(ipRequest, config)).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should fail open on error', () => {
      const badConfig: RateLimitConfig = {
        maxRequests: 5,
        windowMs: 1000,
        keyGenerator: () => {
          throw new Error('Key generation failed');
        },
      };

      const request = createMockRequest({ forwardedFor: 'error-test' });

      // Should allow request despite error
      const result = checkRateLimit(request, badConfig);
      expect(result).toBeNull();
    });
  });
});

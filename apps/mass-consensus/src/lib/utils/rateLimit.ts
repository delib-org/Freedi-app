import { NextRequest, NextResponse } from 'next/server';
import { logError } from './errorHandling';

/**
 * Rate Limiting Configuration
 * Configurable per-endpoint rate limits
 */
export interface RateLimitConfig {
	/** Maximum number of requests allowed in the window */
	maxRequests: number;
	/** Time window in milliseconds */
	windowMs: number;
	/** Custom identifier function (defaults to IP) */
	keyGenerator?: (request: NextRequest) => string;
	/** Message to show when rate limited */
	message?: string;
}

interface RateLimitEntry {
	count: number;
	resetTime: number;
}

/**
 * In-memory rate limit store
 * For production with multiple instances, consider using Redis
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clean up expired entries periodically
 */
const CLEANUP_INTERVAL = 60000; // 1 minute
let lastCleanup = Date.now();

function cleanupExpiredEntries(): void {
	const now = Date.now();
	if (now - lastCleanup < CLEANUP_INTERVAL) return;

	lastCleanup = now;
	for (const [key, entry] of rateLimitStore.entries()) {
		if (entry.resetTime < now) {
			rateLimitStore.delete(key);
		}
	}
}

/**
 * Default rate limit configurations for different endpoint types
 */
export const RATE_LIMITS = {
	/** Standard API endpoints - 60 requests per minute */
	STANDARD: {
		maxRequests: 60,
		windowMs: 60 * 1000,
	},
	/** Read-heavy endpoints - 120 requests per minute */
	READ: {
		maxRequests: 120,
		windowMs: 60 * 1000,
	},
	/** Write endpoints (submit, create) - 20 requests per minute */
	WRITE: {
		maxRequests: 20,
		windowMs: 60 * 1000,
	},
	/** Sensitive endpoints (AI, expensive operations) - 10 requests per minute */
	SENSITIVE: {
		maxRequests: 10,
		windowMs: 60 * 1000,
	},
	/** Survey progress - more lenient - 100 requests per minute */
	SURVEY: {
		maxRequests: 100,
		windowMs: 60 * 1000,
	},
	/** Admin endpoints - 30 requests per minute */
	ADMIN: {
		maxRequests: 30,
		windowMs: 60 * 1000,
	},
} as const;

/**
 * Get client identifier from request
 * Uses X-Forwarded-For for proxied requests, falls back to IP
 */
function getClientId(request: NextRequest): string {
	const forwarded = request.headers.get('x-forwarded-for');
	const ip = forwarded?.split(',')[0]?.trim() || 'unknown';

	// Also consider user ID from cookie for logged-in users
	const userId = request.cookies.get('userId')?.value;

	return userId ? `user:${userId}` : `ip:${ip}`;
}

/**
 * Check if a request should be rate limited
 * Returns null if allowed, or a NextResponse if rate limited
 */
export function checkRateLimit(
	request: NextRequest,
	config: RateLimitConfig
): NextResponse | null {
	try {
		cleanupExpiredEntries();

		const key = config.keyGenerator
			? config.keyGenerator(request)
			: getClientId(request);

		const now = Date.now();
		const entry = rateLimitStore.get(key);

		if (!entry || entry.resetTime < now) {
			// Create new entry or reset expired one
			rateLimitStore.set(key, {
				count: 1,
				resetTime: now + config.windowMs,
			});
			return null; // Allowed
		}

		if (entry.count >= config.maxRequests) {
			// Rate limited
			const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

			logError(new Error('Rate limit exceeded'), {
				operation: 'rateLimit.check',
				metadata: {
					key,
					count: entry.count,
					maxRequests: config.maxRequests,
					retryAfter,
				},
			});

			return NextResponse.json(
				{
					error: config.message || 'Too many requests. Please try again later.',
					retryAfter,
				},
				{
					status: 429,
					headers: {
						'Retry-After': retryAfter.toString(),
						'X-RateLimit-Limit': config.maxRequests.toString(),
						'X-RateLimit-Remaining': '0',
						'X-RateLimit-Reset': entry.resetTime.toString(),
					},
				}
			);
		}

		// Increment count
		entry.count++;
		return null; // Allowed
	} catch (error) {
		// On error, allow the request (fail open)
		logError(error, {
			operation: 'rateLimit.check',
			metadata: { error: 'Rate limit check failed' },
		});
		return null;
	}
}

/**
 * Rate limit middleware wrapper for API routes
 * Use this to wrap your route handler
 *
 * @example
 * export const POST = withRateLimit(
 *   async (request) => {
 *     // Your handler logic
 *     return NextResponse.json({ success: true });
 *   },
 *   RATE_LIMITS.WRITE
 * );
 */
export function withRateLimit<T extends NextRequest>(
	handler: (request: T, context?: unknown) => Promise<NextResponse>,
	config: RateLimitConfig
): (request: T, context?: unknown) => Promise<NextResponse> {
	return async (request: T, context?: unknown) => {
		const rateLimitResponse = checkRateLimit(request, config);
		if (rateLimitResponse) {
			return rateLimitResponse;
		}
		return handler(request, context);
	};
}

/**
 * Get rate limit headers for successful responses
 * Call this to add rate limit info to successful responses
 */
export function getRateLimitHeaders(
	request: NextRequest,
	config: RateLimitConfig
): Record<string, string> {
	const key = config.keyGenerator
		? config.keyGenerator(request)
		: getClientId(request);

	const entry = rateLimitStore.get(key);

	if (!entry) {
		return {
			'X-RateLimit-Limit': config.maxRequests.toString(),
			'X-RateLimit-Remaining': config.maxRequests.toString(),
		};
	}

	const remaining = Math.max(0, config.maxRequests - entry.count);

	return {
		'X-RateLimit-Limit': config.maxRequests.toString(),
		'X-RateLimit-Remaining': remaining.toString(),
		'X-RateLimit-Reset': entry.resetTime.toString(),
	};
}

/**
 * Create a custom rate limiter with specific configuration
 * Useful for per-endpoint limits
 */
export function createRateLimiter(config: RateLimitConfig) {
	return {
		check: (request: NextRequest) => checkRateLimit(request, config),
		wrap: <T extends NextRequest>(
			handler: (request: T, context?: unknown) => Promise<NextResponse>
		) => withRateLimit(handler, config),
		getHeaders: (request: NextRequest) => getRateLimitHeaders(request, config),
	};
}

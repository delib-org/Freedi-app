import { createHash } from 'crypto';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Request, Response } from 'firebase-functions/v1';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../db';
import type { RateBudget } from '../config/rateBudgets';
import { logError } from './errorHandling';

/**
 * Firestore rate limiter shared by every AI and email endpoint.
 *
 * A transaction on a window document is the only lock that survives cold starts
 * and parallel instances; an in-memory counter would reset with each container.
 *
 * A limiter error is not a verdict. If Firestore cannot settle a transaction
 * (contention on a busy counter included) the call goes through and the error is
 * logged, so a full classroom is not locked out by its own traffic. Only a counter
 * that is really exhausted refuses. Email budgets are the exception and fail
 * closed: sent mail cannot be recalled.
 *
 * `apiRateLimits` has no rule in firestore.rules, so clients cannot read or write it.
 */

export const API_RATE_LIMITS_COLLECTION = 'apiRateLimits';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** A global counter is split so one busy day does not hit Firestore's write rate on one document. */
const MAX_GLOBAL_SHARDS = 16;
const MIN_SLOTS_PER_SHARD = 100;
/** Windows are kept a little past their end so a TTL policy on `expireAt` can reap them. */
const EXPIRE_AFTER_WINDOWS = 2;

interface WindowDoc {
	windowStart?: number;
	count?: number;
}

export interface WindowSlot {
	collection: string;
	docId: string;
	limit: number;
	windowMs: number;
	/** Names the budget in Cloud Logging. Never shown to users. */
	label: string;
	now: number;
	/** Slots this call consumes, for budgets counted in recipients rather than calls */
	cost?: number;
	/** Adds `expireAt` for a Firestore TTL policy. Off for callers that manage their own docs. */
	expires?: boolean;
}

/** Consume slots from a rolling window, or throw `resource-exhausted`. */
export async function reserveWindowSlot({
	collection,
	docId,
	limit,
	windowMs,
	label,
	now,
	cost = 1,
	expires = false,
}: WindowSlot): Promise<void> {
	const ref = db.collection(collection).doc(docId);

	await db.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		const data = (snap.data() ?? {}) as WindowDoc;
		const windowStart = typeof data.windowStart === 'number' ? data.windowStart : 0;
		const inWindow = now - windowStart < windowMs;
		const count = inWindow && typeof data.count === 'number' ? data.count : 0;

		if (count + cost > limit) {
			throw new HttpsError('resource-exhausted', `${label} limit reached`);
		}

		const nextWindowStart = inWindow ? windowStart : now;
		tx.set(
			ref,
			{
				windowStart: nextWindowStart,
				count: count + cost,
				lastUpdate: now,
				// A Timestamp rather than ms: Firestore TTL policies only read date values.
				...(expires && {
					expireAt: Timestamp.fromMillis(nextWindowStart + windowMs * EXPIRE_AFTER_WINDOWS),
				}),
			},
			{ merge: true },
		);
	});
}

function shardCount(globalPerDay: number): number {
	return Math.max(1, Math.min(MAX_GLOBAL_SHARDS, Math.floor(globalPerDay / MIN_SLOTS_PER_SHARD)));
}

/**
 * The address of the caller, or undefined when it cannot be told.
 *
 * Only the LAST x-forwarded-for entry is trusted: Google's front end appends the
 * address it saw, and everything to its left came from the client. `req.ip` is
 * not used because with `trust proxy` it returns the leftmost, forgeable, entry.
 */
export function clientIp(req: Pick<Request, 'headers'>): string | undefined {
	const header = req.headers['x-forwarded-for'];
	const raw = Array.isArray(header) ? header.join(',') : header;
	const last = raw?.split(',').pop()?.trim();

	return last || undefined;
}

/** Addresses are personal data and only ever compared, so only a digest is stored. */
function hashIp(ip: string): string {
	return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

function isExhausted(error: unknown): boolean {
	return error instanceof HttpsError && error.code === 'resource-exhausted';
}

/**
 * One counter of a budget. Real exhaustion always propagates; any other failure
 * propagates only for a fail-closed budget and is otherwise logged and skipped.
 */
async function reserveCounter(budget: RateBudget, uid: string, slot: WindowSlot): Promise<void> {
	try {
		await reserveWindowSlot(slot);
	} catch (error) {
		if (isExhausted(error) || budget.failClosed) throw error;
		logError(error, {
			operation: 'rateLimit.reserveRateBudget',
			userId: uid,
			metadata: { budget: budget.name, counter: slot.label, failedOpen: true },
		});
	}
}

/**
 * Reserve one call against a budget.
 *
 * Narrowest first, so a single abuser exhausts their own uid and address before
 * touching the global counter. Otherwise one script could lock every other
 * participant out for the day by burning the shared budget.
 */
export async function reserveRateBudget(
	budget: RateBudget,
	uid: string,
	ip: string | undefined,
	now: number = Date.now(),
): Promise<void> {
	const collection = API_RATE_LIMITS_COLLECTION;

	await reserveCounter(budget, uid, {
		collection,
		docId: `${budget.name}__uid__${uid}`,
		limit: budget.perUidPerHour,
		windowMs: HOUR_MS,
		label: `${budget.name} per-uid`,
		now,
		expires: true,
	});

	if (budget.perIpPerHour !== undefined && ip) {
		await reserveCounter(budget, uid, {
			collection,
			docId: `${budget.name}__ip__${hashIp(ip)}`,
			limit: budget.perIpPerHour,
			windowMs: HOUR_MS,
			label: `${budget.name} per-ip`,
			now,
			expires: true,
		});
	}

	const shards = shardCount(budget.globalPerDay);
	await reserveCounter(budget, uid, {
		collection,
		docId: `${budget.name}__global__${Math.floor(Math.random() * shards)}`,
		limit: Math.ceil(budget.globalPerDay / shards),
		windowMs: DAY_MS,
		label: `${budget.name} global daily`,
		now,
		expires: true,
	});
}

/** Log a fail-closed budget's limiter error. A plain refusal needs no log entry. */
function logLimiterFailure(error: unknown, budget: RateBudget, uid: string): void {
	if (isExhausted(error)) return;
	logError(error, {
		operation: 'rateLimit.reserveRateBudget',
		userId: uid,
		metadata: { budget: budget.name, failedOpen: false },
	});
}

/** HTTP form. Writes a 429 and returns false when the call may not proceed. */
export async function passesHttpRateLimit(
	req: Request,
	res: Response,
	budget: RateBudget,
	uid: string,
): Promise<boolean> {
	try {
		await reserveRateBudget(budget, uid, clientIp(req));

		return true;
	} catch (error) {
		logLimiterFailure(error, budget, uid);
		res.status(429).json({ ok: false, error: 'Too many requests. Please try again later.' });

		return false;
	}
}

/** Callable form. Throws `resource-exhausted` when the call may not proceed. */
export async function enforceCallableRateLimit(
	request: CallableRequest<unknown>,
	budget: RateBudget,
	uid: string,
): Promise<void> {
	try {
		await reserveRateBudget(budget, uid, clientIp(request.rawRequest));
	} catch (error) {
		logLimiterFailure(error, budget, uid);
		throw new HttpsError('resource-exhausted', 'Too many requests. Please try again later.');
	}
}

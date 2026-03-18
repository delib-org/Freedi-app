/**
 * Credit Engine - Phase 1
 *
 * Processes credit awards inside a Firestore transaction:
 * 1. Load credit rule for action
 * 2. Quality gate check (min text length, etc.)
 * 3. Cooldown check (last award time for same action)
 * 4. Daily limit check
 * 5. Diminishing returns (each repeated action = 90% of previous)
 * 6. App multiplier
 * 7. Atomic write: creditLedger doc + update userEngagement balance
 * 8. Check level-up -> if yes, trigger LEVEL_UP notification
 * 9. Check badge triggers -> if earned, trigger BADGE_EARNED notification
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, CreditAction, EngagementLevel, SourceApp } from '@freedi/shared-types';
import type { CreditRule, CreditTransaction, UserEngagement } from '@freedi/shared-types';
import { getCreditRule } from './creditRules';
import { checkAndNotifyLevelUp } from './levelProgression';
import { checkAndAwardBadges } from './badgeEngine';

const getDb = () => getFirestore();

const DAILY_CREDIT_CAP = 100;
const DIMINISHING_FACTOR = 0.9;

/** 24-hour trial window for new users (in ms) */
const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;

interface AwardCreditParams {
	userId: string;
	action: CreditAction;
	sourceApp: SourceApp;
	statementId?: string;
	parentId?: string;
	topParentId?: string;
	/** Text content for quality gate check */
	textContent?: string;
	metadata?: Record<string, string>;
}

interface AwardCreditResult {
	success: boolean;
	amount: number;
	reason?: string;
	leveledUp?: boolean;
	newLevel?: EngagementLevel;
}

/**
 * Award credits to a user for an action.
 * Performs all validation (cooldown, daily limit, quality gate, diminishing returns)
 * and writes atomically via a Firestore transaction.
 */
export async function awardCredit(params: AwardCreditParams): Promise<AwardCreditResult> {
	const { userId, action, sourceApp, statementId, parentId, topParentId, textContent, metadata } =
		params;

	try {
		// 1. Load credit rule
		const rule = await getCreditRule(action);
		if (!rule) {
			return { success: false, amount: 0, reason: 'Rule disabled or not found' };
		}

		// 2. Quality gate check
		const qualityResult = checkQualityGate(rule, textContent);
		if (!qualityResult.passed) {
			return { success: false, amount: 0, reason: qualityResult.reason };
		}

		const today = formatDate(new Date());
		const engagementRef = getDb().collection(Collections.userEngagement).doc(userId);

		// Run the credit award in a transaction
		const result = await getDb().runTransaction(async (transaction) => {
			// Load user engagement doc
			const engagementDoc = await transaction.get(engagementRef);
			let engagement: UserEngagement;

			if (!engagementDoc.exists) {
				// Create initial engagement for new user with trial mode
				engagement = createInitialEngagement(userId);
			} else {
				engagement = engagementDoc.data() as UserEngagement;
			}

			// Reset daily counter if it's a new day
			if (engagement.dailyCreditResetDate !== today) {
				engagement.dailyCreditsEarned = 0;
				engagement.dailyCreditResetDate = today;
			}

			// 3. Cooldown check
			if (rule.cooldownMs > 0) {
				const cooldownPassed = await isCooldownElapsed(userId, action, rule.cooldownMs);
				if (!cooldownPassed) {
					return { success: false, amount: 0, reason: 'Cooldown not elapsed' };
				}
			}

			// 4. Daily limit check
			const todayCount = await getDailyActionCount(userId, action, today);
			if (todayCount >= rule.dailyLimit) {
				return { success: false, amount: 0, reason: 'Daily limit reached' };
			}

			// 5. Daily credit cap check
			const dailyEarned = engagement.dailyCreditsEarned ?? 0;
			if (dailyEarned >= DAILY_CREDIT_CAP) {
				return { success: false, amount: 0, reason: 'Daily credit cap reached' };
			}

			// 6. Calculate amount with diminishing returns
			let amount = rule.baseAmount;
			if (todayCount > 0) {
				amount = Math.max(1, Math.floor(amount * Math.pow(DIMINISHING_FACTOR, todayCount)));
			}

			// 7. Apply app multiplier
			if (rule.appMultipliers) {
				const multiplier = rule.appMultipliers[sourceApp];
				if (multiplier !== undefined) {
					amount = Math.max(1, Math.floor(amount * multiplier));
				}
			}

			// 8. Apply daily cap
			const remainingCap = DAILY_CREDIT_CAP - dailyEarned;
			amount = Math.min(amount, remainingCap);

			if (amount <= 0) {
				return { success: false, amount: 0, reason: 'Amount reduced to zero' };
			}

			// 9. Create credit transaction
			const transactionId = `${userId}_${action}_${Date.now()}`;
			const creditTx: CreditTransaction = {
				transactionId,
				userId,
				action,
				amount,
				sourceApp,
				statementId,
				parentId,
				topParentId,
				metadata,
				createdAt: Date.now(),
			};

			const txRef = getDb().collection(Collections.creditLedger).doc(transactionId);
			transaction.set(txRef, creditTx);

			// 10. Update user engagement
			const oldLevel = engagement.level;
			const newTotalCredits = engagement.totalCredits + amount;
			const newLevel = calculateLevel(newTotalCredits);

			const engagementUpdate: Record<string, unknown> = {
				totalCredits: newTotalCredits,
				level: newLevel,
				dailyCreditsEarned: (engagement.dailyCreditsEarned ?? 0) + amount,
				dailyCreditResetDate: today,
				lastUpdate: Date.now(),
			};

			// Update stat counters
			const statField = getStatFieldForAction(action);
			if (statField) {
				engagementUpdate[statField] = FieldValue.increment(1);
			}

			if (!engagementDoc.exists) {
				// Set the full initial doc
				engagement.totalCredits = newTotalCredits;
				engagement.level = newLevel;
				engagement.dailyCreditsEarned = amount;
				engagement.dailyCreditResetDate = today;
				engagement.lastUpdate = Date.now();
				transaction.set(engagementRef, engagement);
			} else {
				transaction.update(engagementRef, engagementUpdate);
			}

			return {
				success: true,
				amount,
				oldLevel,
				newLevel,
				leveledUp: newLevel > oldLevel,
				engagement: { ...engagement, totalCredits: newTotalCredits, level: newLevel },
			};
		});

		if (!result.success) {
			return { success: false, amount: result.amount, reason: result.reason };
		}

		// Post-transaction: notifications (non-blocking)
		const txResult = result as {
			success: true;
			amount: number;
			oldLevel: EngagementLevel;
			newLevel: EngagementLevel;
			leveledUp: boolean;
			engagement: UserEngagement;
		};

		if (txResult.leveledUp) {
			checkAndNotifyLevelUp(userId, txResult.oldLevel, txResult.newLevel, sourceApp).catch(
				(error: unknown) => logger.error('Level-up notification failed', { userId, error }),
			);
		}

		// Check badges (non-blocking)
		checkAndAwardBadges(userId, txResult.engagement, sourceApp)
			.then((newBadges) => {
				if (newBadges.length > 0) {
					// Append badges to engagement doc
					getDb()
						.collection(Collections.userEngagement)
						.doc(userId)
						.update({
							badges: FieldValue.arrayUnion(...newBadges),
						})
						.catch((error: unknown) => logger.error('Badge update failed', { userId, error }));
				}
			})
			.catch((error: unknown) => logger.error('Badge check failed', { userId, error }));

		return {
			success: true,
			amount: txResult.amount,
			leveledUp: txResult.leveledUp,
			newLevel: txResult.leveledUp ? txResult.newLevel : undefined,
		};
	} catch (error) {
		logger.error('Credit award failed', { userId, action, error });

		return { success: false, amount: 0, reason: 'Internal error' };
	}
}

/**
 * Get or create user engagement document.
 * Used by external callers that need to read engagement state.
 */
export async function getOrCreateUserEngagement(userId: string): Promise<UserEngagement> {
	const ref = getDb().collection(Collections.userEngagement).doc(userId);
	const doc = await ref.get();

	if (doc.exists) {
		return doc.data() as UserEngagement;
	}

	const engagement = createInitialEngagement(userId);
	await ref.set(engagement);

	return engagement;
}

// ── Internal helpers ──

function createInitialEngagement(userId: string): UserEngagement {
	const now = Date.now();

	return {
		userId,
		totalCredits: 0,
		level: EngagementLevel.OBSERVER,
		badges: [],
		streak: {
			currentStreak: 0,
			longestStreak: 0,
			lastActiveDate: '',
		},
		digestPreferences: {
			dailyDigest: true,
			weeklyDigest: true,
			timezone: 'UTC',
		},
		trialModeActive: true,
		trialModeExpiresAt: now + TRIAL_DURATION_MS,
		totalEvaluations: 0,
		totalOptions: 0,
		totalComments: 0,
		totalVotes: 0,
		dailyCreditsEarned: 0,
		dailyCreditResetDate: formatDate(new Date()),
		createdAt: now,
		lastUpdate: now,
	};
}

function checkQualityGate(
	rule: CreditRule,
	textContent?: string,
): { passed: boolean; reason?: string } {
	if (!rule.qualityGate) {
		return { passed: true };
	}

	if (rule.qualityGate.minTextLength && textContent !== undefined) {
		if (textContent.length < rule.qualityGate.minTextLength) {
			return {
				passed: false,
				reason: `Text too short (min ${rule.qualityGate.minTextLength} chars)`,
			};
		}
	}

	return { passed: true };
}

async function isCooldownElapsed(
	userId: string,
	action: CreditAction,
	cooldownMs: number,
): Promise<boolean> {
	const cutoff = Date.now() - cooldownMs;
	const recentTx = await getDb()
		.collection(Collections.creditLedger)
		.where('userId', '==', userId)
		.where('action', '==', action)
		.where('createdAt', '>', cutoff)
		.limit(1)
		.get();

	return recentTx.empty;
}

async function getDailyActionCount(
	userId: string,
	action: CreditAction,
	today: string,
): Promise<number> {
	// Get start of day timestamp
	const dayStart = new Date(today).getTime();
	const dayEnd = dayStart + 24 * 60 * 60 * 1000;

	const snapshot = await getDb()
		.collection(Collections.creditLedger)
		.where('userId', '==', userId)
		.where('action', '==', action)
		.where('createdAt', '>=', dayStart)
		.where('createdAt', '<', dayEnd)
		.get();

	return snapshot.size;
}

function calculateLevel(totalCredits: number): EngagementLevel {
	if (totalCredits >= 1500) return EngagementLevel.LEADER;
	if (totalCredits >= 500) return EngagementLevel.ADVOCATE;
	if (totalCredits >= 200) return EngagementLevel.CONTRIBUTOR;
	if (totalCredits >= 50) return EngagementLevel.PARTICIPANT;

	return EngagementLevel.OBSERVER;
}

function getStatFieldForAction(action: CreditAction): string | null {
	switch (action) {
		case CreditAction.EVALUATE_OPTION:
			return 'totalEvaluations';
		case CreditAction.CREATE_OPTION:
			return 'totalOptions';
		case CreditAction.COMMENT:
			return 'totalComments';
		case CreditAction.VOTE:
			return 'totalVotes';
		default:
			return null;
	}
}

function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');

	return `${year}-${month}-${day}`;
}

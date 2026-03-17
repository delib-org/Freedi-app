/**
 * Engagement Tracking - Phase 1
 *
 * Entry points for tracking engagement events from existing Firebase triggers.
 * These functions are called from consolidated triggers (fn_statementCreation, etc.)
 * and are non-blocking: failures never break core functionality.
 */

import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import {
	CreditAction,
	SourceApp,
	Collections,
} from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { awardCredit, getOrCreateUserEngagement } from './creditEngine';

const getDb = () => getFirestore();

/**
 * Track statement creation engagement.
 * Called from onStatementCreated trigger.
 */
export async function trackStatementCreation(
	statement: Statement,
	sourceApp: SourceApp = SourceApp.MAIN,
): Promise<void> {
	try {
		const userId = statement.creator?.uid;
		if (!userId) return;

		let action: CreditAction;
		switch (statement.statementType) {
			case 'option':
				action = CreditAction.CREATE_OPTION;
				break;
			case 'statement':
			case 'question':
				// Creating a group/question - JOIN_DISCUSSION
				action = CreditAction.JOIN_DISCUSSION;
				break;
			default:
				action = CreditAction.COMMENT;
				break;
		}

		await awardCredit({
			userId,
			action,
			sourceApp,
			statementId: statement.statementId,
			parentId: statement.parentId,
			topParentId: statement.topParentId,
			textContent: statement.statement,
		});

		// Update streak
		await updateStreakForUser(userId);
	} catch (error) {
		logger.warn('Engagement tracking failed for statement creation', {
			statementId: statement.statementId,
			error,
		});
	}
}

/**
 * Track evaluation engagement.
 * Called from evaluation triggers (newEvaluation, updateEvaluation).
 */
export async function trackEvaluationEngagement(
	statementId: string,
	userId: string,
	parentId: string,
	topParentId?: string,
	sourceApp: SourceApp = SourceApp.MAIN,
): Promise<void> {
	try {
		await awardCredit({
			userId,
			action: CreditAction.EVALUATE_OPTION,
			sourceApp,
			statementId,
			parentId,
			topParentId,
		});

		await updateStreakForUser(userId);
	} catch (error) {
		logger.warn('Engagement tracking failed for evaluation', {
			statementId,
			userId,
			error,
		});
	}
}

/**
 * Track vote engagement.
 * Called from vote triggers.
 */
export async function trackVoteEngagement(
	statementId: string,
	userId: string,
	parentId: string,
	topParentId?: string,
	sourceApp: SourceApp = SourceApp.MAIN,
): Promise<void> {
	try {
		await awardCredit({
			userId,
			action: CreditAction.VOTE,
			sourceApp,
			statementId,
			parentId,
			topParentId,
		});

		await updateStreakForUser(userId);
	} catch (error) {
		logger.warn('Engagement tracking failed for vote', {
			statementId,
			userId,
			error,
		});
	}
}

/**
 * Track daily login.
 * Can be called from an HTTP endpoint or triggered on first action of the day.
 */
export async function trackDailyLogin(
	userId: string,
	sourceApp: SourceApp = SourceApp.MAIN,
): Promise<void> {
	try {
		await awardCredit({
			userId,
			action: CreditAction.DAILY_LOGIN,
			sourceApp,
		});

		const engagement = await getOrCreateUserEngagement(userId);

		// Check streak bonus (7-day streak)
		if (engagement.streak.currentStreak >= 7 && engagement.streak.currentStreak % 7 === 0) {
			await awardCredit({
				userId,
				action: CreditAction.STREAK_BONUS,
				sourceApp,
			});
		}
	} catch (error) {
		logger.warn('Engagement tracking failed for daily login', { userId, error });
	}
}

// ── Internal helpers ──

/**
 * Update streak data for a user (mark as active today).
 */
async function updateStreakForUser(userId: string): Promise<void> {
	const today = formatDate(new Date());
	const ref = getDb().collection(Collections.userEngagement).doc(userId);
	const doc = await ref.get();

	if (!doc.exists) {
		// Will be created by awardCredit
		return;
	}

	const engagement = doc.data() as { streak?: { lastActiveDate?: string; currentStreak?: number; longestStreak?: number; streakGraceDayUsed?: boolean } };
	const streak = engagement.streak;

	if (!streak) return;

	// Already active today
	if (streak.lastActiveDate === today) return;

	const yesterday = formatDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
	const isConsecutive = streak.lastActiveDate === yesterday;
	const currentStreak = streak.currentStreak ?? 0;
	const longestStreak = streak.longestStreak ?? 0;

	let newStreak: number;
	if (isConsecutive) {
		newStreak = currentStreak + 1;
	} else if (streak.streakGraceDayUsed) {
		// Grace day was used, continue streak
		newStreak = currentStreak + 1;
	} else {
		// Streak broken (streak calculator may have already reset)
		newStreak = currentStreak === 0 ? 1 : currentStreak + 1;
	}

	await ref.update({
		'streak.lastActiveDate': today,
		'streak.currentStreak': newStreak,
		'streak.longestStreak': Math.max(newStreak, longestStreak),
		'streak.streakGraceDayUsed': false,
		lastUpdate: Date.now(),
	});
}

function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');

	return `${year}-${month}-${day}`;
}

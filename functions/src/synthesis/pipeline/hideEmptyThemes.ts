import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement } from '@freedi/shared-types';
import { logError } from '../../utils/errorHandling';

/**
 * Hide pipeline themes that have no members left.
 *
 * Every path that empties a theme itself (split, consolidate, merge, rebuild
 * apply) hides it in the same write. Themes emptied by older runs were never
 * cleaned: the Re-theme collector ignores them by design (`isTopicCluster`
 * needs members) and filing only adds members, so they stayed visible as
 * empty headings and were exported. This pass flags them as leftovers.
 *
 * A manual board cluster (`titleLockedByCreator`) is allowed to be empty: the
 * admin made it on purpose and may fill it later, so it is never touched.
 */

/** Why the statement was hidden; stored in `hiddenReason`. */
export const EMPTY_THEME_HIDDEN_REASON = 'empty-theme';

/**
 * True for a pipeline theme with no members that no person locked, hidden or
 * not. Exports use this one: an empty theme is a leftover whether or not it
 * has been flagged yet, so it is never exported.
 */
export function isMemberlessTheme(statement: Statement): boolean {
	return (
		statement.isCluster === true &&
		statement.derivedByPipeline === 'topic-cluster' &&
		(statement.integratedOptions ?? []).length === 0 &&
		statement.titleLockedByCreator !== true
	);
}

/** True for a VISIBLE memberless theme: the ones still to be hidden. */
export function isEmptyTheme(statement: Statement): boolean {
	return isMemberlessTheme(statement) && statement.hide !== true;
}

/** The leftover empty themes among `statements`. Pure. */
export function selectEmptyThemes(statements: Statement[]): Statement[] {
	return statements.filter(isEmptyTheme);
}

/** The fields written on every hidden empty theme. */
export function emptyThemeHideUpdate(now: number): Partial<Statement> {
	return {
		hide: true,
		hiddenReason: EMPTY_THEME_HIDDEN_REASON,
		lastUpdate: now,
	};
}

/**
 * Hide one theme if it is STILL empty. A visible empty theme is a filing
 * target, so a member may land between the selection read and this write;
 * the transaction re-reads it and skips it then. `integratedOptions` is never
 * written, so a concurrent filing can never be wiped. `fileUnthemed` files in
 * a transaction that refuses a hidden theme, so the two serialise cleanly.
 */
async function hideIfStillEmpty(db: Firestore, themeId: string): Promise<boolean> {
	const ref = db.collection(Collections.statements).doc(themeId);

	return db.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		if (!snap.exists || !isEmptyTheme(snap.data() as Statement)) return false;
		tx.update(ref, emptyThemeHideUpdate(Date.now()));

		return true;
	});
}

/**
 * Load the question's children, hide its empty themes, and return how many
 * were hidden. Throws when the children cannot be read; a theme whose hide
 * fails is logged and skipped so the others still go through.
 */
export async function hideEmptyThemes(db: Firestore, parentId: string): Promise<number> {
	const snap = await db.collection(Collections.statements).where('parentId', '==', parentId).get();
	const candidates = selectEmptyThemes(snap.docs.map((doc) => doc.data() as Statement));
	if (candidates.length === 0) return 0;

	const hiddenIds: string[] = [];
	const skippedIds: string[] = [];
	for (const theme of candidates) {
		try {
			if (await hideIfStillEmpty(db, theme.statementId)) hiddenIds.push(theme.statementId);
			else skippedIds.push(theme.statementId);
		} catch (error) {
			logError(error, {
				operation: 'synthesis.hideEmptyThemes.hideOne',
				statementId: theme.statementId,
				metadata: { parentId },
			});
		}
	}

	logger.info('synthesis.hideEmptyThemes', {
		parentId,
		hidden: hiddenIds.length,
		themeIds: hiddenIds,
		skippedNoLongerEmpty: skippedIds,
	});

	return hiddenIds.length;
}

/**
 * `hideEmptyThemes` for callers whose main job must not fail with it: an error
 * is logged with context and reported as zero hidden.
 */
export async function hideEmptyThemesSafely(
	db: Firestore,
	parentId: string,
	operation: string,
): Promise<number> {
	try {
		return await hideEmptyThemes(db, parentId);
	} catch (error) {
		logError(error, { operation, statementId: parentId, metadata: { step: 'hideEmptyThemes' } });

		return 0;
	}
}

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

/** Firestore's hard limit of writes per batch. */
const FIRESTORE_BATCH_LIMIT = 500;

/** True for a visible pipeline theme with no members that no person locked. */
export function isEmptyTheme(statement: Statement): boolean {
	return (
		statement.isCluster === true &&
		statement.derivedByPipeline === 'topic-cluster' &&
		(statement.integratedOptions ?? []).length === 0 &&
		statement.hide !== true &&
		statement.titleLockedByCreator !== true
	);
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
		integratedOptions: [],
		lastUpdate: now,
	};
}

/**
 * Load the question's children, hide its empty themes, and return how many
 * were hidden. Throws on a read or write failure; callers decide whether that
 * is fatal.
 */
export async function hideEmptyThemes(db: Firestore, parentId: string): Promise<number> {
	const statements = db.collection(Collections.statements);
	const snap = await statements.where('parentId', '==', parentId).get();
	const empty = selectEmptyThemes(snap.docs.map((doc) => doc.data() as Statement));
	if (empty.length === 0) return 0;

	const update = emptyThemeHideUpdate(Date.now());
	for (let i = 0; i < empty.length; i += FIRESTORE_BATCH_LIMIT) {
		const batch = db.batch();
		for (const theme of empty.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
			batch.update(statements.doc(theme.statementId), update);
		}
		await batch.commit();
	}

	logger.info('synthesis.hideEmptyThemes', {
		parentId,
		hidden: empty.length,
		themeIds: empty.map((t) => t.statementId),
	});

	return empty.length;
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

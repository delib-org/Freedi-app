import type { Firestore } from 'firebase-admin/firestore';
import {
	Collections,
	OPEN_ACCESS_SCOPE,
	QUARANTINED_ACCESS_SCOPE,
	type Statement,
	type StatementDeletion,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { resolveStatementScope, type ScopeSubject } from './accessScopeLevels';

/** Enough of what is still filed under a deleted id to tell where it was. */
const ORPHAN_SAMPLE = 20;

/**
 * The private scope an id was deleted from, or null when it was open. A tombstone
 * written before scopes were recorded says nothing, so what is still filed under
 * the id tells instead: children stamped with a private scope.
 */
async function privateScopeDeletedFrom(
	firestore: Firestore,
	statementId: string,
	tombstone: Partial<StatementDeletion>,
): Promise<string | null> {
	if (tombstone.accessScope) {
		return tombstone.accessScope === OPEN_ACCESS_SCOPE ? null : tombstone.accessScope;
	}
	const orphans = await firestore
		.collection(Collections.statements)
		.where('parentId', '==', statementId)
		.limit(ORPHAN_SAMPLE)
		.get();
	const scope = orphans.docs
		.map((doc) => (doc.data() as Partial<Statement>).accessScope)
		.find(
			(value) =>
				Boolean(value) && value !== OPEN_ACCESS_SCOPE && value !== QUARANTINED_ACCESS_SCOPE,
		);

	return scope ?? null;
}

/**
 * The scope a statement must carry when its id was used before, or undefined
 * when the id has no tombstone. A statement deleted from a private level and
 * made again anywhere else would open what is still filed under it (the
 * children keep their parentId and their private stamp, and a list by parent
 * is judged by the parent), so it is quarantined. Made again in the same scope,
 * it is stamped as usual.
 */
export async function scopeOfReusedId(
	firestore: Firestore,
	statement: ScopeSubject & Pick<Statement, 'accessScope' | 'creatorId'>,
): Promise<string | undefined> {
	const tombstone = await firestore
		.collection(Collections.statementDeletions)
		.doc(statement.statementId)
		.get();
	if (!tombstone.exists) return undefined;

	const deletedFrom = await privateScopeDeletedFrom(
		firestore,
		statement.statementId,
		(tombstone.data() ?? {}) as Partial<StatementDeletion>,
	);
	const scope = await resolveStatementScope(firestore, statement);
	if (deletedFrom === null || deletedFrom === scope) return scope;

	// Logged as an error so a person sees it: the id came back somewhere else.
	logError(new Error('A statement deleted from a private level was made again elsewhere'), {
		operation: 'accessScope.scopeOfReusedId',
		statementId: statement.statementId,
		userId: statement.creatorId,
		metadata: { deletedFrom, scope },
	});

	return QUARANTINED_ACCESS_SCOPE;
}

/**
 * Run after a tombstone is written: an id made again before the tombstone landed
 * slipped past the create trigger's check, so it is judged now.
 */
export async function restampIfReused(firestore: Firestore, statementId: string): Promise<void> {
	const ref = firestore.collection(Collections.statements).doc(statementId);
	const snap = await ref.get();
	if (!snap.exists) return;

	const statement = { ...(snap.data() as Statement), statementId };
	const scope = await scopeOfReusedId(firestore, statement);
	if (scope !== undefined && scope !== statement.accessScope) {
		await ref.update({ accessScope: scope });
	}
}

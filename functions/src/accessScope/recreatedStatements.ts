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
/** Firestore's batch limit is 500; leave room. */
const BATCH_SIZE = 400;
/** Far more than one statement ever has under it; a guard against a runaway walk. */
const MAX_QUARANTINED = 5000;

const isPrivateStamp = (value: string | undefined): value is string =>
	Boolean(value) && value !== OPEN_ACCESS_SCOPE;

/**
 * The private scope an id was deleted from, or null when it was open. A tombstone
 * written before scopes were recorded says nothing, so the place it was in tells
 * instead: the scope of the parent it was deleted from, or what is still filed
 * under it. The parent comes first, since a re-stamp may already have loosened
 * the children through the new statement.
 */
async function privateScopeDeletedFrom(
	firestore: Firestore,
	statementId: string,
	tombstone: Partial<StatementDeletion>,
): Promise<string | null> {
	if (tombstone.accessScope) {
		return tombstone.accessScope === OPEN_ACCESS_SCOPE ? null : tombstone.accessScope;
	}
	if (tombstone.parentId && tombstone.parentId !== 'top') {
		const parent = await firestore.collection(Collections.statements).doc(tombstone.parentId).get();
		const parentScope = (parent.data() as Partial<Statement> | undefined)?.accessScope;
		if (isPrivateStamp(parentScope)) return parentScope;
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
 * Quarantines a statement and everything filed under it. What a re-made id's
 * old children carry may already have been loosened through the new statement,
 * and nothing would re-stamp them otherwise: their tree (the old top) is not the
 * new statement's. Walks parentId, one level at a time.
 */
export async function quarantineWithChildren(
	firestore: Firestore,
	statementId: string,
): Promise<number> {
	const statements = firestore.collection(Collections.statements);
	let level = [statementId];
	const done = new Set<string>();
	while (level.length > 0 && done.size < MAX_QUARANTINED) {
		const next: string[] = [];
		const refs = [];
		for (const id of level) {
			if (done.has(id)) continue;
			done.add(id);
			refs.push(statements.doc(id));
			const children = await statements.where('parentId', '==', id).get();
			children.docs.forEach((doc) => next.push(doc.id));
		}
		for (let start = 0; start < refs.length; start += BATCH_SIZE) {
			const batch = firestore.batch();
			refs
				.slice(start, start + BATCH_SIZE)
				.forEach((ref) => batch.update(ref, { accessScope: QUARANTINED_ACCESS_SCOPE }));
			await batch.commit();
		}
		level = next;
	}

	return done.size;
}

/**
 * Stamps a statement whose id may have been used before. Returns false when the
 * id has no tombstone, so the caller can stamp it the usual way.
 */
export async function stampReusedId(
	firestore: Firestore,
	statement: ScopeSubject & Pick<Statement, 'accessScope' | 'creatorId'>,
): Promise<boolean> {
	const scope = await scopeOfReusedId(firestore, statement);
	if (scope === undefined) return false;
	if (scope === QUARANTINED_ACCESS_SCOPE) {
		await quarantineWithChildren(firestore, statement.statementId);
	} else if (scope !== statement.accessScope) {
		await firestore
			.collection(Collections.statements)
			.doc(statement.statementId)
			.update({ accessScope: scope });
	}

	return true;
}

/**
 * Run after a tombstone is written: an id made again before the tombstone landed
 * slipped past the create trigger's check, so it is judged now.
 */
export async function restampIfReused(firestore: Firestore, statementId: string): Promise<void> {
	const snap = await firestore.collection(Collections.statements).doc(statementId).get();
	if (!snap.exists) return;

	await stampReusedId(firestore, { ...(snap.data() as Statement), statementId });
}

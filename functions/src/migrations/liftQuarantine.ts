import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
	Collections,
	OPEN_ACCESS_SCOPE,
	isQuarantinedScope,
	type Statement,
} from '@freedi/shared-types';
import { AccessScopeLevels } from '../accessScope/accessScopeLevels';
import { walkSubtree } from '../accessScope/subtree';

/** Firestore's batch limit is 500; leave room. */
const BATCH_SIZE = 400;
/** A person lifts one subtree at a time; anything bigger is a different job. */
const DEFAULT_MAX_STATEMENTS = 5000;

/** Why a quarantined statement stays quarantined. */
export type KeptReason = 'loop' | 'under-quarantine' | 'parent-deleted';

export interface LiftChange {
	statementId: string;
	to: string;
}

export interface LiftResult {
	rootId: string;
	execute: boolean;
	visited: number;
	truncated: boolean;
	lifted: LiftChange[];
	kept: Array<{ statementId: string; reason: KeptReason }>;
	/** The root's id was deleted from a private level before: look before lifting. */
	rootReusesPrivateId: boolean;
}

export interface LiftOptions {
	execute: boolean;
	maxStatements?: number;
	/**
	 * The root's id was deleted from a private level and made again: lifting it
	 * may open what its old children hold. Writing then needs this, said out loud.
	 */
	allowReusedId?: boolean;
}

/**
 * The scope a quarantined statement would have, judged afresh, or why it must
 * stay. Its own stamp is set aside; its ancestors' are not, so a statement under
 * a quarantine that is not being lifted stays. A chain broken by a deleted
 * ancestor would come out open by what is left of it, so it stays too.
 */
function judge(levels: AccessScopeLevels, statement: Statement): LiftChange | KeptReason {
	const subject = { ...statement, accessScope: undefined };
	if (levels.isLoop(subject)) return 'loop';
	if (levels.isBroken(subject)) return 'parent-deleted';
	const scope = levels.scopeOf(subject);
	if (isQuarantinedScope(scope)) return 'under-quarantine';

	return { statementId: statement.statementId, to: scope };
}

async function rootReusesPrivateId(firestore: Firestore, rootId: string): Promise<boolean> {
	const tombstone = await firestore.collection(Collections.statementDeletions).doc(rootId).get();
	const scope = (tombstone.data() as { accessScope?: string } | undefined)?.accessScope;

	return tombstone.exists && scope !== OPEN_ACCESS_SCOPE;
}

/**
 * Lifts the quarantine of `rootId` and of what is filed under it, re-judging
 * each statement's scope from its tree; never a blanket 'open'. Statements that
 * are not quarantined are left alone. Dry run unless `execute`.
 *
 * Top-down: a statement lifted counts as lifted for its children, so a lifted
 * private level governs them again.
 */
export async function runLiftQuarantine(
	firestore: Firestore,
	rootId: string,
	options: LiftOptions,
): Promise<LiftResult> {
	const reusesPrivateId = await rootReusesPrivateId(firestore, rootId);
	if (options.execute && reusesPrivateId && !options.allowReusedId) {
		throw new Error(
			`${rootId} was deleted from a private level and made again; lifting may open its old children. ` +
				'Check them, then rerun with --allow-reused-id.',
		);
	}
	const levels = new AccessScopeLevels(firestore);
	const lifted: LiftChange[] = [];
	const kept: LiftResult['kept'] = [];

	const visit = async (level: QueryDocumentSnapshot[]): Promise<void> => {
		const statements = level.map((doc) => ({ ...(doc.data() as Statement), statementId: doc.id }));
		await levels.load(statements);
		const changes: Array<{ doc: QueryDocumentSnapshot; to: string }> = [];
		statements.forEach((statement, index) => {
			if (!isQuarantinedScope(statement.accessScope)) {
				levels.remember(statement);

				return;
			}
			const verdict = judge(levels, statement);
			if (typeof verdict === 'string') {
				kept.push({ statementId: statement.statementId, reason: verdict });
				levels.remember(statement);

				return;
			}
			lifted.push(verdict);
			changes.push({ doc: level[index], to: verdict.to });
			levels.remember({ ...statement, accessScope: verdict.to });
		});
		if (!options.execute) return;
		for (let start = 0; start < changes.length; start += BATCH_SIZE) {
			const batch = firestore.batch();
			changes
				.slice(start, start + BATCH_SIZE)
				.forEach(({ doc, to }) => batch.update(doc.ref, { accessScope: to }));
			await batch.commit();
		}
	};

	const walk = await walkSubtree(
		firestore,
		rootId,
		visit,
		options.maxStatements ?? DEFAULT_MAX_STATEMENTS,
	);

	return {
		rootId,
		execute: options.execute,
		visited: walk.visited,
		truncated: walk.truncated,
		lifted,
		kept,
		rootReusesPrivateId: reusesPrivateId,
	};
}

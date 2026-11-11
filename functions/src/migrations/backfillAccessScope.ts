import type { Firestore } from 'firebase-admin/firestore';
import { Collections, OPEN_ACCESS_SCOPE, Role, type Statement } from '@freedi/shared-types';
import { AccessScopeLevels } from '../accessScope/accessScopeLevels';

/**
 * Stamps `accessScope` on every existing statement. Writes that one field and
 * nothing else, so the statement triggers treat each write as a no-op
 * (isAccessScopeOnlyWrite), and `lastUpdate` does not move, so no client sees a
 * change it must react to.
 *
 * An existing `membership.access` is taken as it is. In particular `openToAll`,
 * which the main app used to write on every child by default, counts as that
 * statement's own open setting: this is Tal's decision, and it means old
 * children of a private group stay open. `ownOpenUnderRestricted` counts them.
 */

/** A batch holds 500 writes; each page is one batch. */
export const BACKFILL_PAGE_SIZE = 400;

/**
 * Deployed triggers that fire on an update to a statement and must each start
 * to find out it has nothing to do. Firestore cannot be told not to fire them.
 * updateParentOnChildUpdate, onEvidencePostUpdate, onAgoraProposalWritten,
 * liveSynthOnOptionUpdate, liveSynthOnOptionEvaluationChange,
 * updateOptionInMassConsensus, onStatementWriteDispatch, and the twelve
 * legacyStatementTriggers.
 */
export const TRIGGERS_PER_STATEMENT_WRITE = 19;

export interface BackfillAccessScopeResult {
	scanned: number;
	alreadyCorrect: number;
	toWrite: number;
	written: number;
	open: number;
	restricted: number;
	/** Open only because of their own setting, under a restricted level. */
	ownOpenUnderRestricted: number;
	/**
	 * Levels with their own setting, open or private, inside a private level,
	 * whose creator holds no role there: a pocket someone outside may have made
	 * before the rules checked who changes access. For a person to review; the
	 * backfill changes nothing about them.
	 */
	pocketsToReview: string[];
	ancestorReads: number;
	cursor: string | null;
	finished: boolean;
}

export interface BackfillAccessScopeOptions {
	execute: boolean;
	cursor?: string | null;
	limit?: number;
	/** Most statements written per second, to keep the trigger fan-out bearable. */
	writesPerSecond?: number;
	onPage?: (progress: BackfillAccessScopeResult) => void;
	sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Same subject, with its own setting removed: what it would inherit. */
function withoutOwnSetting(subject: Statement): Statement {
	const copy = { ...subject };
	delete copy.membership;

	return copy;
}

const MEMBER_ROLES: readonly string[] = [Role.member, Role.admin, Role.creator];

/** The pockets whose creator holds no role at the private level they sit in. */
async function pocketsMadeByOutsiders(
	firestore: Firestore,
	pockets: Array<{ statementId: string; creatorId: string; scope: string }>,
): Promise<string[]> {
	if (pockets.length === 0) return [];
	const subscriptions = firestore.collection(Collections.statementsSubscribe);
	const snaps = await firestore.getAll(
		...pockets.map(({ creatorId, scope }) => subscriptions.doc(`${creatorId}--${scope}`)),
	);

	return pockets
		.filter((_, index) => {
			const role = (snaps[index].data() as { role?: string } | undefined)?.role;

			return !role || !MEMBER_ROLES.includes(role);
		})
		.map(({ statementId }) => statementId);
}

export async function runAccessScopeBackfill(
	firestore: Firestore,
	options: BackfillAccessScopeOptions,
): Promise<BackfillAccessScopeResult> {
	const sleep = options.sleep ?? defaultSleep;
	const levels = new AccessScopeLevels(firestore);
	const result: BackfillAccessScopeResult = {
		scanned: 0,
		alreadyCorrect: 0,
		toWrite: 0,
		written: 0,
		open: 0,
		restricted: 0,
		ownOpenUnderRestricted: 0,
		pocketsToReview: [],
		ancestorReads: 0,
		cursor: options.cursor ?? null,
		finished: false,
	};
	const collection = firestore.collection(Collections.statements);

	for (;;) {
		let query = collection.orderBy('__name__').limit(BACKFILL_PAGE_SIZE);
		if (result.cursor) query = query.startAfter(result.cursor);
		const snapshot = await query.get();
		if (snapshot.empty) {
			result.finished = true;
			break;
		}

		const subjects = snapshot.docs.map((doc) => ({
			...(doc.data() as Statement),
			statementId: doc.id,
		}));
		await levels.load(subjects);

		const batch = firestore.batch();
		let pageWrites = 0;
		const pockets: Array<{ statementId: string; creatorId: string; scope: string }> = [];
		subjects.forEach((subject, index) => {
			result.scanned += 1;
			const accessScope = levels.scopeOf(subject);
			// A level with its own setting inside a private level: a pocket, open or
			// private, that someone outside may have set before the rules checked who
			// changes access there. Its creator is checked below.
			const inherited = subject.membership?.access
				? levels.scopeOf(withoutOwnSetting(subject))
				: accessScope;
			if (subject.creatorId && inherited !== OPEN_ACCESS_SCOPE && inherited !== accessScope) {
				pockets.push({
					statementId: subject.statementId,
					creatorId: subject.creatorId,
					scope: inherited,
				});
			}
			if (accessScope === OPEN_ACCESS_SCOPE) {
				result.open += 1;
				if (subject.membership?.access && inherited !== accessScope) {
					result.ownOpenUnderRestricted += 1;
				}
			} else {
				result.restricted += 1;
			}
			if (subject.accessScope === accessScope) {
				result.alreadyCorrect += 1;

				return;
			}
			result.toWrite += 1;
			if (options.execute) {
				batch.update(snapshot.docs[index].ref, { accessScope });
				pageWrites += 1;
			}
		});

		result.pocketsToReview.push(...(await pocketsMadeByOutsiders(firestore, pockets)));

		if (pageWrites > 0) {
			await batch.commit();
			result.written += pageWrites;
			if (options.writesPerSecond) await sleep((pageWrites / options.writesPerSecond) * 1000);
		}

		result.cursor = snapshot.docs[snapshot.docs.length - 1].id;
		result.ancestorReads = levels.readCount;
		options.onPage?.(result);

		if (options.limit && result.scanned >= options.limit) break;
		if (snapshot.size < BACKFILL_PAGE_SIZE) {
			result.finished = true;
			break;
		}
	}

	return result;
}

export interface BackfillCost {
	documents: number;
	reads: number;
	writes: number;
	triggerInvocations: number;
}

/** What a full run costs for a given statement count. Ancestors are read once each. */
export function estimateBackfillCost(documents: number, ancestorReads = 0): BackfillCost {
	return {
		documents,
		reads: documents + ancestorReads,
		writes: documents,
		triggerInvocations: documents * TRIGGERS_PER_STATEMENT_WRITE,
	};
}

export function backfillStateFileName(project: string, usesEmulator: boolean): string {
	return `backfillAccessScope${usesEmulator ? '.emulator' : ''}.${project}.json`;
}

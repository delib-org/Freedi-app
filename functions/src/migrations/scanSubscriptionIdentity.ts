import { FieldPath } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { ELEVATED_ROLES, identityProblems } from '../utils/subscriptionIdentity';
import type { IdentityProblem, SubscriptionFields } from '../utils/subscriptionIdentity';

/**
 * READ-ONLY scan of `statementsSubscribe`, to run on production AFTER the
 * rules that tie a subscription's doc id to its contents are deployed (deploying
 * the rules first closes the hole; the scan then finds what was forged before).
 *
 * Every admin check finds a subscription by its DOC ID `{uid}--{statementId}`;
 * the access checks read its FIELDS. A doc whose id disagrees with its fields
 * (way A: forged id, way B: moved statementId) can make its owner admin of the
 * statement its id names, and (way C) a member doc with a mismatched id can be
 * promoted later. So:
 *   - `id-mismatch` is a HIT for EVERY role (a member doc today is an admin doc
 *     tomorrow);
 *   - `user-mismatch` (user.uid != userId) is reported only for elevated roles.
 *     The server's own shape is harmless and only COUNTED: functions'
 *     createSubscription stores the STATEMENT's creator as `user` on the admin
 *     copies setupAdminsForStatement writes (there may be very many).
 *
 * Pages the whole collection by doc id; `limit` / `startAfter` let it run in
 * chunks. Writes nothing.
 */

export const DEFAULT_SCAN_PAGE_SIZE = 500;

export type IdentityVerdict = 'hit' | 'server-shape';

export interface IdentityFinding {
	subscriptionId: string;
	userId: string;
	statementId: string;
	role: string;
	userUid: string;
	problems: IdentityProblem[];
	verdict: IdentityVerdict;
}

export interface IdentityScanResult {
	scanned: number;
	/** Last doc id read; pass as `startAfter` to continue. Empty when nothing was read. */
	lastDocId: string;
	/** True when the collection was read to its end (no further chunk needed). */
	complete: boolean;
	hits: IdentityFinding[];
	serverShapeByRole: Record<string, number>;
}

export interface IdentityScanOptions {
	pageSize?: number;
	/** Max docs to read in this run; undefined reads to the end. */
	limit?: number;
	/** Doc id to start after (exclusive), from a previous run's `lastDocId`. */
	startAfter?: string;
}

type ScannedSubscription = SubscriptionFields & {
	statement?: { creatorId?: string; creator?: { uid?: string } } | null;
};

/** Only these fields are read: keeps a full-collection scan light. */
const SCANNED_FIELDS = [
	'userId',
	'statementId',
	'role',
	'user.uid',
	'statement.creatorId',
	'statement.creator.uid',
] as const;

/** Judges one subscription; undefined when there is nothing to report. */
export function classifySubscription(
	docId: string,
	data: ScannedSubscription,
): IdentityFinding | undefined {
	const role = String(data.role ?? '');
	const elevated = ELEVATED_ROLES.has(role);
	const problems = identityProblems(docId, data).filter(
		(problem) => elevated || problem === 'id-mismatch',
	);
	if (problems.length === 0) return undefined;
	const userUid = data.user?.uid ?? '';
	const statementCreator = data.statement?.creatorId || data.statement?.creator?.uid || '';
	const serverShape =
		problems.length === 1 &&
		problems[0] === 'user-mismatch' &&
		!!userUid &&
		userUid === statementCreator;

	return {
		subscriptionId: docId,
		userId: typeof data.userId === 'string' ? data.userId : '',
		statementId: typeof data.statementId === 'string' ? data.statementId : '',
		role,
		userUid,
		problems,
		verdict: serverShape ? 'server-shape' : 'hit',
	};
}

/** Pages through `statementsSubscribe` by doc id, from `startAfter`, up to `limit` docs. */
export async function scanSubscriptionIdentity(
	firestore: Firestore,
	options: IdentityScanOptions = {},
): Promise<IdentityScanResult> {
	const pageSize = options.pageSize ?? DEFAULT_SCAN_PAGE_SIZE;
	const result: IdentityScanResult = {
		scanned: 0,
		lastDocId: options.startAfter ?? '',
		complete: false,
		hits: [],
		serverShapeByRole: {},
	};

	while (options.limit === undefined || result.scanned < options.limit) {
		const remaining =
			options.limit === undefined ? pageSize : Math.min(pageSize, options.limit - result.scanned);
		let query = firestore
			.collection(Collections.statementsSubscribe)
			.select(...SCANNED_FIELDS)
			.orderBy(FieldPath.documentId())
			.limit(remaining);
		if (result.lastDocId) query = query.startAfter(result.lastDocId);
		const page = await query.get();
		for (const doc of page.docs) {
			const finding = classifySubscription(doc.id, doc.data() as ScannedSubscription);
			if (finding?.verdict === 'hit') result.hits.push(finding);
			else if (finding) {
				result.serverShapeByRole[finding.role] = (result.serverShapeByRole[finding.role] ?? 0) + 1;
			}
		}
		result.scanned += page.size;
		if (page.size > 0) result.lastDocId = page.docs[page.size - 1].id;
		if (page.size < remaining) {
			result.complete = true;
			break;
		}
	}

	return result;
}

/** Exit code 2 on any hit: any id-mismatch, or an elevated user-mismatch that is not server-shape. */
export function identityScanExitCode(result: Pick<IdentityScanResult, 'hits'>): number {
	return result.hits.length > 0 ? 2 : 0;
}

export function formatIdentityScan(result: IdentityScanResult): string {
	const lines = result.hits.map(
		(f) =>
			`- HIT ${f.subscriptionId} role=${f.role || '?'} userId=${f.userId || '?'}` +
			` statementId=${f.statementId || '?'} user.uid=${f.userUid || '?'} (${f.problems.join(', ')})`,
	);
	const serverShapeTotal = Object.values(result.serverShapeByRole).reduce((a, b) => a + b, 0);
	const byRole = Object.entries(result.serverShapeByRole)
		.map(([role, count]) => `${role}=${count}`)
		.join(', ');
	const idMismatch = result.hits.filter((f) => f.problems.includes('id-mismatch')).length;
	const next = result.complete
		? 'Reached the end of the collection.'
		: `Not done: continue with --startAfter=${result.lastDocId}`;

	return [
		'',
		...lines,
		'',
		`Scanned ${result.scanned} subscription(s), last doc id: ${result.lastDocId || '(none)'}.`,
		`Hits: ${result.hits.length} (id-mismatch: ${idMismatch}, ` +
			`elevated user-mismatch: ${result.hits.length - idMismatch}).`,
		`Server-shape (counted, harmless): ${serverShapeTotal}${byRole ? ` (${byRole})` : ''}.`,
		next,
	].join('\n');
}

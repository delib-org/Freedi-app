import { FieldPath } from 'firebase-admin/firestore';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { identityProblems } from '../utils/subscriptionIdentity';
import type { IdentityProblem, SubscriptionFields } from '../utils/subscriptionIdentity';

/**
 * READ-ONLY scan, to run on production BEFORE the rules that tie a subscription's
 * doc id to its contents ship. Lists every `statementsSubscribe` doc with an
 * elevated role (admin, statement-creator, creator) whose id is not
 * `${userId}--${statementId}`, or whose `user.uid` differs from `userId`.
 *
 * Until those rules ship, a client can create `{uid}--{X}` holding the fields of
 * another statement (the rules judged the fields, every admin check reads the
 * id), or move a doc's statementId, and so make itself admin of X. Such docs
 * must be inspected and deleted by hand. Writes nothing.
 *
 * One `user-mismatch` shape is the server's own and harmless: functions'
 * createSubscription stores the STATEMENT's creator as `user` (setupAdminsForStatement's
 * inherited admins). It is reported as `server-shape`, not as a hit.
 */

export const IDENTITY_SCAN_ROLES = ['admin', 'statement-creator', 'creator'] as const;
const PAGE_SIZE = 500;

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

type ScannedSubscription = SubscriptionFields & {
	statement?: { creatorId?: string; creator?: { uid?: string } } | null;
};

/** Judges one subscription; undefined when its identity is sound. */
export function classifySubscription(
	docId: string,
	data: ScannedSubscription,
): IdentityFinding | undefined {
	const problems = identityProblems(docId, data);
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
		role: String(data.role ?? ''),
		userUid,
		problems,
		verdict: serverShape ? 'server-shape' : 'hit',
	};
}

/** Pages through every elevated subscription (one query per role, by doc id). */
export async function scanSubscriptionIdentity(
	firestore: Firestore,
	pageSize: number = PAGE_SIZE,
): Promise<IdentityFinding[]> {
	const findings: IdentityFinding[] = [];
	for (const role of IDENTITY_SCAN_ROLES) {
		let after: DocumentSnapshot | undefined;
		for (let done = false; !done; ) {
			let query = firestore
				.collection(Collections.statementsSubscribe)
				.where('role', '==', role)
				.orderBy(FieldPath.documentId())
				.limit(pageSize);
			if (after) query = query.startAfter(after);
			const page = await query.get();
			for (const doc of page.docs) {
				const finding = classifySubscription(doc.id, doc.data() as ScannedSubscription);
				if (finding) findings.push(finding);
			}
			after = page.docs[page.docs.length - 1];
			done = page.size < pageSize || !after;
		}
	}

	return findings;
}

export function formatIdentityScan(findings: readonly IdentityFinding[]): string {
	const hits = findings.filter((f) => f.verdict === 'hit');
	const lines = findings.map(
		(f) =>
			`- ${f.verdict.toUpperCase()} ${f.subscriptionId} role=${f.role} userId=${f.userId || '?'}` +
			` statementId=${f.statementId || '?'} user.uid=${f.userUid || '?'} (${f.problems.join(', ')})`,
	);

	return [
		'',
		...lines,
		'',
		`Elevated subscriptions with a bad identity: ${hits.length} hit(s), ` +
			`${findings.length - hits.length} server-shape.`,
	].join('\n');
}

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
	Collections,
	NotificationType,
	Statement,
	StatementType,
} from '@freedi/shared-types';

const db = getFirestore();

interface AuthorNotice {
	originalId: string;
	clusterId: string;
	authorId: string;
}

/**
 * Notify each original's author that their suggestion was grouped into a new
 * condensed suggestion — while emphasizing that the original remains live.
 *
 * One notification per (author, cluster) pair even if the author had multiple
 * originals in the same group. Deduplicated within a run.
 */
export async function notifyAuthorsOfGrouping(
	parentStatement: Statement,
	notices: AuthorNotice[],
): Promise<void> {
	if (notices.length === 0) return;

	// Dedupe per (author, cluster) — ignore authorless rows.
	const seen = new Set<string>();
	const unique: AuthorNotice[] = [];
	for (const n of notices) {
		if (!n.authorId) continue;
		const key = `${n.authorId}|${n.clusterId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(n);
	}

	// Fetch cluster statements (for title/text in the notification body).
	const clusterIds = Array.from(new Set(unique.map((n) => n.clusterId)));
	const clusterMap = new Map<string, Statement>();
	const BATCH = 30;
	for (let i = 0; i < clusterIds.length; i += BATCH) {
		const batch = clusterIds.slice(i, i + BATCH);
		const snap = await db
			.collection(Collections.statements)
			.where('__name__', 'in', batch.map((id) => db.collection(Collections.statements).doc(id)))
			.get()
			.catch(() => null);
		// Fallback to per-doc fetch if the above query rejects.
		if (snap) {
			snap.docs.forEach((doc) => clusterMap.set(doc.id, doc.data() as Statement));
		} else {
			for (const id of batch) {
				const doc = await db.collection(Collections.statements).doc(id).get();
				if (doc.exists) clusterMap.set(id, doc.data() as Statement);
			}
		}
	}

	const now = Date.now();
	let written = 0;
	const batchWrite = db.batch();

	for (const notice of unique) {
		const cluster = clusterMap.get(notice.clusterId);
		if (!cluster) continue;

		const notificationId = `${notice.authorId}--${notice.clusterId}--${notice.originalId}`;

		const notification: NotificationType = {
			userId: notice.authorId,
			parentId: parentStatement.statementId,
			statementId: notice.clusterId,
			statementType: cluster.statementType ?? StatementType.option,
			parentStatement: parentStatement.statement,
			text: `Your suggestion was grouped under "${cluster.statement}". Your original is still live.`,
			creatorId: 'system:condensation',
			creatorName: 'Grouping',
			createdAt: now,
			read: false,
			notificationId,
		};

		const ref = db.collection(Collections.inAppNotifications).doc(notificationId);
		batchWrite.set(ref, notification, { merge: true });
		written++;
	}

	if (written > 0) {
		await batchWrite.commit();
		logger.info('condensation.authorNotifications', {
			parentId: parentStatement.statementId,
			written,
		});
	}
}

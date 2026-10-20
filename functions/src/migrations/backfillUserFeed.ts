import type { DocumentReference, Firestore, WriteBatch } from 'firebase-admin/firestore';
import { Collections, Role, UserFeedItem, getUserFeedId } from '@freedi/shared-types';
import { shouldHaveFeedEntry } from '../userFeed/userFeedMembership';

/**
 * Backfill: one `userFeed` entry per existing top-level membership.
 *
 * - Bounded: processes at most `maxPages` pages of `pageSize` subscriptions per run.
 * - Resumable: progress (pass + last doc id) is saved after every page in
 *   `_migrations/backfillUserFeed`; the next run continues from there.
 * - Idempotent: creates missing entries and only ever RAISES an existing
 *   entry's lastActivity (max), so re-running, or running while the new
 *   triggers already maintain the feed, cannot move a discussion backwards.
 *
 * lastActivity = the subscription's lastUpdate (the value the old home query
 * ordered by), falling back to createdAt — so the first feed page matches the
 * old first page exactly.
 */

export const BACKFILL_PROGRESS_COLLECTION = '_migrations';
export const BACKFILL_PROGRESS_DOC_ID = 'backfillUserFeed';
export const BACKFILL_DEFAULT_PAGE_SIZE = 400; // < 500: one batch per page even if every doc writes

/** Top-level subscriptions carry parentId at the top level; legacy ones only inside `statement`. */
const PASSES = ['parentId', 'statement.parentId'] as const;
type PassField = (typeof PASSES)[number];

export interface BackfillProgress {
	passIndex: number;
	cursor: string | null;
	done: boolean;
	scanned: number;
	created: number;
	raised: number;
	updatedAt: number;
}

export interface BackfillOptions {
	pageSize?: number;
	maxPages?: number;
	dryRun?: boolean;
	restart?: boolean;
	now?: number;
}

interface SubscriptionRow {
	id: string;
	userId?: string;
	statementId?: string;
	role?: Role;
	parentId?: string;
	statement?: { parentId?: string };
	lastUpdate?: number;
	createdAt?: number;
}

const EMPTY_PROGRESS: BackfillProgress = {
	passIndex: 0,
	cursor: null,
	done: false,
	scanned: 0,
	created: 0,
	raised: 0,
	updatedAt: 0,
};

function progressRef(db: Firestore): DocumentReference {
	return db.collection(BACKFILL_PROGRESS_COLLECTION).doc(BACKFILL_PROGRESS_DOC_ID);
}

async function loadProgress(db: Firestore, restart: boolean): Promise<BackfillProgress> {
	if (restart) return { ...EMPTY_PROGRESS };
	const snapshot = await progressRef(db).get();

	return snapshot.exists
		? { ...EMPTY_PROGRESS, ...(snapshot.data() as BackfillProgress) }
		: { ...EMPTY_PROGRESS };
}

function deriveLastActivity(row: SubscriptionRow): number {
	if (typeof row.lastUpdate === 'number' && row.lastUpdate > 0) return row.lastUpdate;
	if (typeof row.createdAt === 'number' && row.createdAt > 0) return row.createdAt;

	return 0;
}

async function readPage(
	db: Firestore,
	field: PassField,
	cursor: string | null,
	pageSize: number,
): Promise<SubscriptionRow[]> {
	let page = db
		.collection(Collections.statementsSubscribe)
		.where(field, '==', 'top')
		.orderBy('__name__')
		.limit(pageSize);
	if (cursor) page = page.startAfter(cursor);
	const snapshot = await page.get();

	return snapshot.docs.map((doc) => ({
		id: doc.id,
		...(doc.data() as Omit<SubscriptionRow, 'id'>),
	}));
}

/** Writes the page's missing/stale feed entries. Returns [created, raised]. */
async function writePage(
	db: Firestore,
	rows: SubscriptionRow[],
	dryRun: boolean,
	now: number,
): Promise<[number, number]> {
	const eligible = rows.filter((row) => shouldHaveFeedEntry(row));
	if (eligible.length === 0) return [0, 0];

	const refs = eligible.map((row) =>
		db
			.collection(Collections.userFeed)
			.doc(getUserFeedId(row.userId as string, row.statementId as string)),
	);
	const existing = await db.getAll(...refs);
	const batch: WriteBatch = db.batch();
	let created = 0;
	let raised = 0;

	eligible.forEach((row, index) => {
		const lastActivity = deriveLastActivity(row);
		const current = existing[index];
		if (!current.exists) {
			const entry: UserFeedItem = {
				feedId: refs[index].id,
				userId: row.userId as string,
				statementId: row.statementId as string,
				subscriptionId: row.id,
				lastActivity,
				createdAt: now,
			};
			batch.set(refs[index], entry);
			created++;

			return;
		}
		const currentActivity = (current.data() as UserFeedItem).lastActivity ?? 0;
		if (lastActivity > currentActivity) {
			batch.update(refs[index], { lastActivity });
			raised++;
		}
	});

	if (!dryRun && created + raised > 0) await batch.commit();

	return [created, raised];
}

/** Runs up to `maxPages` pages and returns the saved progress. */
export async function backfillUserFeed(
	db: Firestore,
	options: BackfillOptions = {},
): Promise<BackfillProgress> {
	const pageSize = options.pageSize ?? BACKFILL_DEFAULT_PAGE_SIZE;
	const maxPages = options.maxPages ?? Number.POSITIVE_INFINITY;
	const dryRun = options.dryRun ?? false;
	const now = options.now ?? Date.now();
	const progress = await loadProgress(db, options.restart ?? false);

	let pages = 0;
	while (!progress.done && pages < maxPages) {
		const field = PASSES[progress.passIndex];
		const rows = await readPage(db, field, progress.cursor, pageSize);
		const [created, raised] = await writePage(db, rows, dryRun, now);

		progress.scanned += rows.length;
		progress.created += created;
		progress.raised += raised;
		progress.updatedAt = Date.now();
		if (rows.length < pageSize) {
			progress.passIndex += 1;
			progress.cursor = null;
			progress.done = progress.passIndex >= PASSES.length;
		} else {
			progress.cursor = rows[rows.length - 1].id;
		}
		pages++;
		if (!dryRun) await progressRef(db).set(progress);
	}

	return progress;
}

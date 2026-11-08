/**
 * One-time grandfather backfill for the Agora hard gate (Studio teacher
 * approval, docs/ia/studio-teacher-approval.md; Tal 2026-10-15: a pending
 * teacher gets NOTHING until approved).
 *
 * Writes an explicit approval — `agoraApprovedTeachers/{uid}.grant`
 * `{ source: 'grandfathered' }` — for everyone who already acts as a teacher:
 *   - attached to any school as teacher or regional coordinator (supervisor);
 *   - on any class (its creator, or a teacher on its teacherIds);
 *   - ever ran a lesson (agoraSessions.teacherId);
 *   - ever created a scenario (agoraTopicPackages.creatorId).
 * Skipped: sys-admins (always approved), anonymous or deleted accounts, and
 * anyone who already holds a grant (so re-running is a no-op).
 *
 * RUN THIS BEFORE DEPLOYING THE GATE (agoraCreateSession & co. + the rules),
 * or every grandfathered teacher is locked out until it runs.
 *
 * Dry run by default: prints who would be approved and why. `--apply` writes.
 *
 * USAGE (from functions/):
 *   # emulator (dry run):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8091 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9109 \
 *     GCLOUD_PROJECT=demo-agora-access npx tsx scripts/backfillAgoraApprovals.ts
 *   # a real project — preview, then apply:
 *   GCLOUD_PROJECT=<project> npx tsx scripts/backfillAgoraApprovals.ts
 *   GCLOUD_PROJECT=<project> npx tsx scripts/backfillAgoraApprovals.ts --apply
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldPath, type QueryDocumentSnapshot } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');
const project = process.env.GCLOUD_PROJECT;
if (!project) {
	console.error(
		'Usage: GCLOUD_PROJECT=<project> npx tsx scripts/backfillAgoraApprovals.ts [--apply]',
	);
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId: project });

const db = getFirestore();
const PAGE = 1000;
const AUTH_BATCH = 100;
const WRITE_BATCH = 400;

type Reason =
	| 'school-teacher'
	| 'school-supervisor'
	| 'class-creator'
	| 'class-teacher'
	| 'ran-lesson'
	| 'created-scenario';

const reasons = new Map<string, Set<Reason>>();

function note(uid: unknown, reason: Reason): void {
	if (typeof uid !== 'string' || !uid || uid.includes('/')) return;
	const set = reasons.get(uid) ?? new Set<Reason>();
	set.add(reason);
	reasons.set(uid, set);
}

/** Every doc of a collection, paged by id, with only the named fields */
async function scan(
	collection: string,
	fields: string[],
	visit: (data: Record<string, unknown>) => void,
): Promise<number> {
	let last: QueryDocumentSnapshot | null = null;
	let count = 0;
	for (;;) {
		let query = db
			.collection(collection)
			.select(...fields)
			.orderBy(FieldPath.documentId())
			.limit(PAGE);
		if (last) query = query.startAfter(last);
		const snap = await query.get();
		snap.docs.forEach((doc) => visit(doc.data()));
		count += snap.size;
		if (snap.size < PAGE) return count;
		last = snap.docs[snap.docs.length - 1];
	}
}

function keysOf(value: unknown): string[] {
	return value && typeof value === 'object' ? Object.keys(value) : [];
}

function listOf(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

async function main(): Promise<void> {
	const target = process.env.FIRESTORE_EMULATOR_HOST
		? `emulator ${process.env.FIRESTORE_EMULATOR_HOST}`
		: 'REAL PROJECT';
	console.info(
		`\n# Agora approval backfill — project=${project} (${target}) ${APPLY ? '(APPLY)' : '(DRY RUN)'}\n`,
	);

	const scanned = {
		schools: await scan(
			'agoraSchools',
			['teacherMap', 'teacherIds', 'supervisorMap', 'supervisorIds'],
			(d) => {
				[...keysOf(d.teacherMap), ...listOf(d.teacherIds)].forEach((uid) =>
					note(uid, 'school-teacher'),
				);
				[...keysOf(d.supervisorMap), ...listOf(d.supervisorIds)].forEach((uid) =>
					note(uid, 'school-supervisor'),
				);
			},
		),
		classes: await scan('agoraClasses', ['createdBy', 'teacherIds'], (d) => {
			note(d.createdBy, 'class-creator');
			listOf(d.teacherIds).forEach((uid) => note(uid, 'class-teacher'));
		}),
		sessions: await scan('agoraSessions', ['teacherId'], (d) => note(d.teacherId, 'ran-lesson')),
		scenarios: await scan('agoraTopicPackages', ['creatorId'], (d) =>
			note(d.creatorId, 'created-scenario'),
		),
	};
	console.info('Scanned:', scanned, `→ ${reasons.size} candidate accounts\n`);

	const uids = [...reasons.keys()];
	const skipped = { admin: 0, alreadyGranted: 0, anonymous: 0, noAccount: 0 };
	const toGrant: Array<{ uid: string; email: string; reasons: Reason[] }> = [];

	for (let i = 0; i < uids.length; i += AUTH_BATCH) {
		const chunk = uids.slice(i, i + AUTH_BATCH);
		const [authResult, userSnaps, markerSnaps] = await Promise.all([
			getAuth().getUsers(chunk.map((uid) => ({ uid }))),
			db.getAll(...chunk.map((uid) => db.collection('usersV2').doc(uid))),
			db.getAll(...chunk.map((uid) => db.collection('agoraApprovedTeachers').doc(uid))),
		]);
		const accounts = new Map(authResult.users.map((record) => [record.uid, record]));
		chunk.forEach((uid, index) => {
			const account = accounts.get(uid);
			if (!account) return void skipped.noAccount++;
			if (account.providerData.length === 0) return void skipped.anonymous++;
			if (userSnaps[index].data()?.systemAdmin === true) return void skipped.admin++;
			if (markerSnaps[index].data()?.grant) return void skipped.alreadyGranted++;
			toGrant.push({
				uid,
				email: account.email ?? '(no email)',
				reasons: [...(reasons.get(uid) ?? [])],
			});
		});
	}

	toGrant
		.sort((a, b) => a.email.localeCompare(b.email))
		.forEach((row) => console.info(`  ${row.uid}  ${row.email}  [${row.reasons.join(', ')}]`));
	console.info(`\nWould grant: ${toGrant.length}. Skipped:`, skipped);

	if (!APPLY) {
		console.info('\nDry run — nothing written. Re-run with --apply to write.\n');

		return;
	}

	const now = Date.now();
	for (let i = 0; i < toGrant.length; i += WRITE_BATCH) {
		const batch = db.batch();
		toGrant.slice(i, i + WRITE_BATCH).forEach(({ uid }) =>
			batch.set(
				db.collection('agoraApprovedTeachers').doc(uid),
				{
					teacherId: uid,
					via: 'granted',
					checkedAt: now,
					grant: { source: 'grandfathered', grantedAt: now, grantedBy: 'backfill' },
				},
				{ merge: true },
			),
		);
		await batch.commit();
	}
	console.info(`\nWrote ${toGrant.length} grants.\n`);
}

main().catch((error: unknown) => {
	console.error('Backfill failed:', error instanceof Error ? error.message : error);
	process.exit(1);
});

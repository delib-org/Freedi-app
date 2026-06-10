/**
 * Diagnostic (read-only) for the home Topics lazy-load.
 *
 * Resolves a user by email and inspects their `statementsSubscribe` docs to
 * explain why scroll-to-load-more might not fire on the Topics tab:
 *   - how many top-level subscriptions they have (parentId === 'top')
 *   - how many are group/question (what the Topics tab actually displays)
 *   - the stored TYPE of `lastUpdate` (number vs Firestore Timestamp)
 *   - whether a numeric startAfter() cursor returns the same rows as a
 *     DocumentSnapshot cursor (a mismatch = the bug)
 *
 * USAGE (from functions/):
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/diagnoseHomeLazyLoad.ts tal.yaron@gmail.com
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Filter } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const email = process.argv[2];
const project = process.env.GCLOUD_PROJECT;
if (!email || !project) {
	console.error(
		'Usage: GCLOUD_PROJECT=<proj> npx tsx scripts/diagnoseHomeLazyLoad.ts <email>',
	);
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId: project });

const db = getFirestore();
const INITIAL = 30;

function typeOfLastUpdate(v: unknown): string {
	if (typeof v === 'number') return 'number';
	if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return 'Timestamp';

	return v === null ? 'null' : typeof v;
}

async function main(): Promise<void> {
	const user = await getAuth().getUserByEmail(email);
	const uid = user.uid;
	console.info(`\n# diagnose home lazy-load — ${email} → uid=${uid}\n`);

	// All of the user's subscriptions (for context).
	const allSnap = await db.collection('statementsSubscribe').where('userId', '==', uid).get();
	console.info(`total subscriptions: ${allSnap.size}`);

	// Top-level subscriptions, mirroring the Topics listener query.
	const topQuery = db
		.collection('statementsSubscribe')
		.where(
			Filter.and(
				Filter.where('userId', '==', uid),
				Filter.or(
					Filter.where('parentId', '==', 'top'),
					Filter.where('statement.parentId', '==', 'top'),
				),
			),
		)
		.orderBy('lastUpdate', 'desc');

	const topSnap = await topQuery.get();
	console.info(`top-level subscriptions (parentId==='top'): ${topSnap.size}`);

	// statementType distribution + lastUpdate type distribution.
	const typeCounts: Record<string, number> = {};
	const luTypeCounts: Record<string, number> = {};
	for (const d of topSnap.docs) {
		const data = d.data();
		const st = (data.statementType || data.statement?.statementType || 'unknown') as string;
		typeCounts[st] = (typeCounts[st] ?? 0) + 1;
		const lt = typeOfLastUpdate(data.lastUpdate);
		luTypeCounts[lt] = (luTypeCounts[lt] ?? 0) + 1;
	}
	console.info('  statementType breakdown:', typeCounts);
	console.info('  lastUpdate stored-type breakdown:', luTypeCounts);

	const groupQuestion = (typeCounts['group'] ?? 0) + (typeCounts['question'] ?? 0);
	console.info(`  group/question (what Topics tab shows): ${groupQuestion}`);

	if (topSnap.size <= INITIAL) {
		console.info(
			`\n=> Only ${topSnap.size} top-level subs (<= initial ${INITIAL}). ` +
				'Nothing to lazy-load — "not working" is expected here.\n',
		);

		return;
	}

	// Reproduce the cursor: take the 30th doc (the boundary of the first page).
	const page1 = await topQuery.limit(INITIAL).get();
	const boundaryDoc = page1.docs[page1.docs.length - 1];
	const boundaryValue = boundaryDoc.data().lastUpdate;
	console.info(
		`\nfirst page boundary (doc #${INITIAL}) lastUpdate=`,
		boundaryValue,
		`(type=${typeOfLastUpdate(boundaryValue)})`,
	);

	// Cursor A: numeric value (what the app currently passes — read value coerced to ms).
	const numericCursor =
		typeof boundaryValue === 'number'
			? boundaryValue
			: (boundaryValue?.toMillis?.() as number | undefined) ?? 0;
	const byNumber = await topQuery.startAfter(numericCursor).limit(INITIAL + 1).get();

	// Cursor B: DocumentSnapshot (type-safe, matches the stored field exactly).
	const bySnapshot = await topQuery.startAfter(boundaryDoc).limit(INITIAL + 1).get();

	console.info(`\ncursor by NUMBER  (${numericCursor}) → next-page size: ${byNumber.size}`);
	console.info(`cursor by SNAPSHOT            → next-page size: ${bySnapshot.size}`);

	if (byNumber.size === 0 && bySnapshot.size > 0) {
		console.info(
			'\n=> BUG CONFIRMED: numeric startAfter() returns 0 while snapshot cursor returns rows. ' +
				'lastUpdate is stored as a Timestamp, so the numeric cursor mismatches. ' +
				'Fix: page with a DocumentSnapshot cursor (or numeric only when the field is numeric).\n',
		);
	} else if (byNumber.size === bySnapshot.size) {
		console.info('\n=> Numeric and snapshot cursors agree — cursor type is NOT the problem.\n');
	} else {
		console.info('\n=> Cursors DISAGREE — investigate further (see sizes above).\n');
	}
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('diagnose failed:', e);
		process.exit(1);
	});

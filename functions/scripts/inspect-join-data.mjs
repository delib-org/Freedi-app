/**
 * One-off diagnostic: inspect every place join data lives for a given question.
 *
 *   1. `statements/{questionId}` — the question doc itself + joinForm config
 *   2. `statements/*` where parentId == questionId && statementType == 'option'
 *      — option docs carrying authoritative `joined[]` / `organizers[]`
 *   3. `statements/{questionId}/joinFormSubmissions/*` — current form payloads
 *   4. `statements/{questionId}/joinResolutionUsers/*` — conditional-join state
 *   5. `joinFormSubmissionsHistory` — 90d durable history of form writes
 *   6. `joinRegistrationBackups` — 7d audit of membership transitions
 *
 * Usage: node functions/scripts/inspect-join-data.mjs <questionId>
 */

import admin from 'firebase-admin';

const questionId = process.argv[2];
if (!questionId) {
	console.error('Usage: node functions/scripts/inspect-join-data.mjs <questionId>');
	process.exit(1);
}

admin.initializeApp({ projectId: 'wizcol-app' });
const db = admin.firestore();

async function main() {
	console.info('=== Inspecting join data for question %s ===\n', questionId);

	// 1. Question doc
	const qSnap = await db.collection('statements').doc(questionId).get();
	if (!qSnap.exists) {
		console.error('Question not found');
		process.exit(2);
	}
	const q = qSnap.data();
	const joinForm = q?.statementSettings?.joinForm;
	const joinResolution = q?.statementSettings?.joinResolution;
	console.info('Q: "%s"', q.statement);
	console.info('  joinForm.enabled:       %s', joinForm?.enabled ?? '(not set)');
	console.info('  joinForm.destination:   %s', joinForm?.destination ?? '(not set)');
	console.info('  joinForm.sheetUrl:      %s', joinForm?.sheetUrl ?? '(none)');
	console.info('  joinResolution.enabled: %s', joinResolution?.enabled ?? '(not set)');
	console.info('  joinResolution.phase:   %s', joinResolution?.phase ?? '(not set)');
	console.info('');

	// 2. Option docs with members
	const optionsSnap = await db
		.collection('statements')
		.where('parentId', '==', questionId)
		.where('statementType', '==', 'option')
		.get();
	const memberships = []; // { uid, displayName, role, optionId, optionTitle }
	const uniqueUids = new Set();
	for (const optDoc of optionsSnap.docs) {
		const opt = optDoc.data();
		if (opt.isCluster === true || opt.integratedInto) continue;
		for (const c of opt.joined ?? []) {
			if (!c?.uid) continue;
			memberships.push({
				uid: c.uid,
				displayName: c.displayName ?? '',
				role: 'activist',
				optionId: opt.statementId,
				optionTitle: opt.statement ?? '',
			});
			uniqueUids.add(c.uid);
		}
		for (const c of opt.organizers ?? []) {
			if (!c?.uid) continue;
			memberships.push({
				uid: c.uid,
				displayName: c.displayName ?? '',
				role: 'organizer',
				optionId: opt.statementId,
				optionTitle: opt.statement ?? '',
			});
			uniqueUids.add(c.uid);
		}
	}
	console.info('[option docs] %d options total, %d memberships, %d unique users:', optionsSnap.size, memberships.length, uniqueUids.size);
	for (const m of memberships) {
		console.info(
			'  - %s (%s) — %s in "%s"',
			m.displayName || '(anon)',
			m.uid,
			m.role,
			m.optionTitle.slice(0, 60),
		);
	}
	console.info('');

	// 3. Current joinFormSubmissions
	const subsSnap = await db
		.collection('statements')
		.doc(questionId)
		.collection('joinFormSubmissions')
		.get();
	console.info('[joinFormSubmissions/*] %d current submissions:', subsSnap.size);
	const currentSubmissionUids = new Set();
	for (const d of subsSnap.docs) {
		const s = d.data();
		currentSubmissionUids.add(d.id);
		console.info(
			'  - uid=%s display="%s" role=%s values=%s',
			d.id,
			s.displayName ?? '',
			s.role ?? '',
			JSON.stringify(s.values ?? {}),
		);
	}
	console.info('');

	// 4. joinResolutionUsers
	const resSnap = await db
		.collection('statements')
		.doc(questionId)
		.collection('joinResolutionUsers')
		.get();
	console.info('[joinResolutionUsers/*] %d entries:', resSnap.size);
	for (const d of resSnap.docs) {
		const r = d.data();
		console.info(
			'  - uid=%s status=%s activated=%d',
			d.id,
			r.status,
			(r.activatedIntents ?? []).length,
		);
	}
	console.info('');

	// 5. joinFormSubmissionsHistory — filter by questionId
	const histSnap = await db
		.collection('joinFormSubmissionsHistory')
		.where('questionId', '==', questionId)
		.get();
	console.info('[joinFormSubmissionsHistory] %d entries (90d window):', histSnap.size);
	const histByUid = new Map();
	for (const d of histSnap.docs) {
		const h = d.data();
		if (!histByUid.has(h.userId)) histByUid.set(h.userId, []);
		histByUid.get(h.userId).push(h);
	}
	for (const [uid, entries] of histByUid.entries()) {
		entries.sort((a, b) => (a.capturedAt ?? 0) - (b.capturedAt ?? 0));
		const latest = entries[entries.length - 1];
		console.info(
			'  - uid=%s entries=%d latest_op=%s latest_at=%s display="%s" values=%s',
			uid,
			entries.length,
			latest.operation,
			new Date(latest.capturedAt ?? 0).toISOString(),
			latest.displayName ?? '',
			JSON.stringify(latest.values ?? {}),
		);
	}
	console.info('');

	// 6. joinRegistrationBackups — filter by questionId
	let backupCount = 0;
	try {
		const backupSnap = await db
			.collection('joinRegistrationBackups')
			.where('questionId', '==', questionId)
			.get();
		backupCount = backupSnap.size;
		console.info('[joinRegistrationBackups] %d entries (7d window):', backupCount);
		const backupByUid = new Map();
		for (const d of backupSnap.docs) {
			const b = d.data();
			if (!backupByUid.has(b.userId)) backupByUid.set(b.userId, []);
			backupByUid.get(b.userId).push(b);
		}
		for (const [uid, entries] of backupByUid.entries()) {
			entries.sort((a, b) => (a.eventAt ?? a.capturedAt ?? 0) - (b.eventAt ?? b.capturedAt ?? 0));
			console.info('  - uid=%s entries=%d:', uid, entries.length);
			for (const e of entries.slice(-5)) {
				console.info(
					'      %s %s %s on "%s"',
					new Date(e.eventAt ?? e.capturedAt ?? 0).toISOString(),
					e.action ?? e.operation ?? '?',
					e.role ?? '',
					(e.optionTitle ?? '').slice(0, 50),
				);
			}
		}
	} catch (err) {
		console.info('[joinRegistrationBackups] query failed: %s', err?.message ?? err);
	}
	console.info('');

	// Summary: cross-reference
	console.info('=== CROSS-REFERENCE: members in option arrays vs. data stores ===');
	for (const uid of uniqueUids) {
		const hasCurrent = currentSubmissionUids.has(uid);
		const histEntries = histByUid.get(uid) ?? [];
		console.info(
			'  uid=%s | current submission: %s | history entries: %d',
			uid,
			hasCurrent ? '✓' : '✗ MISSING',
			histEntries.length,
		);
		if (!hasCurrent && histEntries.length > 0) {
			const latest = histEntries[histEntries.length - 1];
			console.info(
				'      → recoverable from history: display="%s" values=%s',
				latest.displayName ?? '',
				JSON.stringify(latest.values ?? {}),
			);
		}
	}
}

main().catch((err) => {
	console.error('FATAL', err);
	process.exit(99);
});

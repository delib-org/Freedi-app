/* One whole Agora game, played by one teacher and three students.
 *
 * Four separate browser contexts (a laptop and three phones). The teacher
 * opens a lesson from the scenario shelf with the DEFAULT plan and walks it
 * with the one NEXT button; each student plays every station the way a child
 * would: reads the scenes, takes a stand on the bridge, writes a story and a
 * need, hearts and weighs classmates, proposes, rates, votes, reads the
 * results. The students' words are typed here — nothing is written for them.
 *
 * What it asserts (Firestore and the screens, not pixels alone):
 *   - every student's station bar follows the teacher to the stage he moved to
 *   - every write is confirmed by the server, and by the screen showing it back
 *   - the vote counts: three votes in the question's tallies and on the
 *     teacher's console, and the recap names what the class elected
 *   - no console errors, no page errors, no stalled-write banner, no spinner
 *     left spinning at the end of any stage
 *
 * Run (solo suite, see CLAUDE.md "Running your own emulators"):
 *   npm run emulators:solo          # repo root
 *   npm run dev:solo                # apps/agora, vite on 3029
 *   npm run seed:solo               # apps/agora
 *   npm run e2e:three               # apps/agora
 * Screenshots land in output/three-students/ (--keep shows the browsers).
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { clearCelebration, eq, fail, mkPage, passNameDoor, shotter, step } from './lib/e2e.mjs';
import { db, signInTeacher } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, Collections } = require('@freedi/shared-types');
const { answerStatementId } = require('../src/lib/statementDocs');

await preflight();

const OUT = 'output/three-students';
mkdirSync(OUT, { recursive: true });
const shot = shotter(OUT);
// --docs=<dir> also files named phone screenshots for the IA docs
const docsFlag = process.argv.find((arg) => arg.startsWith('--docs='));
const DOCS = docsFlag ? docsFlag.slice('--docs='.length) : null;
if (DOCS) mkdirSync(DOCS, { recursive: true });
const docShot = async (page, name) => {
	if (DOCS) await page.screenshot({ path: `${DOCS}/${name}.png` });
};
const KEEP = process.argv.includes('--keep');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runId = `three-${Date.now().toString(36)}`;

const PHONE = { width: 390, height: 800 };
const LAPTOP = { width: 1280, height: 900 };
const TOPIC_TITLE = 'המהפכה הצרפתית';
/** Where each student stands on the bridge (0 = one bank, 100 = the other) */
const STANDS = [15, 50, 85];
const NAMES = ['נועה', 'איתן', 'מאיה'];
const STORIES = [
	'בכיתה ז׳ אמרו לי שאני לא מבינה כי אני לא מהשכונה, וזה עיקם לי את הבטן.',
	'סבא שלי סיפר שהלך ברגל שלושה ימים רק כדי שיקשיבו לו, ואף אחד לא הקשיב.',
	'פעם הפסדתי בהצבעה של הכיתה ועדיין הרגשתי שהקשיבו לי, וזה היה שונה.',
];
const NEEDS = [
	'אני צריכה לדעת שהקול שלי נספר גם אם הוא לא מנצח.',
	'אני צריך שמי שמחליט יסביר לנו למה, ולא רק יחליט.',
	'אני צריכה שלא יצחקו עליי כשאני אומרת משהו שונה מכולם.',
];
const PROPOSALS = [
	'אספה לאומית שבה לכל מעמד יש קול, והחלטות על רכוש דורשות רוב מיוחד.',
	'ועדה משותפת לאצולה ולעם שבודקת כל חוק חדש לפני שהוא יוצא לדרך.',
	'תקופת מעבר של חמש שנים לרפורמות, עם לוח זמנים כתוב שכולם רואים.',
];

// ---------------------------------------------------------------------------
// The record of everything that must stay quiet

/** Noise that is the test harness's own, named so nobody widens it by accident */
const KNOWN_NOISE = [
	// The app signs in anonymously on boot; the shelf read of that first beat is
	// refused until the dev sign-in lands a moment later (a real teacher signs
	// in with Google before ever reaching the shelf).
	/Loading the scenario shelf failed/,
];
const problems = [];
const watched = [];
const watch = (page, who) => {
	watched.push([page, who]);
	page.on('pageerror', (error) => problems.push(`[${who} pageerror] ${error.message.slice(0, 200)}`));
	page.on('console', (message) => {
		if (message.type() !== 'error') return;
		const text = message.text();
		if (KNOWN_NOISE.some((pattern) => pattern.test(text))) return;
		problems.push(`[${who} console] ${text.slice(0, 200)}`);
	});
};
const assertQuiet = (where) => {
	if (problems.length) fail(`${where}: ${problems.length} error(s) —\n   ${problems.join('\n   ')}`);
};

// ---------------------------------------------------------------------------
// Firestore, read as the admin

const sessionDoc = async (sessionId) =>
	(await db.collection(Collections.agoraSessions).doc(sessionId).get()).data();
const statementDoc = async (statementId) =>
	(await db.collection(Collections.statements).doc(statementId).get()).data();

async function until(label, probe, { timeoutMs = 45_000, every = 400 } = {}) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await probe();
		if (value) return value;
		if (Date.now() > deadline) fail(`${label}: timed out after ${timeoutMs / 1000}s`);
		await pause(every);
	}
}

// ---------------------------------------------------------------------------
// What a screen says

/** The index of the station a student's bar is on (the one marked as the step) */
const viewingIndex = (page) =>
	page.evaluate(() => {
		const stations = [...document.querySelectorAll('.stage-nav__station')];

		return stations.findIndex((el) => el.getAttribute('aria-current') === 'step');
	});

/**
 * Every student must land on the station the teacher opened — and on the
 * station, not a lookalike: the bar's own label names it.
 */
async function everyoneIsAt(students, sessionId, label) {
	const { stageIndex = 0, stage } = await sessionDoc(sessionId);
	for (const student of students) {
		await until(
			`${student.name} follows the teacher to ${label}`,
			async () => (await viewingIndex(student.page)) === stageIndex,
			{ timeoutMs: 30_000 },
		);
	}
	console.log(`   ✓ all ${students.length} students are at ${label} (stage ${stage}, index ${stageIndex})`);
}

/** No spinner left spinning, no write stuck in the air, no busy control */
async function settled(page, who, label) {
	await pause(800);
	const stuck = await page.evaluate(() => ({
		spinners: [...document.querySelectorAll('.spinner')].filter((el) => el.offsetParent !== null)
			.length,
		stalled: document.querySelectorAll('.delib-hud__stalled').length,
		busy: document.querySelectorAll('[aria-busy="true"]').length,
	}));
	if (stuck.spinners || stuck.stalled || stuck.busy) {
		await shot(page, `STUCK-${who}-${label}`.replace(/\W+/g, '-'));
		fail(`${who} at ${label}: ${JSON.stringify(stuck)} (spinners / stalled writes / busy controls)`);
	}
}

// ---------------------------------------------------------------------------
// The teacher

async function openLesson(browser) {
	const identity = await signInTeacher(`${runId}-teacher`);
	const page = await mkPage(browser, 'teacher', LAPTOP);
	watch(page, 'teacher');
	await page.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 15_000 });
	// The anonymous sign-in on boot can land AFTER the dev sign-in and win;
	// retry until the teacher tier sticks.
	let tier2 = false;
	for (let attempt = 0; attempt < 5 && !tier2; attempt++) {
		await page.evaluate(
			(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'דנה המורה' }),
			`${runId}-teacher`,
		);
		tier2 = await page
			.waitForFunction(() => window.__agoraDebug?.()?.user?.tier === 2, { timeout: 8000 })
			.then(() => true, () => false);
	}
	if (!tier2) fail('the teacher never reached tier 2');
	// Auth persistence reaches IndexedDB asynchronously; reloading sooner loses it
	await pause(5000);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForSelector(`text=${TOPIC_TITLE}`, { timeout: 30_000 });
	await page.locator(`text=${TOPIC_TITLE}`).first().click();
	await page.waitForURL(/teach\/start/, { timeout: 20_000 });
	await page.locator('button.btn.btn--primary.btn--full.btn--lg').last().click();
	await page.waitForURL(/session/, { timeout: 20_000 });
	await page.waitForSelector('.teacher__code', { timeout: 20_000 });
	const code = (await page.locator('.teacher__code').textContent()).replace(/\s/g, '');
	const sessionId = page.url().split('/').pop();

	// A laptop is asked once where it is; "just me" keeps the names on screen
	const choice = page.locator('.device-role[data-mode="ask"] .device-role__choice[data-role="private"]');
	if (await choice.waitFor({ timeout: 6000 }).then(() => true, () => false)) {
		await choice.click();
		await page.locator('.device-role__scrim').waitFor({ state: 'detached', timeout: 5000 });
	}

	return { page, code, sessionId, uid: identity.uid };
}

/** NEXT, as a teacher presses it, then wait for the server to have moved */
async function teacherNext(teacher, label) {
	const before = (await sessionDoc(teacher.sessionId)).stageIndex ?? 0;
	await teacher.page.locator('#teacher-next').click();
	await until(`NEXT moves the room to ${label}`, async () => {
		return ((await sessionDoc(teacher.sessionId)).stageIndex ?? 0) === before + 1;
	});
}

// ---------------------------------------------------------------------------
// The students

async function joinStudent(browser, code, index) {
	const page = await mkPage(browser, `S${index + 1}`, PHONE);
	watch(page, `S${index + 1}`);
	await page.goto(`${VITE_HOST}/#!/join/${code}`, { waitUntil: 'domcontentloaded' });
	await passNameDoor(page, NAMES[index]);
	await page.locator('.place-bar__item[data-place="village"]').waitFor({ timeout: 30_000 });
	const uid = await until('the student has an identity', () =>
		page.evaluate(() => window.__agoraDebug?.()?.user?.user?.uid ?? null),
	);

	return { page, uid, index, name: `S${index + 1}` };
}

const door = async (page, place) => {
	await page.locator(`.place-bar__item[data-place="${place}"]`).click();
	await pause(600);
};

/** Click through a character scene until there is nothing left to press */
async function readScenes(page) {
	for (let press = 0; press < 40; press++) {
		// The primary button always moves on; the secondary one only turns pages inside a scene
		const button = page.locator('.scene__actions .btn--primary').first();
		if ((await button.count()) === 0) return;
		await button.click({ timeout: 4000 }).catch(() => {});
		await pause(250);
	}
}

async function takeStand(student, value) {
	const { page } = student;
	// The characters speak once more before the question is asked
	await readScenes(page);
	// ...and the last line of the cast's bubble is the invitation to the bridge
	await page.locator('.cast-bubble__foot .btn--primary').click({ timeout: 10_000 });
	await page.waitForSelector('input.camp-scale__slider', { state: 'visible', timeout: 20_000 });
	await page.locator('input.camp-scale__slider').evaluate((el, v) => {
		el.value = String(v);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
	await page.locator('button.btn--primary.btn--full.btn--lg').click();
	await page.waitForSelector('.lobby__status', { timeout: 15_000 });
}

/** Write under a round item (story / needs) through the real pen, and see it saved */
async function writeRound(session, student, itemId, text) {
	const { page } = student;
	await door(page, 'note');
	if (itemId === 'round-story' && student.index === 0) await docShot(page, 'after-ingame-question-round');
	await page.locator('textarea.round__textarea').fill(text);
	await page.locator('.round__editor .btn--primary').click();
	// The screen reads my words back only once the server has them
	// (the village walks the writer to the board, where the note stands once it is confirmed)
	await page.locator('.village-note', { hasText: text.slice(0, 18) }).first().waitFor({ timeout: 20_000 });
	const id = answerStatementId(session.sessionId, student.uid, itemId);
	const stored = await until(`${student.name}'s ${itemId} text reached the server`, () => statementDoc(id));
	eq(`${student.name} ${itemId} text stored`, stored.statement, text);

	return id;
}

// ---------------------------------------------------------------------------

const browser = await chromium.launch({
	headless: !KEEP,
	args: ['--use-angle=metal', '--ignore-gpu-blocklist'],
});
let toastShot = false;
const toastWatch = setInterval(async () => {
	if (toastShot || !DOCS) return;
	for (const [page, who] of watched) {
		if (!who.startsWith('S')) continue;
		if (await page.locator('.toast-stack .toast').first().isVisible().catch(() => false)) {
			toastShot = true;
			await docShot(page, 'after-ingame-toast');
			console.log(`   (toast captured on ${who})`);
			return;
		}
	}
}, 300);

try {
	step('The teacher opens a lesson from the shelf, on the default plan');
	const teacher = await openLesson(browser);
	console.log(`   session ${teacher.sessionId} (code ${teacher.code})`);
	const opened = await sessionDoc(teacher.sessionId);
	const plan = opened.stagePlan.map((item) => item.stage === AgoraStage.question ? `question:${item.kind}` : item.stage);
	console.log(`   plan: ${plan.join(' → ')}`);
	eq('the default plan is the scenario WizCol plan', plan.join(','), [
		'lobby', 'framing', 'perspectives', 'needs', 'positioning',
		'question:story', 'question:needs', 'deliberation', 'voting', 'results',
	].join(','));
	const storyItem = opened.stagePlan.find((item) => item.kind === 'story');
	const needsItem = opened.stagePlan.find((item) => item.kind === 'needs');

	step('Three students join with the code');
	const students = [];
	for (let index = 0; index < 3; index++) {
		students.push(await joinStudent(browser, teacher.code, index));
	}
	await until('three seats on the roster', async () => {
		const seats = await db
			.collection(Collections.agoraParticipants)
			.where('sessionId', '==', teacher.sessionId)
			.get();

		// The scenario's characters hold seats of their own; the students' are the ones with a uid we know
		return students.every((student) => seats.docs.some((seat) => seat.id.endsWith(`--${student.uid}`)));
	});
	console.log('   ✓ three students hold seats on the roster');
	await everyoneIsAt(students, teacher.sessionId, 'the lobby');
	await shot(teacher.page, 'teacher-lobby');
	for (const student of students) await settled(student.page, student.name, 'lobby');

	// -----------------------------------------------------------------------
	for (const [stage, label] of [
		[AgoraStage.framing, 'framing'],
		[AgoraStage.perspectives, 'perspectives'],
		[AgoraStage.needs, 'the needs scene'],
	]) {
		step(`The teacher opens ${label}`);
		await teacherNext(teacher, label);
		await everyoneIsAt(students, teacher.sessionId, label);
		await Promise.all(students.map((student) => readScenes(student.page)));
		await shot(students[0].page, `student-${stage}`);
		for (const student of students) await settled(student.page, student.name, label);
	}

	step('The bridge: each student takes a stand');
	await teacherNext(teacher, 'positioning');
	await everyoneIsAt(students, teacher.sessionId, 'positioning');
	for (const student of students) await takeStand(student, STANDS[student.index]);
	await until('the three stands are on the roster', async () => {
		const seats = await db
			.collection(Collections.agoraParticipants)
			.where('sessionId', '==', teacher.sessionId)
			.get();

		return students.every((student) =>
			seats.docs.some(
				(seat) => seat.id.endsWith(`--${student.uid}`) && typeof seat.data().campPosition === 'number',
			),
		);
	});
	for (const student of students) {
		const seat = (
			await db.collection(Collections.agoraParticipants).doc(`${teacher.sessionId}--${student.uid}`).get()
		).data();
		eq(`${student.name} stands at`, seat.campPosition, STANDS[student.index]);
	}
	for (const student of students) await settled(student.page, student.name, 'positioning');

	// -----------------------------------------------------------------------
	step('Story round: each writes a story');
	await teacherNext(teacher, 'the story round');
	await everyoneIsAt(students, teacher.sessionId, 'the story round');
	const session1 = await sessionDoc(teacher.sessionId);
	const storyIds = [];
	for (const student of students) {
		storyIds.push(await writeRound(session1, student, storyItem.itemId, STORIES[student.index]));
	}
	await shot(students[0].page, 'student-story');
	for (const student of students) await settled(student.page, student.name, 'story');

	step('Story round: each hearts a classmate, and the author is paid for it');
	for (const student of students) {
		const target = (student.index + 1) % 3;
		await door(student.page, 'board');
		const note = student.page.locator('.village-note', { hasText: STORIES[target].slice(0, 18) }).first();
		await note.waitFor({ timeout: 30_000 });
		await note.locator('.like-button').click();
		const evaluationId = `${student.uid}--${storyIds[target]}`;
		const heart = await until(`${student.name}'s heart reached the server`, async () =>
			(await db.collection(Collections.evaluations).doc(evaluationId).get()).data(),
		);
		eq(`${student.name} hearted ${students[target].name}'s story`, heart.evaluation > 0, true);
		await note.locator('.like-button--on').waitFor({ timeout: 10_000 });
	}
	for (const student of students) {
		const seat = `${teacher.sessionId}--${student.uid}`;
		const paid = await until(`${student.name} was paid one heart`, async () => {
			const row = (await db.collection(Collections.agoraParticipants).doc(seat).get()).data();

			return (row?.points?.appreciation ?? 0) === 1 ? row : null;
		});
		eq(`${student.name} appreciation points`, paid.points.appreciation, 1);
	}
	for (const student of students) await settled(student.page, student.name, 'story hearts');

	assertQuiet('after the story round');

	step('Needs round: each writes a need and weighs a classmate\'s');
	await teacherNext(teacher, 'the needs round');
	await everyoneIsAt(students, teacher.sessionId, 'the needs round');
	const needsIds = [];
	for (const student of students) {
		needsIds.push(await writeRound(session1, student, needsItem.itemId, NEEDS[student.index]));
	}
	for (const student of students) {
		const target = (student.index + 1) % 3;
		await door(student.page, 'board');
		const note = student.page.locator('.village-note', { hasText: NEEDS[target].slice(0, 18) }).first();
		await note.waitFor({ timeout: 30_000 });
		await note.locator('.unit-scale__step').last().click();
		const evaluationId = `${student.uid}--${needsIds[target]}`;
		const weighed = await until(`${student.name}'s weighing reached the server`, async () =>
			(await db.collection(Collections.evaluations).doc(evaluationId).get()).data(),
		);
		eq(`${student.name} weighed ${students[target].name}'s need as the strongest`, weighed.evaluation, 1);
		await note.locator('.unit-scale__step--on').waitFor({ timeout: 10_000 });
	}
	await shot(students[0].page, 'student-needs-board');
	await docShot(students[0].page, 'after-ingame-notes-board');
	for (const student of students) await settled(student.page, student.name, 'needs round');
	assertQuiet('after the needs round');

	step('The square: each proposes');
	await teacherNext(teacher, 'the square');
	await everyoneIsAt(students, teacher.sessionId, 'the square');
	const { challengeQuestionId } = await sessionDoc(teacher.sessionId);
	const proposalIds = [];
	for (const student of students) {
		const { page } = student;
		await door(page, 'note');
		await page.locator('textarea.write-desk__textarea').fill(PROPOSALS[student.index]);
		await page.locator('.delib__actions .btn--primary').click();
		const proposal = await until(`${student.name}'s proposal reached the server`, async () => {
			const found = await db
				.collection(Collections.statements)
				.where('parentId', '==', challengeQuestionId)
				.where('creatorId', '==', student.uid)
				.get();

			return found.docs[0]?.data() ?? null;
		});
		eq(`${student.name} proposal stored`, proposal.statement, PROPOSALS[student.index]);
		proposalIds.push(proposal.statementId);
		// The board stands the note up only once the proposal is confirmed
		await page.locator('.village-note', { hasText: PROPOSALS[student.index].slice(0, 18) }).first().waitFor({ timeout: 20_000 });
		await clearCelebration(page, student.name);
	}
	for (const student of students) {
		const row = await until(`${student.name} was paid for the proposal`, async () => {
			const seat = (
				await db.collection(Collections.agoraParticipants).doc(`${teacher.sessionId}--${student.uid}`).get()
			).data();

			return (seat?.points?.proposals ?? 0) >= 3 ? seat : null;
		});
		eq(`${student.name} proposal credit`, row.points.proposals, 3);
	}
	for (const student of students) await settled(student.page, student.name, 'proposals');

	step('The square: each weighs both classmates\' proposals');
	for (const student of students) {
		const { page } = student;
		await clearCelebration(page, student.name);
		await door(page, 'board');
		for (const target of [0, 1, 2].filter((other) => other !== student.index)) {
			const note = page.locator('.village-note', { hasText: PROPOSALS[target].slice(0, 18) }).first();
			await note.waitFor({ timeout: 30_000 });
			await clearCelebration(page, student.name);
			await note.locator('.rate-scale__option--for').click();
			const evaluationId = `${student.uid}--${proposalIds[target]}`;
			const rated = await until(`${student.name}'s rating reached the server`, async () =>
				(await db.collection(Collections.evaluations).doc(evaluationId).get()).data(),
			);
			eq(`${student.name} rated ${students[target].name}'s proposal in favour`, rated.evaluation > 0, true);
		}
		await clearCelebration(page, student.name);
	}
	// The shared pipeline turns ratings into each proposal's consensus
	for (const [index, id] of proposalIds.entries()) {
		await until(`proposal ${index + 1} has a consensus`, async () => {
			const doc = await statementDoc(id);

			return doc && typeof doc.consensus === 'number' && doc.consensus > 0;
		}, { timeoutMs: 60_000 });
	}
	console.log('   ✓ every proposal carries a consensus from the two ratings it received');
	await shot(students[0].page, 'student-square-rated');
	await docShot(students[0].page, 'after-ingame-deliberation');
	for (const student of students) await settled(student.page, student.name, 'square');
	assertQuiet('after the square');

	step('The vote opens: a ballot is drawn up and the class votes');
	await teacherNext(teacher, 'the vote');
	await everyoneIsAt(students, teacher.sessionId, 'the vote');
	const voting = await until('the ballot is drawn up', async () => {
		const ballot = (await sessionDoc(teacher.sessionId)).voting;

		return ballot?.candidateIds?.length ? ballot : null;
	}, { timeoutMs: 20_000 }).catch(() => null);
	console.log(`   ballot: ${voting?.candidateIds?.length ?? 0} candidates`);
	if (!voting?.candidateIds?.length) fail('the ballot is empty');
	const onBallot = proposalIds.filter((id) => voting.candidateIds.includes(id));
	if (onBallot.length < 2) fail(`only ${onBallot.length} of the three proposals reached the ballot`);
	const choices = [onBallot[0], onBallot[0], onBallot[1]];
	const choiceText = (id) => PROPOSALS[proposalIds.indexOf(id)].slice(0, 18);
	for (const student of students) {
		const { page } = student;
		await clearCelebration(page, student.name);
		let found = false;
		for (const place of ['results', 'board', 'village']) {
			await door(page, place);
			found = await page.locator('.voting__option').first().waitFor({ timeout: 5000 }).then(() => true, () => false);
			if (found) break;
		}
		if (!found) fail(`${student.name} found no ballot behind any door`);
		await page.locator('.voting__option', { hasText: choiceText(choices[student.index]) }).first().click();
		await page.locator('.voting__option--mine').first().waitFor({ timeout: 15_000 });
		if (student.index === 0) await docShot(page, 'after-ingame-voting');
		const vote = await until(`${student.name}'s vote reached the server`, async () =>
			(await db.collection('votes').doc(`${student.uid}--${challengeQuestionId}`).get()).data(),
		);
		eq(`${student.name} voted for`, vote.statementId, choices[student.index]);
	}
	const tally = await until('three votes counted on the question', async () => {
		const selections = (await statementDoc(challengeQuestionId)).selections ?? {};
		const total = Object.values(selections).reduce((sum, n) => sum + n, 0);

		return total === 3 ? selections : null;
	});
	eq('votes for the first choice', tally[choices[0]], 2);
	eq('votes for the second choice', tally[choices[2]], 1);
	for (const student of students) await settled(student.page, student.name, 'vote');
	await shot(teacher.page, 'teacher-vote');
	await until('the teacher sees all three votes in', async () =>
		/3 מתוך 3/.test(await teacher.page.locator('body').innerText()),
	{ timeoutMs: 15_000 });
	console.log('   ✓ the teacher\'s console shows 3 of 3 voted');
	assertQuiet('after the vote');

	step('The teacher shows the results: the recap crowns what the class elected');
	await teacherNext(teacher, 'the results');
	await everyoneIsAt(students, teacher.sessionId, 'the results');
	const scored = await until('the recap lands on the session', async () =>
		(await sessionDoc(teacher.sessionId)).classScore ?? null,
	{ timeoutMs: 90_000 });
	eq('the elected proposal', scored.voteWinnerStatementId, choices[0]);
	eq('votes counted for it', scored.voteCounts[choices[0]], 2);
	eq('total votes', scored.voteTotal, 3);
	for (const student of students) {
		const { page } = student;
		await clearCelebration(page, student.name);
		await door(page, 'results');
		await page.locator('.results__mine, .results__total, .village-scoreboard').first().waitFor({ timeout: 30_000 });
		await clearCelebration(page, student.name);
		await shot(page, `student-results-${student.name}`);
		if (student.index === 0) await docShot(page, 'after-ingame-results');
		await settled(page, student.name, 'results');
	}
	await shot(teacher.page, 'teacher-results');
	assertQuiet('at the end of the game');

	console.log('\n✅ one teacher and three students played the whole game: every stage followed, every write confirmed, the vote counted, the console quiet');

} catch (error) {
	console.error('\n✗', error.message);
	// What a student could press when it broke — the quickest way to see what the script was looking at
	console.error(await watched[1]?.[0].evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => `${b.className} :: ${b.textContent.trim().slice(0, 30)} :: parent=${b.parentElement.className}`).join('\n')).catch(() => ''));
	for (const [page, who] of watched) await shot(page, `FAILED-${who}`).catch(() => {});
	process.exitCode = 1;
} finally {
	if (!KEEP) await browser.close();
}
clearInterval(toastWatch);
process.exit(process.exitCode ?? 0);

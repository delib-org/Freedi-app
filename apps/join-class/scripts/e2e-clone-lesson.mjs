// "New lesson from a previous one" (t2), end to end on the emulators: auth + firestore +
// functions (classCloneLesson) + the app on JOIN_CLASS_URL. Ports: see e2e-env.mjs
// (E2E_FUNCTIONS_PORT for the callable). Run from apps/join-class:
//
//   VITE_EMULATOR_AUTH_PORT=<auth> VITE_EMULATOR_FIRESTORE_PORT=<firestore> \
//     VITE_EMULATOR_FUNCTIONS_PORT=<functions> VITE_EMULATOR_DATABASE_PORT=<rtdb> \
//     npx vite --port 3041 --strictPort
//   JOIN_CLASS_URL=http://localhost:3041 E2E_AUTH_PORT=<auth> E2E_FIRESTORE_PORT=<firestore> \
//     E2E_FUNCTIONS_PORT=<functions> node scripts/e2e-clone-lesson.mjs
//
// Flow: seed one played lesson (ended; 4 questions incl. a challenge with a closed ballot,
// intro paragraph + list, 2 videos, side names, students, proposals, tables), sign in as its
// teacher, "+ שיעור חדש" -> "שאלות משיעור קודם" -> "בחירה" -> "יצירה", then read the new lesson
// back with the Admin SDK: step 0 / live / new code / source link, the plan copied, nothing of
// the class work copied. Then: the row is still listed after 16 s, a second copy from the row's
// own action, a retry with the same id (reused), a second user (permission-denied), and the old
// class code still leading to the old lesson.
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
	AUTH_PORT,
	BASE_URL as BASE,
	FIRESTORE_PORT,
	FUNCTIONS_PORT,
	PROJECT_ID,
} from './e2e-env.mjs';
import { signInTeacher } from './e2e-auth.mjs';

const TIMEOUT = 20000;
const REMARK_WAIT_MS = 16000;
const TRIGGER_SETTLE_MS = 8000;
const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);
const auth = getAuth(app);

let failures = 0;
function check(label, ok, detail = '') {
	console.info(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
	if (!ok) failures += 1;
}

// ---- seed: one played lesson ----------------------------------------------------
const sourceId = `played-${Date.now()}`;
const seed = spawnSync(
	'npx',
	[
		'tsx',
		'apps/join-class/scripts/seed-classroom.ts',
		'--played',
		'--seated',
		'--step=7',
		'--students=12',
		`--id=${sourceId}`,
	],
	{ cwd: new URL('../../..', import.meta.url).pathname, env: process.env, encoding: 'utf8' },
);
if (seed.status !== 0) {
	console.error(seed.stdout, seed.stderr);
	console.info('FAIL  seed script');
	process.exit(1);
}
const seeded = JSON.parse(
	(await import('node:fs')).readFileSync(new URL('./.seed-output.json', import.meta.url), 'utf8'),
);
const teacherUid = seeded.teacher.uid;
const sourceCode = seeded.classCode;
const sourceDoc = (await db.doc(`statements/${sourceId}`).get()).data();
const sourceTitle = sourceDoc.statement;
check('seed: an ended played lesson', sourceDoc.statementSettings.lessonPlan.status === 'ended');
// With the functions emulator running, onStatementCreated replaces the seeded teacher
// subscription (a plain `set`) a moment after the statement appears, dropping the
// `openedInClass` marker that lists the lesson. Let it finish, then mark the lesson again.
await new Promise((resolve) => setTimeout(resolve, TRIGGER_SETTLE_MS));
await db
	.doc(`statementsSubscribe/${teacherUid}--${sourceId}`)
	.set({ openedInClass: Date.now(), lastUpdate: Date.now() }, { merge: true });

// ---- helpers ----------------------------------------------------------------------
/** E2E_SHOTS=<dir> saves a screenshot per step (a look at the layout, not an assertion). */
async function shot(name) {
	if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/${name}.png` });
}

async function childrenOf(parentId) {
	const snap = await db.collection('statements').where('parentId', '==', parentId).get();

	return snap.docs.map((d) => d.data());
}

async function idTokenOf(uid) {
	const custom = await auth.createCustomToken(uid);
	const res = await fetch(
		`http://localhost:${AUTH_PORT}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token: custom, returnSecureToken: true }),
		},
	);

	return (await res.json()).idToken;
}

async function callClone(uid, data) {
	const res = await fetch(
		`http://localhost:${FUNCTIONS_PORT}/${PROJECT_ID}/me-west1/classCloneLesson`,
		{
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${await idTokenOf(uid)}`,
			},
			body: JSON.stringify({ data }),
		},
	);
	const body = await res.json();

	return { status: res.status, result: body.result, error: body.error };
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, locale: 'he-IL' });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

try {
	await signInTeacher(page, BASE, teacherUid);
	await page.goto(`${BASE}/t`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.teacher-home__row', { timeout: TIMEOUT });
	check('home lists the played lesson, ended, with the continue hint and the copy action',
		(await page.locator('.teacher-home__row').count()) === 1 &&
			(await page.locator('.teacher-home__hint').count()) === 1 &&
			(await page.locator('[data-action="copy"]').count()) === 1);

	// ---- 1. from the top: choose -> pick -> name -> create -----------------------
	await page.click('.teacher-home__new');
	await page.waitForSelector('[data-choice="new"]', { timeout: TIMEOUT });
	check('"+ שיעור חדש" asks which questions, focus on the first answer',
		(await page.locator('#create-lead').innerText()).includes('עם אילו שאלות') &&
			(await page.evaluate(() => document.activeElement?.getAttribute('data-choice'))) === 'new');
	await shot('1-choose');
	await page.click('[data-choice="previous"]');
	await page.waitForSelector('#pick-lead', { timeout: TIMEOUT });
	await shot('2-pick');
	check('pick mode: lead, one "בחירה" per row, no other row actions',
		(await page.locator('[data-action="pick"]').count()) === 1 &&
			(await page.locator('[data-action="plan"], [data-action="reopen"], [data-action="copy"]').count()) === 0);
	await page.keyboard.press('Escape');
	await page.waitForSelector('[data-choice="previous"]', { timeout: TIMEOUT });
	check('Escape in pick mode goes back to the question, focus on "שאלות משיעור קודם"',
		(await page.evaluate(() => document.activeElement?.getAttribute('data-choice'))) === 'previous');
	await page.click('[data-choice="previous"]');
	await page.click('[data-action="pick"]');
	await page.waitForSelector('#teacher-copy-title', { timeout: TIMEOUT });
	check('copy form: prefilled with the source title, selected',
		(await page.inputValue('#teacher-copy-title')) === sourceTitle &&
			(await page.evaluate(() => {
				const el = document.activeElement;

				return el?.id === 'teacher-copy-title' && el.selectionStart === 0 && el.selectionEnd === el.value.length;
			})));
	await shot('3-copy-form');
	await page.click('.teacher-home__form button[type=submit]');
	await page.waitForURL(/\/t\/[^/]+\/plan$/, { timeout: TIMEOUT });
	const firstId = page.url().split('/t/')[1].split('/')[0];
	check('create routes to /t/<new>/plan', firstId !== sourceId, firstId);

	// ---- 2. what the new lesson is -----------------------------------------------
	const first = (await db.doc(`statements/${firstId}`).get()).data();
	const plan = first.statementSettings.lessonPlan;
	check('new main: step 0, live, no progress', plan.stepIndex === 0 && plan.status === 'live' && !plan.endedAt && !plan.projectorVideoId);
	const newCode = first.statementSettings.classCode;
	check('new main: its own 6-digit code in classCodes', /^\d{6}$/.test(newCode) && newCode !== sourceCode &&
		(await db.doc(`classCodes/${newCode}`).get()).data()?.mainId === firstId);
	check('new main: source link', first.sourceLessonId === sourceId && first.sourceLessonTitle === sourceTitle);
	check('new main: title, language, videos, side names carried',
		first.statement === sourceTitle && first.defaultLanguage === 'he' && first.forceLanguage === true &&
			first.statementSettings.introVideos?.length === 2 &&
			first.statementSettings.sideNames?.a === 'Dana' && first.statementSettings.sideNames?.b === 'Omer');
	check('new main: topParent is itself, parent top', first.topParentId === firstId && first.parentId === 'top');
	const kids = await childrenOf(firstId);
	const questions = kids.filter((k) => k.statementType === 'question').sort((a, b) => a.order - b.order);
	const sourceQs = (await childrenOf(sourceId))
		.filter((k) => k.statementType === 'question' && !k.classTable)
		.sort((a, b) => a.order - b.order);
	check('questions: same texts, roles and hints, in order, order 0..n-1',
		questions.length === sourceQs.length && questions.length === 4 &&
			questions.every((q, i) => q.statement === sourceQs[i].statement &&
				q.statementSettings.classRole === sourceQs[i].statementSettings.classRole &&
				q.statementSettings.hint === sourceQs[i].statementSettings.hint && q.order === i));
	const challenge = questions.find((q) => q.statementSettings.classRole === 'challenge');
	check('challenge copied without its ballot or round phase',
		Boolean(challenge) && !challenge.statementSettings.ballot && !challenge.statementSettings.roundPhase);
	const paragraphs = kids.filter((k) => k.statementType === 'paragraph').sort((a, b) => a.order - b.order);
	check('intro: 2 paragraphs, the list keeps its kind',
		paragraphs.length === 2 && paragraphs[1].blockType === 'li' && paragraphs[1].doc?.listType === 'ul' &&
			paragraphs[0].statement.startsWith('Phones are everywhere'));
	// nothing else under the new lesson
	const newIds = new Set([firstId, ...kids.map((k) => k.statementId)]);
	const underQuestions = (await Promise.all(questions.map((q) => childrenOf(q.statementId)))).flat();
	check('no proposals, answers or other statements under the new lesson',
		kids.length === questions.length + paragraphs.length && underQuestions.length === 0);
	const tables = await db.collection('classTables').where('mainId', '==', firstId).get();
	const subs = await db.collection('statementsSubscribe').where('statementId', '==', firstId).get();
	check('no tables, and no student subscriptions on the new lesson', tables.empty &&
		subs.docs.every((d) => d.data().userId === teacherUid), `subscriptions: ${subs.size}`);
	check('the source is untouched (ended, old code, ballot, its own children)',
		(await db.doc(`statements/${sourceId}`).get()).data().statementSettings.lessonPlan.status === 'ended' &&
			(await db.doc(`classCodes/${sourceCode}`).get()).data()?.mainId === sourceId &&
			Boolean((await db.doc(`statements/${seeded.challengeId}`).get()).data().statementSettings.ballot));
	check('every new statement has the teacher as creator and no newline in its text',
		[first, ...kids].every((s) => s.creatorId === teacherUid && !String(s.statement).includes('\n')) && newIds.size > 1);

	// the plan screen shows where it came from
	await page.waitForSelector('.plan__copied-from', { timeout: TIMEOUT });
	check('plan screen: "הועתק מהשיעור ..." line',
		(await page.locator('.plan__copied-from').innerText()).includes(sourceTitle));

	// ---- 3. still listed after the re-mark window -------------------------------------
	await page.waitForTimeout(REMARK_WAIT_MS);
	await page.goto(`${BASE}/t`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.teacher-home__row', { timeout: TIMEOUT });
	await page.waitForFunction(() => document.querySelectorAll('.teacher-home__row').length === 2, null, { timeout: TIMEOUT });
	check('the new lesson is listed after 16 s (the first row, "עוד לא התחיל")',
		(await page.locator('.teacher-home__row').first().innerText()).includes('עוד לא התחיל'));

	// ---- 4. again, from the row's own action -------------------------------------------
	await shot('4-home-two-rows');
	await page.click(`[data-action="copy"][data-id="${sourceId}"]`);
	await page.waitForSelector('#teacher-copy-title', { timeout: TIMEOUT });
	check('row action opens the copy form at the top, prefilled',
		(await page.inputValue('#teacher-copy-title')) === sourceTitle);
	await page.fill('#teacher-copy-title', 'Second class, same questions');
	await page.keyboard.press('Escape');
	await page.waitForSelector('.teacher-home__new', { timeout: TIMEOUT });
	check('Escape from a row copy goes back to idle, focus on that row\'s copy action',
		(await page.evaluate(() => document.activeElement?.getAttribute('data-action'))) === 'copy');
	await page.click(`[data-action="copy"][data-id="${sourceId}"]`);
	await page.fill('#teacher-copy-title', 'Second class, same questions');
	await page.click('.teacher-home__form button[type=submit]');
	await page.waitForURL(/\/t\/[^/]+\/plan$/, { timeout: TIMEOUT });
	const secondId = page.url().split('/t/')[1].split('/')[0];
	const second = (await db.doc(`statements/${secondId}`).get()).data();
	check('second copy: another lesson, its own code, the typed name',
		secondId !== firstId && second.statement === 'Second class, same questions' &&
			second.statementSettings.classCode !== newCode && second.sourceLessonTitle === sourceTitle);

	// ---- 5. retry with the same id, other teacher, old code ------------------------------
	const retryId = `retry-${Date.now()}`;
	const one = await callClone(teacherUid, { sourceMainId: sourceId, newMainId: retryId, title: 'Retry' });
	const two = await callClone(teacherUid, { sourceMainId: sourceId, newMainId: retryId, title: 'Retry' });
	const retryKids = await childrenOf(retryId);
	check('same newMainId twice: the second returns the first lesson, nothing doubled',
		one.result?.reused === false && two.result?.reused === true &&
			one.result.classCode === two.result.classCode && retryKids.length === 6,
		`kids ${retryKids.length}`);
	const refusedId = `nope-${Date.now()}`;
	const stranger = await callClone('someone-else', { sourceMainId: sourceId, newMainId: refusedId });
	check('a second user is refused (permission-denied), nothing created',
		stranger.error?.status === 'PERMISSION_DENIED' &&
			!(await db.doc(`statements/${refusedId}`).get()).exists);
	const noLesson = await callClone(teacherUid, { sourceMainId: seeded.challengeId, newMainId: `q-${Date.now()}` });
	check('a question that is not a lesson is refused', noLesson.error?.status === 'FAILED_PRECONDITION', noLesson.error?.status);

	const student = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: 'he-IL' });
	const studentPage = await student.newPage();
	await studentPage.goto(`${BASE}/c/${sourceCode}`, { waitUntil: 'domcontentloaded' });
	// the source lesson is ended, so its code lands on the ended screen of THAT lesson
	await studentPage.waitForURL((u) => u.pathname === `/m/${sourceId}`, { timeout: TIMEOUT });
	await studentPage.waitForFunction((title) => document.body.innerText.includes(title), sourceTitle, {
		timeout: TIMEOUT,
	});
	check('/c/<old code> still leads to the old lesson', true);
	await student.close();

	check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
} catch (error) {
	console.error(error);
	check('script ran to the end', false, String(error?.message ?? error).split('\n')[0]);
	await page.screenshot({ path: new URL('./.e2e-clone-fail.png', import.meta.url).pathname }).catch(() => {});
} finally {
	await browser.close();
	console.info(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}  (ports: auth ${AUTH_PORT}, firestore ${FIRESTORE_PORT}, functions ${FUNCTIONS_PORT})`);
	process.exit(failures === 0 ? 0 : 1);
}

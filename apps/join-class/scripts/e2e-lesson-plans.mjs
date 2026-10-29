// Lesson plans > games > lessons (docs/ia/join-class-lesson-plan.md), end to end on the
// emulators: auth + firestore + functions (classStartLesson, classSnapshotGame) + the app on
// JOIN_CLASS_URL. Ports: see e2e-env.mjs. Run from apps/join-class:
//
//   VITE_EMULATOR_AUTH_PORT=<auth> VITE_EMULATOR_FIRESTORE_PORT=<firestore> \
//     VITE_EMULATOR_FUNCTIONS_PORT=<functions> VITE_EMULATOR_DATABASE_PORT=<rtdb> \
//     npx vite --port 3047 --strictPort
//   JOIN_CLASS_URL=http://localhost:3047 E2E_AUTH_PORT=<auth> E2E_FIRESTORE_PORT=<firestore> \
//     E2E_FUNCTIONS_PORT=<functions> node scripts/e2e-lesson-plans.mjs
//
// Flow: a teacher with an OLD top-level lesson and an Agora class (plus an archived one):
//   1. home lists the old lesson as a plan; a new plan is created (plan doc + first game)
//   2. the game screen takes a challenge, two questions and an intro; it all lands in the game doc
//   3. "+ lesson with a class": only the active class is offered; the lesson sits under the
//      class home with the game's questions; the console's back link names the plan
//   4. a second lesson with "no class" sits under the teacher home; the plan screen lists both,
//      with a class filter
//   5. the old lesson reads as a plan of its own (no "+ lesson" on it) and its console works
//   6. a student on a 360x640 phone joins both lessons by code; the parents queries find the
//      options and replies under a home-based lesson AND under an old top-level one
//   7. a student cannot open a home; another teacher cannot open the plan
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { BASE_URL as BASE, PROJECT_ID } from './e2e-env.mjs';
import { signInTeacher } from './e2e-auth.mjs';

const TIMEOUT = 20000;
const TRIGGER_SETTLE_MS = 8000;
const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));

let failures = 0;
function check(label, ok, detail = '') {
	console.info(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
	if (!ok) failures += 1;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- seed: an old top-level lesson, live, with proposals ---------------------------
const oldId = `old-${Date.now()}`;
const seed = spawnSync(
	'npx',
	['tsx', 'apps/join-class/scripts/seed-classroom.ts', '--step=5', '--seated', '--proposals', '--students=8', `--id=${oldId}`],
	{ cwd: new URL('../../..', import.meta.url).pathname, env: process.env, encoding: 'utf8' },
);
if (seed.status !== 0) {
	console.error(seed.stdout, seed.stderr);
	console.info('FAIL  seed script');
	process.exit(1);
}
const seeded = JSON.parse(readFileSync(new URL('./.seed-output.json', import.meta.url), 'utf8'));
const teacherUid = seeded.teacher.uid;
const oldCode = seeded.classCode;
const oldDoc = (await db.doc(`statements/${oldId}`).get()).data();
check('seed: an old lesson at the top (no home, no classLesson)', oldDoc.parentId === 'top' && !oldDoc.statementSettings.classLesson);
await sleep(TRIGGER_SETTLE_MS);
await db.doc(`statementsSubscribe/${teacherUid}--${oldId}`).set({ openedInClass: Date.now(), lastUpdate: Date.now() }, { merge: true });

const classId = `cls-${Date.now()}`;
const agoraClass = (id, name, status) => ({
	classId: id, schoolId: 's1', name, teacherIds: [teacherUid], teacherMap: { [teacherUid]: true },
	classCode: 'ABC123', memberCount: 0, status, createdAt: Date.now(), lastUpdate: Date.now(),
});
await db.doc(`agoraClasses/${classId}`).set(agoraClass(classId, 'ט׳2', 'active'));
await db.doc(`agoraClasses/${classId}-old`).set(agoraClass(`${classId}-old`, 'ז׳9-ישנה', 'archived'));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, locale: 'he-IL' });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') console.info(`console.error: ${m.text().slice(0, 240)}`);
});
const shots = process.env.E2E_SHOTS;
const shot = async (p, name) => {
	if (shots) await p.screenshot({ path: `${shots}/${name}.png` });
};

async function childrenOf(parentId) {
	const snap = await db.collection('statements').where('parentId', '==', parentId).get();

	return snap.docs.map((d) => d.data());
}

try {
	// ---- 1. home --------------------------------------------------------------------
	await signInTeacher(page, BASE, teacherUid);
	await page.goto(`${BASE}/t`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('[data-plan]', { timeout: TIMEOUT });
	check('home: the old lesson is listed as a plan of its own', (await page.locator(`[data-plan="${oldId}"]`).count()) === 1);
	check('home title is "מערכי השיעור שלי"', (await page.locator('.teacher-home__title').innerText()) === 'מערכי השיעור שלי');
	await shot(page, '1-home');

	await page.click('.teacher-home__new');
	await page.waitForSelector('#teacher-new-title', { timeout: TIMEOUT });
	const planTitle = `בריונות ${Date.now()}`;
	await page.fill('#teacher-new-title', planTitle);
	await page.click('.teacher-home__form button[type=submit]');
	await page.waitForURL(/\/t\/plans\/[^/]+\/games\/[^/]+$/, { timeout: TIMEOUT });
	const parts = new URL(page.url()).pathname.split('/');
	const planId = parts[3];
	const gameId = parts[5];
	const planDoc = (await db.doc(`classPlans/${planId}`).get()).data();
	const gameDoc = (await db.doc(`classPlans/${planId}/games/${gameId}`).get()).data();
	check('plan doc written (owner, title)', planDoc?.ownerUid === teacherUid && planDoc.title === planTitle);
	check('first game named after the plan, order 0, in the teacher language', gameDoc?.title === planTitle && gameDoc.order === 0 && gameDoc.snapshot.defaultLanguage === 'he');

	// ---- 2. the game screen -----------------------------------------------------------
	await page.waitForSelector('.plan__challenge', { timeout: TIMEOUT });
	check('game screen: back link is the plan title', (await page.locator('.plan__back').innerText()).includes(planTitle));
	const challenge = page.locator('.plan-card__text--challenge');
	await challenge.fill('Should we report bullying?');
	await challenge.blur();
	await page.waitForFunction(() => document.querySelector('.plan-card__text--challenge')?.disabled === false, null, { timeout: TIMEOUT });
	const focusedNew = 'li.plan-card--new .plan-card__text:focus';
	await page.click('.plan__tables .plan__add');
	await page.waitForSelector(focusedNew, { timeout: TIMEOUT });
	await page.keyboard.type('What would you do?');
	await page.keyboard.press('Enter');
	await page.waitForFunction(() => document.querySelector('li.plan-card--new .plan-card__text:focus')?.value === '', null, { timeout: TIMEOUT });
	await page.keyboard.type('Who is hurt?');
	await page.locator('.plan__title').click();
	await page.waitForFunction(() => [...document.querySelectorAll('li.plan-card .plan-card__text')].map((e) => e.value).join('|') === 'What would you do?|Who is hurt?', null, { timeout: TIMEOUT });
	const hint = page.locator('li.plan-card').nth(0).locator('.plan-card__hint');
	await hint.fill('think of the quiet ones');
	await hint.blur();
	await page.click('.plan__save');
	await page.waitForSelector('.plan__save--saved', { timeout: TIMEOUT });
	await shot(page, '2-game');
	let snap = (await db.doc(`classPlans/${planId}/games/${gameId}`).get()).data().snapshot;
	const byOrder = [...snap.questions].sort((a, b) => a.order - b.order);
	check('game doc: challenge + 2 questions, hint on the first', snap.questions.length === 3 &&
		snap.questions.filter((q) => q.classRole === 'challenge').length === 1 &&
		byOrder.filter((q) => q.classRole !== 'challenge')[0].hint === 'think of the quiet ones');
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => document.querySelectorAll('li.plan-card').length === 2, null, { timeout: TIMEOUT });
	check('reload: the game screen shows what was saved', (await page.locator('.plan-card__text--challenge').inputValue()) === 'Should we report bullying?');

	// ---- 3. a lesson with the class ----------------------------------------------------
	await page.click('[data-action="new-lesson"]');
	await page.waitForSelector('.class-form [data-class]', { timeout: TIMEOUT });
	const offered = await page.$$eval('.class-form [data-class]', (els) => els.map((e) => e.getAttribute('data-class')));
	check('class choice: the active class and "בלי כיתה", not the archived one', offered.length === 2 && offered.includes(classId) && offered.includes('__none'), offered.join(','));
	check('"יצירה" waits for a choice', await page.locator('.class-form [data-action="start-lesson"]').isDisabled());
	await page.check(`.class-form [data-class="${classId}"]`);
	await page.click('.class-form [data-action="start-lesson"]');
	await page.waitForURL((u) => /^\/t\/[^/]+$/.test(u.pathname) && !u.pathname.startsWith('/t/plans'), { timeout: TIMEOUT * 2 });
	const lessonA = new URL(page.url()).pathname.split('/')[2];
	const a = (await db.doc(`statements/${lessonA}`).get()).data();
	check('lesson A sits under the class home', a.parentId === `jcClass_${classId}` && a.topParentId === `jcClass_${classId}` && a.parents.join() === `jcClass_${classId}`);
	check('lesson A carries plan, game, class', a.statementSettings.classLesson?.planId === planId && a.statementSettings.classLesson.gameId === gameId && a.statementSettings.classLesson.classId === classId && a.statementSettings.classLesson.className === 'ט׳2');
	const aKids = (await childrenOf(lessonA)).filter((k) => k.statementType === 'question');
	check('lesson A has the game\'s 3 questions with parents [home, lesson]', aKids.length === 3 && aKids.every((k) => k.parents.join() === `jcClass_${classId},${lessonA}`));
	const home = (await db.doc(`statements/jcClass_${classId}`).get()).data();
	check('the class home exists, secret, classHome', home?.statementSettings?.classHome?.classId === classId && home.membership?.access === 'secret');
	const codeA = a.statementSettings.classCode;
	check('lesson A has a class code', /^\d{6}$/.test(codeA));
	await page.waitForSelector('.console__bar', { timeout: TIMEOUT });
	const back = page.locator('.console__bar .plan__back');
	await page.waitForFunction((title) => document.querySelector('.console__bar .plan__back')?.textContent?.includes(title), planTitle, { timeout: TIMEOUT });
	check('console: back link names the plan and goes to the plan screen', (await back.innerText()).includes(planTitle) && (await back.getAttribute('href')) === `/t/plans/${planId}`);
	await shot(page, '3-console');

	// ---- 4. a lesson with no class; the plan screen ------------------------------------
	await back.click();
	await page.waitForSelector(`[data-game="${gameId}"]`, { timeout: TIMEOUT });
	check('plan screen: lesson A listed under the game with the class name', (await page.locator(`[data-lesson="${lessonA}"]`).innerText()).includes('ט׳2'));
	await page.click(`[data-game="${gameId}"] [data-action="new-lesson"]`);
	await page.waitForSelector('.class-form [data-class]', { timeout: TIMEOUT });
	await page.check('.class-form [data-class="__none"]');
	await page.click('.class-form [data-action="start-lesson"]');
	await page.waitForURL((u) => /^\/t\/[^/]+$/.test(u.pathname) && !u.pathname.startsWith('/t/plans') && !u.pathname.endsWith(lessonA), { timeout: TIMEOUT * 2 });
	const lessonB = new URL(page.url()).pathname.split('/')[2];
	const b = (await db.doc(`statements/${lessonB}`).get()).data();
	check('lesson B (no class) sits under the teacher home', b.parentId === `jcTeacher_${teacherUid}` && b.statementSettings.classLesson?.classId === null);
	// stay in the app (no reload): the lesson's marker is re-written a few seconds after the server's own subscription lands
	await page.waitForSelector('.console__bar .plan__back', { timeout: TIMEOUT });
	await page.click('.console__bar .plan__back');
	await page.waitForSelector(`[data-lesson="${lessonB}"]`, { timeout: TIMEOUT });
	check('plan screen lists both lessons of the game', (await page.locator(`[data-game="${gameId}"] [data-lesson]`).count()) === 2);
	check('class filter appears at two classes', (await page.locator('.plan-overview__filter select').count()) === 1);
	await page.selectOption('.plan-overview__filter select', classId);
	await page.waitForFunction(() => document.querySelectorAll('[data-lesson]').length === 1, null, { timeout: TIMEOUT });
	check('filtering to the class leaves lesson A', (await page.locator('[data-lesson]').count()) === 1 && (await page.locator(`[data-lesson="${lessonA}"]`).count()) === 1);
	await page.selectOption('.plan-overview__filter select', '');
	await shot(page, '4-plan');
	await page.goto(`${BASE}/t`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('[data-open-now]', { timeout: TIMEOUT });
	check('home: "פתוחים עכשיו" lists the live lessons', (await page.locator(`[data-open-now="${lessonA}"]`).count()) === 1 && (await page.locator(`[data-open-now="${lessonB}"]`).count()) === 1);
	const counts = await page.locator(`[data-plan="${planId}"] .teacher-home__counts`).innerText();
	check('home: plan row counts games and lessons', counts.includes('1') && counts.includes('2'), counts);

	// ---- 5. the old lesson ---------------------------------------------------------------
	await page.goto(`${BASE}/t/plans/${oldId}`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector(`[data-game="${oldId}"]`, { timeout: TIMEOUT });
	check('old lesson: a plan screen with its own section, no "+ lesson with a class"', (await page.locator(`[data-game="${oldId}"] [data-action="new-lesson"]`).count()) === 0 && (await page.locator('[data-action="rename"]').count()) === 0);
	await page.click('[data-action="new-game"]');
	await page.waitForSelector('#pick-lead', { timeout: TIMEOUT });
	check('old lesson: "+ משחק חדש" goes straight to "questions from another game" (no blank game)', (await page.locator('[data-choice="new"]').count()) === 0);
	await page.waitForSelector('[data-action="pick"]', { timeout: TIMEOUT });
	await page.click(`[data-action="pick"][data-id="${oldId}"]`);
	await page.waitForSelector('#teacher-copy-title', { timeout: TIMEOUT });
	await page.click('.teacher-home__form button[type=submit]');
	await page.waitForURL(/\/t\/plans\/[^/]+\/games\/[^/]+$/, { timeout: TIMEOUT * 2 });
	check('old lesson: its questions became a game of its plan (classSnapshotGame)',
		(await db.doc(`classPlans/${oldId}`).get()).exists && new URL(page.url()).pathname.includes(`/plans/${oldId}/games/`));
	await page.goto(`${BASE}/t/${oldId}`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.console__bar', { timeout: TIMEOUT });
	check('old lesson: the console opens and goes back to its own plan', (await page.locator('.console__bar .plan__back').getAttribute('href')) === `/t/plans/${oldId}`);

	// ---- 6. a student on a phone ----------------------------------------------------------
	const phone = await browser.newContext({ viewport: { width: 360, height: 640 }, locale: 'he-IL' });
	const student = await phone.newPage();
	student.on('pageerror', (e) => pageErrors.push(`student: ${e.message}`));
	async function readOptions(lesson, expectedIds) {
		return student.evaluate(
			async ({ lessonId, ids }) => {
				const { listenClassOptions } = await import('/src/lib/classroom/c3Data.ts');

				return new Promise((resolve) => {
					const timer = setTimeout(() => resolve('timeout'), 8000);
					const stop = listenClassOptions(lessonId, (options) => {
						const seen = options.map((o) => o.statementId);
						if (ids.every((id) => seen.includes(id))) {
							clearTimeout(timer);
							stop();
							resolve(seen.length);
						}
					});
				});
			},
			{ lessonId: lesson, ids: expectedIds },
		);
	}
	async function readReplies(lesson, uid, expectedId) {
		return student.evaluate(
			async ({ lessonId, studentUid, id }) => {
				const { listenRepliesToMe } = await import('/src/lib/classroom/replies.ts');

				return new Promise((resolve) => {
					const timer = setTimeout(() => resolve('timeout'), 8000);
					const stop = listenRepliesToMe(lessonId, studentUid, (list) => {
						if (list.some((r) => r.statementId === id)) {
							clearTimeout(timer);
							stop();
							resolve('found');
						}
					});
				});
			},
			{ lessonId: lesson, studentUid: uid, id: expectedId },
		);
	}

	await student.goto(`${BASE}/c/${codeA}`, { waitUntil: 'domcontentloaded' });
	await student.waitForURL(new RegExp(`/m/${lessonA}`), { timeout: TIMEOUT });
	await student.waitForFunction(() => document.body.innerText.trim().length > 20, null, { timeout: TIMEOUT });
	check('student: the code of a home-based lesson opens the lesson', (await student.locator('.door__title').count()) === 0);
	await shot(student, '6-student');
	const studentUid = await student.evaluate(async () => (await import('/src/lib/user.ts')).getUserState().user.uid);

	const challengeA = aKids.find((k) => k.statementSettings.classRole === 'challenge').statementId;
	const optionId = `opt-${Date.now()}`;
	const now = Date.now();
	await db.doc(`statements/${optionId}`).set({
		statementId: optionId, statement: 'Tell a teacher', statementType: 'option', parentId: challengeA,
		topParentId: `jcClass_${classId}`, parents: [`jcClass_${classId}`, lessonA, challengeA],
		creatorId: studentUid, createdAt: now, lastUpdate: now, consensus: 0,
	});
	check('student: options under a home-based lesson are found by the parents query', (await readOptions(lessonA, [optionId])) !== 'timeout');
	const replyId = `reply-${Date.now()}`;
	await db.doc(`statements/${replyId}`).set({
		statementId: replyId, statement: 'Good idea', statementType: 'statement', parentId: optionId,
		topParentId: `jcClass_${classId}`, parents: [`jcClass_${classId}`, lessonA, challengeA, optionId],
		creatorId: 'someone', createdAt: now, lastUpdate: now,
		classReply: { proposalCreatorId: studentUid },
	});
	check('student: replies to my proposal under a home-based lesson are found', (await readReplies(lessonA, studentUid, replyId)) === 'found');

	const oldOptions = seeded.proposalIds ?? [];
	check('seed has proposals under the old lesson', oldOptions.length > 0);
	check('student: options under an OLD top-level lesson are found by the same query', (await readOptions(oldId, oldOptions.slice(0, 2))) !== 'timeout');
	const oldReply = `oldreply-${Date.now()}`;
	await db.doc(`statements/${oldReply}`).set({
		statementId: oldReply, statement: 'Agree', statementType: 'statement', parentId: oldOptions[0],
		topParentId: oldId, parents: [oldId, seeded.challengeId, oldOptions[0]],
		creatorId: 'someone', createdAt: now, lastUpdate: now, classReply: { proposalCreatorId: studentUid },
	});
	check('student: replies under an OLD top-level lesson are found', (await readReplies(oldId, studentUid, oldReply)) === 'found');

	// the old lesson's code still opens it
	await student.goto(`${BASE}/c/${oldCode}`, { waitUntil: 'domcontentloaded' });
	await student.waitForURL(new RegExp(`/m/${oldId}`), { timeout: TIMEOUT });
	check('student: the old lesson\'s code still opens it', true);

	// ---- 7. homes and strangers --------------------------------------------------------------
	await student.goto(`${BASE}/m/jcClass_${classId}`, { waitUntil: 'domcontentloaded' });
	await student.waitForSelector('.door__title', { timeout: TIMEOUT });
	check('student: a class home is "not a lesson"', (await student.locator('.door__title').innerText()).length > 0);
	const homeRead = await student.evaluate(async (id) => {
		const { db, doc, getDoc } = await import('/src/lib/firebase.ts');
		try {
			return (await getDoc(doc(db, 'statements', id))).exists() ? 'readable' : 'missing';
		} catch (e) {
			return e.code;
		}
	}, `jcClass_${classId}`);
	check('student: the rules refuse a read of the home', homeRead === 'permission-denied', homeRead);

	const other = await browser.newContext({ viewport: { width: 1100, height: 900 }, locale: 'he-IL' });
	const stranger = await other.newPage();
	await signInTeacher(stranger, BASE, `stranger-${Date.now()}`);
	await stranger.goto(`${BASE}/t/plans/${planId}`, { waitUntil: 'domcontentloaded' });
	await stranger.waitForSelector('.door__title', { timeout: TIMEOUT });
	check('another teacher gets "not your lesson" on the plan screen', (await stranger.locator('.plan-overview__title').count()) === 0);
	await stranger.goto(`${BASE}/t/plans/${planId}/games/${gameId}`, { waitUntil: 'domcontentloaded' });
	await stranger.waitForSelector('.door__title', { timeout: TIMEOUT });
	check('another teacher gets "not your lesson" on the game screen', (await stranger.locator('.plan__challenge').count()) === 0);
} catch (err) {
	console.error(err);
	await shot(page, 'failed').catch(() => undefined);
	check('script ran to the end', false, String(err.message ?? err));
} finally {
	check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
	await browser.close();
	console.info(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
	process.exit(failures === 0 ? 0 : 1);
}

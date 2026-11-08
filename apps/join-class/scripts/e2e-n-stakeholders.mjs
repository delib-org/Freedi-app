// "How many students are in the class?" end to end (docs/ia/stakeholder-count-n.md), alt emulators.
//   JOIN_CLASS_URL=http://localhost:3047 E2E_AUTH_PORT=9109 E2E_FIRESTORE_PORT=8091 E2E_FUNCTIONS_PORT=5011 \
//     E2E_SHOTS=<dir> node scripts/e2e-n-stakeholders.mjs
import { chromium } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { BASE_URL as BASE, PROJECT_ID } from './e2e-env.mjs';
import { signInTeacher } from './e2e-auth.mjs';

const TIMEOUT = 25000;
const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));
const shots = process.env.E2E_SHOTS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(label, ok, detail = '') {
	console.info(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
	if (!ok) failures += 1;
}
const shot = (p, name) => p.screenshot({ path: `${shots}/${name}.png` });

const teacherUid = `n-teacher-${Date.now()}`;
const classId = `cls-${Date.now()}`;
await db.doc('agoraSchools/s1').set({
	schoolId: 's1', name: 'בית ספר', status: 'active', teacherMap: { [teacherUid]: true }, teacherIds: [teacherUid],
	createdAt: Date.now(), lastUpdate: Date.now(),
});
await db.doc(`agoraClasses/${classId}`).set({
	classId, schoolId: 's1', name: 'ט׳2', teacherIds: [teacherUid], teacherMap: { [teacherUid]: true },
	classCode: 'ABC123', memberCount: 0, status: 'active', createdAt: Date.now(), lastUpdate: Date.now(),
});

async function kids(parentId) {
	const snap = await db.collection('statements').where('parentId', '==', parentId).get();

	return snap.docs.map((d) => d.data());
}
const nOf = (s) => s?.evaluationSettings?.targetPopulation;
const uiOf = (s) => s?.evaluationSettings?.evaluationUI;

const browser = await chromium.launch();
const viewport = { width: 360, height: 800 };

async function openPlan(context, planUrl) {
	const page = await context.newPage();
	page.on('pageerror', (e) => console.info(`pageerror: ${e.message.slice(0, 200)}`));
	await signInTeacher(page, BASE, teacherUid);
	await page.goto(planUrl, { waitUntil: 'domcontentloaded' });

	return page;
}

try {
	// ---- Hebrew: build a plan with a challenge and two questions --------------------
	const heCtx = await browser.newContext({ viewport, locale: 'he-IL' });
	const page = await heCtx.newPage();
	page.on('pageerror', (e) => console.info(`pageerror: ${e.message.slice(0, 200)}`));
	await signInTeacher(page, BASE, teacherUid);
	await page.goto(`${BASE}/t`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.teacher-home__new, #teacher-new-title', { timeout: TIMEOUT });
	if (await page.locator('.teacher-home__new').count()) await page.click('.teacher-home__new');
	await page.waitForSelector('#teacher-new-title', { timeout: TIMEOUT });
	await page.fill('#teacher-new-title', `בריונות ${Date.now()}`);
	await page.click('.teacher-home__form button[type=submit]');
	await page.waitForURL(/\/t\/plans\/[^/]+\/games\/[^/]+$/, { timeout: TIMEOUT });
	const parts = new URL(page.url()).pathname.split('/');
	const planId = parts[3];
	await page.waitForSelector('.plan__challenge', { timeout: TIMEOUT });
	const challenge = page.locator('.plan-card__text--challenge');
	await challenge.fill('Should we report bullying?');
	await challenge.blur();
	await page.waitForFunction(() => document.querySelector('.plan-card__text--challenge')?.disabled === false, null, { timeout: TIMEOUT });
	await page.click('.plan__tables .plan__add');
	await page.waitForSelector('li.plan-card--new .plan-card__text:focus', { timeout: TIMEOUT });
	await page.keyboard.type('What would you do?');
	await page.keyboard.press('Enter');
	await page.waitForFunction(() => document.querySelector('li.plan-card--new .plan-card__text:focus')?.value === '', null, { timeout: TIMEOUT });
	await page.keyboard.type('Who is hurt?');
	await page.locator('.plan__title').click();
	await page.waitForFunction(() => document.querySelectorAll('li.plan-card .plan-card__text').length === 2, null, { timeout: TIMEOUT });
	await page.click('.plan__save');
	await page.waitForSelector('.plan__save--saved', { timeout: TIMEOUT });

	// ---- lesson A: the teacher types 28 ----------------------------------------------
	await page.click('[data-action="new-lesson"]');
	await page.waitForSelector('.class-form [data-class]', { timeout: TIMEOUT });
	await page.check(`.class-form [data-class="${classId}"]`);
	const field = page.locator('.class-form [data-field="class-size"]');
	check('ClassForm shows the field with 40 as its placeholder', (await field.getAttribute('placeholder')) === '40' && (await field.inputValue()) === '');
	await field.fill('28');
	await shot(page, 'he-classform');
	await page.click('.class-form [data-action="start-lesson"]');
	await page.waitForURL((u) => /^\/t\/[^/]+$/.test(u.pathname) && !u.pathname.startsWith('/t/plans'), { timeout: TIMEOUT * 2 });
	const lessonA = new URL(page.url()).pathname.split('/')[2];
	await sleep(2500);
	const a = (await db.doc(`statements/${lessonA}`).get()).data();
	const aQs = (await kids(lessonA)).filter((k) => k.statementType === 'question');
	check('lesson A holds N = 28 (with evaluationUI so the schema parses)', nOf(a) === 28 && uiOf(a) === 'suggestions', JSON.stringify(a.evaluationSettings));
	check('every question of lesson A carries N = 28', aQs.length === 3 && aQs.every((q) => nOf(q) === 28 && uiOf(q) === 'suggestions'), `${aQs.length} questions`);

	// ---- lesson B: empty means 40 -----------------------------------------------------
	await page.goto(`${BASE}/t/plans/${planId}`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('[data-action="new-lesson"]', { timeout: TIMEOUT });
	await page.click('[data-action="new-lesson"]');
	await page.waitForSelector('.class-form [data-class]', { timeout: TIMEOUT });
	await page.check(`.class-form [data-class="${classId}"]`);
	await page.click('.class-form [data-action="start-lesson"]');
	await page.waitForURL((u) => /^\/t\/[^/]+$/.test(u.pathname) && !u.pathname.startsWith('/t/plans') && !u.pathname.endsWith(lessonA), { timeout: TIMEOUT * 2 });
	const lessonB = new URL(page.url()).pathname.split('/')[2];
	await sleep(2500);
	const b = (await db.doc(`statements/${lessonB}`).get()).data();
	const bQs = (await kids(lessonB)).filter((k) => k.statementType === 'question');
	check('lesson B (field left empty) holds N = 40 on the lesson and its questions', nOf(b) === 40 && bQs.length === 3 && bQs.every((q) => nOf(q) === 40));

	// ---- ratings on lesson A's first question --------------------------------------------
	const q0 = aQs.find((q) => q.statementSettings?.classRole === 'guiding') ?? aQs[0];
	const optionId = `opt-${Date.now()}`;
	const now = Date.now();
	const option = {
		statementId: optionId, statement: 'a proposal', statementType: 'option', parentId: q0.statementId,
		topParentId: q0.topParentId, parents: [...q0.parents, q0.statementId], creatorId: 'student-0',
		creator: { uid: 'student-0', displayName: 'S0', isAnonymous: true }, createdAt: now, lastUpdate: now,
		consensus: 0, hasChildren: false, randomSeed: 0.5, statementSettings: {},
	};
	await db.doc(`statements/${optionId}`).set(option);
	const raters = 12;
	for (let i = 1; i <= raters; i += 1) {
		const uid = `rater-${i}`;
		await db.doc(`evaluations/${uid}--${optionId}`).set({
			parentId: q0.statementId, evaluationId: `${uid}--${optionId}`, statementId: optionId,
			evaluatorId: uid, updatedAt: Date.now(), evaluation: 0.7,
			evaluator: { uid, displayName: uid, isAnonymous: true },
		});
	}
	const scoreOf = async () => {
		const o = (await db.doc(`statements/${optionId}`).get()).data();

		return { n: o.evaluation?.numberOfEvaluators, idx: o.evaluation?.agreementIndex, conf: o.evaluation?.confidenceIndex, sc: o.consensus };
	};
	let before = await scoreOf();
	for (let i = 0; i < 30 && before.n !== raters; i += 1) { await sleep(1000); before = await scoreOf(); }
	await sleep(3000);
	before = await scoreOf();
	check('ratings landed (trigger ran) and the option has a score', before.n === raters && typeof before.sc === 'number', JSON.stringify(before));

	// ---- console settings: change N on a lesson with ratings --------------------------------
	await page.goto(`${BASE}/t/${lessonA}`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.console__settings-toggle', { timeout: TIMEOUT });
	await page.click('.console__settings-toggle');
	await page.waitForSelector('[data-testid="class-size-input"]', { timeout: TIMEOUT });
	check('settings row shows the lesson number (28)', (await page.inputValue('[data-testid="class-size-input"]')) === '28');
	await shot(page, 'he-console-settings');
	await page.fill('[data-testid="class-size-input"]', '100');
	await page.click('[data-action="save-class-size"]');
	await page.waitForSelector('.console__settings-help[role="status"], .console__failure', { timeout: TIMEOUT });
	const failureText = await page.locator('.console__failure').innerText().catch(() => '');
	check('save shows "saved" (no failure line)', !failureText, failureText);
	await shot(page, 'he-console-settings-saved');
	await sleep(4000);
	const a2 = (await db.doc(`statements/${lessonA}`).get()).data();
	const aQs2 = (await kids(lessonA)).filter((k) => k.statementType === 'question');
	check('after saving 100: lesson and all questions hold 100', nOf(a2) === 100 && aQs2.every((q) => nOf(q) === 100));
	const after = await scoreOf();
	check('the option score changed after the automatic recalculation', after.sc !== before.sc || after.conf !== before.conf || after.idx !== before.idx, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

	// emptying the row means 40
	await page.fill('[data-testid="class-size-input"]', '');
	await page.click('[data-action="save-class-size"]');
	await sleep(4000);
	const a3 = (await db.doc(`statements/${lessonA}`).get()).data();
	check('emptying the row saves 40', nOf(a3) === 40, String(nOf(a3)));

	// ---- English screenshots -----------------------------------------------------------------
	const enCtx = await browser.newContext({ viewport, locale: 'en-US' });
	const en = await openPlan(enCtx, `${BASE}/t/plans/${planId}?lang=en`);
	await en.waitForSelector('[data-action="new-lesson"]', { timeout: TIMEOUT });
	await en.click('[data-action="new-lesson"]');
	await en.waitForSelector('.class-form [data-class]', { timeout: TIMEOUT });
	await en.check(`.class-form [data-class="${classId}"]`);
	await shot(en, 'en-classform');
	await en.goto(`${BASE}/t/${lessonA}?lang=en`, { waitUntil: 'domcontentloaded' });
	await en.waitForSelector('.console__settings-toggle', { timeout: TIMEOUT });
	await en.click('.console__settings-toggle');
	await en.waitForSelector('[data-testid="class-size-input"]', { timeout: TIMEOUT });
	await shot(en, 'en-console-settings');
	// a refused recalculation reads plainly: someone else's lesson cannot be rescored by this teacher
} catch (error) {
	console.info(`FAIL  script error: ${error.message}`);
	failures += 1;
}
await browser.close();
console.info(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

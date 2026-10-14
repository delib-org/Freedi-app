/* The teacher's room, in a browser: home, menu, my scenarios, the library
 * entry, a class's three sections, a student, past lessons — on a phone and a
 * laptop, for an approved teacher with a school and for one with neither.
 *
 * Builds its own fixtures through the real callables (a school, two classes,
 * two finished lessons folded into aggregates, a live lesson, a shelf of
 * scenarios), then walks the screens and asserts what is on them. Run it
 * against the SOLO suite and a vite wired to it:
 *
 *   AGORA_VITE_HOST=http://localhost:3049 bash ../../scripts/solo.sh env \
 *     AGORA_VITE_HOST=http://localhost:3049 npx tsx scripts/teacher-home-shots.mjs
 *
 * TH_OUT sets where the th-*.png files land (default output/teacher-home).
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, mkPage, step } from './lib/e2e.mjs';
import { callable, db, fastlane, signInTeacher } from './lib/fastlane.ts';

await preflight({ needs: ['firestore', 'auth', 'functions', 'vite'] });

const OUT = process.env.TH_OUT ?? 'output/teacher-home';
mkdirSync(OUT, { recursive: true });
const runId = `th-${Date.now().toString(36)}`;
const emailOf = (sub) => `${runId}-${sub}@example.com`;
const day = 24 * 60 * 60 * 1000;
const now = Date.now();

const mk = async (sub, name) => {
	const who = await signInTeacher(`${runId}-${sub}`);
	await db.collection('usersV2').doc(who.uid).set({ email: emailOf(sub), displayName: name }, { merge: true });

	return { ...who, sub, name };
};

step('A. a school, an approved teacher, one with no school, an admin');
const admin = await mk('admin', 'Ada Admin');
await db.collection('usersV2').doc(admin.uid).set({ systemAdmin: true }, { merge: true });
const teacher = await mk('teacher', 'דנה כהן');
const outsider = await mk('outsider', 'Olly Outsider');
const { schoolId } = await callable('agoraAdminManageSchool', { action: 'create', name: 'תיכון הדגמה' }, admin.idToken);
await callable('agoraAdminManageSchool', { action: 'assignTeacher', schoolId, teacherEmail: emailOf('teacher') }, admin.idToken);
await callable('agoraLibraryAccess', {}, teacher.idToken);

const classA = await callable('agoraAdminOpenClass', { action: 'create', schoolId, name: '2', gradeLevel: '8', teacherEmail: emailOf('teacher') }, admin.idToken);
const classB = await callable('agoraAdminOpenClass', { action: 'create', schoolId, name: '1', gradeLevel: '9', teacherEmail: emailOf('teacher') }, admin.idToken);

step('B. scenarios: ready, draft, public, a copy with a newer original');
const demo = (await db.collection('agoraTopicPackages').doc('demo-french-revolution').get()).data();
if (!demo) fail('seed the demo package first (npm run seed:solo)');
const put = async (id, patch) =>
	db.collection('agoraTopicPackages').doc(id).set({ ...demo, topicPackageId: id, status: 'ready', language: 'he', createdAt: now, lastUpdate: now, ...patch });
const original = `${runId}-original`;
await put(original, {
	creatorId: 'seed-author',
	title: 'בריונות בכיתה — המקור',
	visibility: 'public',
	lastUpdate: now,
	library: { summary: 'מצבים של אלימות בין תלמידים', subjectIds: [], lessonTypeIds: [], publishedAt: now, authorId: 'seed-author', authorName: 'מירה', hidden: false },
	stats: { ratingCount: 0, ratingSum: 0, ratingBayes: 3.8, reviewCount: 0, copyCount: 1 },
});
for (const [n, title] of ['חופש הביטוי ברשת', 'מי שותק בכיתה', 'ועדת כיתה: איך מחליטים יחד'].entries()) {
	await put(`${runId}-library-${n}`, {
		creatorId: 'seed-author',
		title,
		visibility: 'public',
		lastUpdate: now - n * day,
		library: { summary: 'דיון בכיתה בין צדדים שונים', subjectIds: [], lessonTypeIds: [], publishedAt: now - n * day, authorId: 'seed-author', authorName: 'יוסי', hidden: false },
		stats: { ratingCount: 3, ratingSum: 14, ratingBayes: 4.2, reviewCount: 3, copyCount: 4 },
	});
}
const shelf = [
	['המהפכה הצרפתית — 1789', { visibility: 'public', lastUpdate: now - 1 * day, library: { summary: 'x', subjectIds: [], lessonTypeIds: [], publishedAt: now, authorId: teacher.uid, authorName: 'דנה', hidden: false } }],
	['בריונות בכיתה', { sourceScenarioId: original, sourceTitle: 'בריונות בכיתה — המקור', sourceAuthorName: 'מירה', lastUpdate: now - 20 * day }],
	['חופש הביטוי ברשת', { lastUpdate: now - 7 * day }],
	['זכויות הילד', { status: 'draft', lastUpdate: now - 2 * day }],
	['שוויון בין המינים', { status: 'draft', lastUpdate: now - 9 * day }],
	['גבולות החופש', { lastUpdate: now - 11 * day }],
	['האם לבטל ציונים?', { lastUpdate: now - 15 * day }],
	['שעות שינה בבית הספר', { lastUpdate: now - 19 * day }],
];
for (const [n, [title, patch]] of shelf.entries()) {
	await put(`${runId}-mine-${n}`, { creatorId: teacher.uid, title, ...patch });
}

step('C. two finished lessons for the first class, one live lesson for the second');
for (const [n, students] of [[1, 5], [2, 4]]) {
	const game = await fastlane({
		stage: 'results',
		students,
		proposals: 3,
		runId: `${runId}-g${n}`,
		teacher,
		classGame: { classId: classA.classId, classCode: classA.classCode },
		quiet: true,
	});
	console.log(`   ✓ finished lesson ${game.sessionId}`);
}
const live = await fastlane({
	stage: 'deliberation',
	students: 2,
	proposals: 1,
	runId: `${runId}-live`,
	teacher,
	classGame: { classId: classB.classId, classCode: classB.classCode },
	quiet: true,
});
console.log(`   ✓ live lesson ${live.sessionId}`);
// The trigger folds a finished lesson into the class aggregate a moment later
const deadline = Date.now() + 40_000;
for (;;) {
	const agg = await db.collection('agoraClassAggregates').doc(classA.classId).get();
	if (agg.exists && (agg.data()?.gamesPlayed ?? 0) >= 2) break;
	if (Date.now() > deadline) fail('the class aggregate never reached 2 lessons');
	await new Promise((resolve) => setTimeout(resolve, 800));
}

const claims = (who) => ({ sub: `${runId}-${who.sub}`, email: emailOf(who.sub), name: who.name });
const signedIn = () => {
	const state = window.__agoraDebug?.().user;

	return Boolean(state && !state.loading && state.user && !state.user.isAnonymous);
};
async function signIn(page, who) {
	await page.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	for (let attempt = 1; attempt <= 3; attempt++) {
		await page.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 20_000 });
		await page.waitForFunction(
			() => {
				const state = window.__agoraDebug?.().user;

				return Boolean(state && state.loading === false && state.user);
			},
			{ timeout: 20_000 },
		);
		await page.evaluate((c) => window.__agoraDevSignIn(c), claims(who));
		await page.waitForFunction(signedIn, { timeout: 20_000 });
		await page.reload({ waitUntil: 'domcontentloaded' });
		if (await page.waitForFunction(signedIn, { timeout: 12_000 }).then(() => true, () => false)) return;
	}
	fail(`could not sign ${who.sub} in`);
}

const shot = (page, name) => page.screenshot({ path: `${OUT}/th-${name}.png`, fullPage: true });
const go = async (page, route, selector) => {
	await page.goto(`${VITE_HOST}/#!${route}`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector(selector, { timeout: 30_000 });
	await page.waitForTimeout(700);
};
/** No sideways scroll at all: the page is never wider than the phone */
const fits = async (page, label) => {
	const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	eq(`${label}: no horizontal scroll`, wide <= 0, true);
};

const browser = await chromium.launch();
try {
	for (const [name, size] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
		step(`D. the approved teacher on a ${name}`);
		const page = await mkPage(browser, name, { ...size, lang: 'he' });
		await signIn(page, teacher);

		await go(page, '/teach', '.teach-page');
		await page.waitForSelector('.class-card', { timeout: 30_000 });
		await page.waitForSelector('.lib-entry:not(.lib-entry--locked)', { timeout: 30_000 });
		eq('the live banner leads', await page.locator('.teach-page > :first-child.teach-live').count(), 1);
		eq('five scenarios and the own-question row', await page.locator('.scenario-list > li').count(), 6);
		eq('the library entry is open', await page.locator('.lib-entry--locked').count(), 0);
		eq('no archive, supervision or activity on the home', await page.locator('text=ארכיון').count(), 0);
		eq('two class cards', await page.locator('.class-card').count(), 2);
		await fits(page, `home ${name}`);
		await shot(page, `home-${name}`);

		await page.click('.teacher-nav__switch');
		await page.waitForSelector('.teacher-nav__panel');
		await shot(page, `menu-${name}`);
		await page.keyboard.press('Escape');
		await page.click('.teacher-nav__scrim').catch(() => undefined);

		await go(page, '/teach/scenarios', '.scenario-list');
		eq('all eight scenarios', await page.locator('.scenario-list > li').count(), 8);
		await fits(page, `scenarios ${name}`);
		await shot(page, `scenarios-${name}`);

		await go(page, '/teach', '.lib-entry:not(.lib-entry--locked)');
		await page.click('.lib-entry');
		await page.waitForSelector('.scn-layout', { timeout: 30_000 });
		eq('the library entry leads to the library', page.url().includes('/teach/library'), true);
		await fits(page, `library ${name}`);
		await shot(page, `library-${name}`);

		await go(page, `/teach/class/${classA.classId}`, '.kpis');
		await fits(page, `class achievements ${name}`);
		await shot(page, `class-achievements-${name}`);
		await page.click('#class-tab-students');
		await page.waitForSelector('.teach-row');
		await shot(page, `class-students-${name}`);
		await page.click('#class-tab-lessons');
		await page.waitForSelector('.month-label');
		await shot(page, `class-lessons-${name}`);

		await page.click('#class-tab-students');
		await page.waitForSelector('.teach-row');
		await page.locator('.teach-row').first().click();
		await page.waitForSelector('.student-hero');
		await fits(page, `student ${name}`);
		await shot(page, `student-${name}`);

		await go(page, '/teach/lessons', '.month-label');
		await fits(page, `lessons ${name}`);
		await shot(page, `lessons-${name}`);
		await page.context().close();
	}

	step('E. the old addresses still arrive');
	{
		const page = await mkPage(browser, 'redirects', { width: 390, height: 844, lang: 'he' });
		await signIn(page, teacher);
		await page.goto(`${VITE_HOST}/#!/teach/library/mine`, { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('.scenario-list', { timeout: 30_000 });
		eq('/teach/library/mine -> my scenarios', page.url().includes('/teach/scenarios'), true);
		await page.goto(`${VITE_HOST}/#!/teach/new`, { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('#scenario-statement', { timeout: 30_000 });
		eq('/teach/new -> new scenario', page.url().includes('/teach/scenarios/new'), true);
		await page.goto(`${VITE_HOST}/#!/teach/topic/${runId}-mine-0`, { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('.text-input', { timeout: 30_000 });
		eq('/teach/topic/:id -> the editor', page.url().includes(`/teach/scenarios/${runId}-mine-0`), true);
		await page.context().close();
	}

	step('F. a teacher with no school and no library sees the locked line');
	{
		const page = await mkPage(browser, 'outsider', { width: 390, height: 844, lang: 'he' });
		await signIn(page, outsider);
		await go(page, '/teach', '.teach-page');
		await page.waitForSelector('.lib-entry--locked', { timeout: 30_000 });
		eq('no open library entry', await page.locator('.lib-entry:not(.lib-entry--locked)').count(), 0);
		eq('the line explains how to get in', (await page.locator('.lib-entry--locked').innerText()).includes('מנהל המערכת'), true);
		await shot(page, 'home-locked-phone');
		await go(page, '/teach/scenarios', '.teach-section');
		eq('no switch to the library', await page.locator('.segment').count(), 0);
		await shot(page, 'scenarios-locked-phone');
		await page.context().close();
	}
	console.log('\nALL GOOD');
} finally {
	await browser.close();
}

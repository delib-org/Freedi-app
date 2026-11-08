/* The teacher's navigation bar, for eyes: the bar on the dashboard, on a live
 * console and on a class, and the menu open on each — two journeys running at
 * once, in two classes, which is exactly the case the console had no door for.
 *
 * Run: npx tsx scripts/nav-shots.mjs  →  nav-shots/*.png
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { mkPage, shotter, step } from './lib/e2e.mjs';
import { callable, db, fastlane, signInTeacher, teacherUrl } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage } = require('@freedi/shared-types');

await preflight();
const DIR = 'nav-shots';
mkdirSync(DIR, { recursive: true });
const shot = shotter(DIR);
const runId = `nav-${Date.now().toString(36)}`;

step('a school, a teacher in it, and two classes');
const admin = await signInTeacher(`${runId}-sysadmin`);
await db.collection('usersV2').doc(admin.uid).set({ systemAdmin: true }, { merge: true });
const teacher = await signInTeacher(`${runId}-teacher`);
const teacherEmail = `${runId}-teacher@example.com`;
await db
	.collection('usersV2')
	.doc(teacher.uid)
	.set({ email: teacherEmail, displayName: 'דנה המורה' }, { merge: true });
const { schoolId } = await callable(
	'agoraAdminManageSchool',
	{ action: 'create', name: 'תיכון הדגמה' },
	admin.idToken,
);
await callable(
	'agoraAdminManageSchool',
	{ action: 'assignTeacher', schoolId, teacherEmail },
	admin.idToken,
);
const classA = await callable(
	'agoraTeacherClass',
	{ action: 'create', name: '2', gradeLevel: '7' },
	teacher.idToken,
);
const classB = await callable(
	'agoraTeacherClass',
	{ action: 'create', name: '4', gradeLevel: '8' },
	teacher.idToken,
);

step('two journeys running at once, one per class');
const lessonA = await fastlane({
	stage: AgoraStage.deliberation,
	students: 3,
	proposals: 3,
	quiet: true,
	runId: `${runId}-a`,
	teacher,
	classGame: { classId: classA.classId, classCode: classA.classCode },
});
const lessonB = await fastlane({
	stage: AgoraStage.positioning,
	students: 2,
	proposals: 0,
	quiet: true,
	runId: `${runId}-b`,
	teacher,
	classGame: { classId: classB.classId, classCode: classB.classCode },
});

const browser = await chromium.launch();
try {
	const openMenu = async (page) => {
		await page.click('.teacher-nav__switch');
		await page.waitForSelector('.teacher-nav__panel', { timeout: 10_000 });
		await page.waitForTimeout(700);
	};

	step('the teacher signs in');
	const page = await mkPage(browser, 'teacher', { width: 1280, height: 900 });
	await page.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
		timeout: 15_000,
	});
	await page.evaluate(
		(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'דנה המורה' }),
		`${runId}-teacher`,
	);
	// The dashboard may have already filled itself as the anonymous account it
	// booted with; a reload asks it again as the teacher.
	await page.waitForTimeout(1500);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.dashboard__class-grid', { timeout: 30_000 });
	await shot(page, '1-dashboard-bar');
	await openMenu(page);
	await shot(page, '2-dashboard-menu');

	step('the live console — the screen that had no way out');
	await page.goto(teacherUrl(lessonA.sessionId), { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.teacher-nav__title', { timeout: 30_000 });
	await page.waitForTimeout(1200);
	await shot(page, '3-console-bar');
	await openMenu(page);
	await shot(page, '4-console-menu-two-journeys');

	step('across to the other journey, from inside this one');
	const before = await page.textContent('.teacher-nav__subtitle');
	await page.locator('.teacher-nav__panel button:not([aria-current])').first().click();
	await page.waitForFunction(
		(was) => document.querySelector('.teacher-nav__subtitle')?.textContent !== was,
		before,
		{ timeout: 20_000 },
	);
	await page.waitForTimeout(1500);
	await shot(page, '5-walked-across');
	console.log(`   the bar moved: ${before} → ${await page.textContent('.teacher-nav__subtitle')}`);

	step('the class, reached by the bar');
	await page.goto(`${VITE_HOST}/#!/teach/class/${classA.classId}`, {
		waitUntil: 'domcontentloaded',
	});
	await page.waitForSelector('.teacher-nav__title', { timeout: 30_000 });
	await page.waitForTimeout(800);
	await shot(page, '6-class-bar');

	step('the same bar on a phone');
	const phone = await mkPage(browser, 'phone', { width: 390, height: 844 });
	await phone.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await phone.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
		timeout: 15_000,
	});
	await phone.evaluate(
		(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'דנה המורה' }),
		`${runId}-teacher`,
	);
	await phone.goto(teacherUrl(lessonA.sessionId), { waitUntil: 'domcontentloaded' });
	await phone.waitForSelector('.teacher-nav__title', { timeout: 30_000 });
	await phone.waitForTimeout(1200);
	await shot(phone, '7-console-phone');
	await openMenu(phone);
	await shot(phone, '8-console-phone-menu');
} finally {
	await browser.close();
}

console.log(`\n   ✓ ${DIR}/`);

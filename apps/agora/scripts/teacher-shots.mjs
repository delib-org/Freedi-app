/* Every teacher screen, for eyes: the dashboard, the start screen, the live
 * console at each stage (and each of its tabs, and behind its cog), the class
 * page, the report, and the projector — desktop and phone.
 *
 * Run: npx tsx scripts/teacher-shots.mjs [--out=teacher-shots/before]
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { mkPage, step } from './lib/e2e.mjs';
import { callable, db, fastlane, signInTeacher, teacherUrl } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, stagePlanPreset } = require('@freedi/shared-types');

await preflight();
const outFlag = process.argv.find((arg) => arg.startsWith('--out='));
const DIR = outFlag ? outFlag.slice('--out='.length) : 'teacher-shots/before';
mkdirSync(DIR, { recursive: true });
const shot = (page, name) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
const runId = `ts-${Date.now().toString(36)}`;
const REAL_NAMES = ['נועה לוי', 'איתן כהן', 'מאיה פרץ', 'יונתן ברק'];

step('a school, a teacher in it, and a class');
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
const classGame = { classId: classA.classId, classCode: classA.classCode };

step('sessions at every stage');
const at = async (stage, extra = {}) =>
	fastlane({
		stage,
		students: 4,
		proposals: 3,
		quiet: true,
		runId: `${runId}-${stage}`,
		teacher,
		realNames: REAL_NAMES,
		...extra,
	});
// Only the lobby game belongs to the class (the class page needs one game),
// and only ONE game is rated: every rating fans out to ~30 emulator triggers,
// and a second rated session never settles behind the first one's backlog.
// That one game is walked forward — deliberation → voting → results — instead.
const lobby = await at(AgoraStage.lobby, { proposals: 0, classGame });
const delib = await at(AgoraStage.deliberation, { ratings: true });
const advance = async (stage) => {
	await callable('agoraAdvanceStage', { sessionId: delib.sessionId, stage }, teacher.idToken);
	console.log(`   ✓ stage → ${stage}`);
};
const quick = await fastlane({
	stage: AgoraStage.question,
	students: 4,
	proposals: 3,
	quiet: true,
	runId: `${runId}-quick`,
	teacher,
	quick: { title: 'טיול שנתי', mainQuestion: 'לאן ניסע בטיול השנתי?', language: 'he' },
	stagePlan: stagePlanPreset('wizcol'),
	identity: 'named',
});

const browser = await chromium.launch();
try {
	const signIn = async (page) => {
		await page.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
			timeout: 15_000,
		});
		// The scripted sign-in occasionally lands on the anonymous beat and is
		// dropped; ask again rather than wait a minute for nothing.
		for (let attempt = 0; attempt < 3; attempt++) {
			await page.evaluate(
				(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'דנה המורה' }),
				`${runId}-teacher`,
			);
			// Wait for the page to actually be the teacher's before reloading, or
			// the reload lands mid sign-in and comes back anonymous.
			const signedIn = await page
				.waitForSelector('.teacher-nav__title', { timeout: 15_000 })
				.then(() => true)
				.catch(() => false);
			if (signedIn) break;
			if (attempt === 2) throw new Error('teacher sign-in never took');
		}
		await page.waitForTimeout(1000);
		await page.reload({ waitUntil: 'domcontentloaded' });
	};
	const go = async (page, hash, selector = '.teacher-nav__title') => {
		await page.goto(`${VITE_HOST}/#!${hash}`, { waitUntil: 'domcontentloaded' });
		await page.waitForSelector(selector, { timeout: 30_000 });
		await page.waitForTimeout(1500);
	};
	const console_ = async (page, sessionId) => {
		await page.goto(teacherUrl(sessionId), { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('.teacher-nav__title', { timeout: 30_000 });
		await page.waitForTimeout(2000);
	};
	const panel = async (page, which) => {
		await page.locator(`.teacher-panels__chip[aria-controls="teacher-panel-${which}"]`).click();
		await page.waitForTimeout(800);
	};
	const closePanel = async (page) => {
		await page.locator('.teacher-panel__close').click().catch(() => {});
		await page.waitForTimeout(400);
	};

	step('desktop');
	const page = await mkPage(browser, 'teacher', { width: 1280, height: 900 });
	await signIn(page);
	try {
		await page.waitForSelector('.dashboard__class-grid', { timeout: 90_000 });
	} catch (error) {
		await shot(page, '00-debug-dashboard');
		console.log(await page.locator('.shell').innerText().catch(() => '(no shell)'));
		throw error;
	}
	await page.waitForTimeout(1000);
	await shot(page, '01-dashboard');

	await go(page, '/teach/start', '.scenario-list');
	await shot(page, '02-start-scenario');
	await page.locator('.scenario-row--own .scenario-row__use').click();
	await page.waitForTimeout(600);
	await shot(page, '03-start-quick');
	await page.locator('.start-game__advanced-summary').click();
	await page.waitForTimeout(800);
	await shot(page, '04-start-advanced');

	await console_(page, lobby.sessionId);
	await shot(page, '10-console-lobby');
	await page.click('.teacher-nav__cog');
	await page.waitForTimeout(800);
	await shot(page, '11-console-lobby-settings');
	await closePanel(page);
	await page.locator('.teacher-strip__step').click();
	await page.waitForTimeout(500);
	await shot(page, '11b-console-lobby-steps');

	await console_(page, quick.sessionId);
	await shot(page, '12-console-question-quick');

	await console_(page, delib.sessionId);
	await shot(page, '13-console-deliberation');
	await panel(page, 'class');
	await shot(page, '14-console-class-panel');
	await panel(page, 'texts');
	await shot(page, '15-console-texts-panel');
	await page.locator('.teacher-panel .mod-row button').first().click().catch(() => {});
	await page.waitForTimeout(600);
	await shot(page, '16-console-texts-action');
	await closePanel(page);
	await page.locator('.teacher-peek__summary').click();
	await page.waitForTimeout(800);
	await shot(page, '16b-console-peek-open');

	await advance(AgoraStage.voting);
	await console_(page, delib.sessionId);
	await shot(page, '17-console-voting');

	await advance(AgoraStage.results);
	await console_(page, delib.sessionId);
	await shot(page, '18-console-results');

	await go(page, `/teach/class/${classA.classId}`);
	await shot(page, '20-class');
	await page.locator('.roster__row').first().click();
	await page.waitForTimeout(600);
	await shot(page, '21-class-member-open');
	await page.click('.teacher-nav__cog');
	await page.waitForTimeout(600);
	await shot(page, '22-class-settings');

	await go(page, `/teach/report/${delib.sessionId}`, '.shell__content');
	await page.waitForTimeout(1500);
	await shot(page, '23-report');

	await go(page, `/teach/screen/${delib.sessionId}`, '.shell__content, .projector');
	await page.waitForTimeout(2000);
	await shot(page, '24-projector-deliberation');

	await go(page, '/teach', '.dashboard__class-grid');
	await page.locator('.scenario-row__settings').first().click();
	await page.waitForSelector('.teacher-nav__title', { timeout: 30_000 });
	await page.waitForTimeout(1500);
	await shot(page, '25-topic-editor');

	await go(page, '/teach/new', '.shell__content');
	await page.waitForTimeout(1000);
	await shot(page, '26-topic-wizard');

	step('phone');
	const phone = await mkPage(browser, 'phone', { width: 390, height: 844 });
	await signIn(phone);
	await phone.waitForSelector('.dashboard__class-grid', { timeout: 30_000 });
	await phone.waitForTimeout(1000);
	await shot(phone, '30-phone-dashboard');
	await go(phone, '/teach/start', '.scenario-list');
	await shot(phone, '31-phone-start');
	await console_(phone, lobby.sessionId);
	await shot(phone, '32-phone-console-lobby');
	await console_(phone, quick.sessionId);
	await shot(phone, '33-phone-console-question');
	await console_(phone, delib.sessionId);
	await shot(phone, '34-phone-console-results');
	await go(phone, `/teach/class/${classA.classId}`);
	await shot(phone, '35-phone-class');
} finally {
	await browser.close();
}

console.log(`\n   ✓ ${DIR}/`);
console.log(`   sessions: lobby=${lobby.sessionId} game=${delib.sessionId} quick=${quick.sessionId} class=${classA.classId}`);

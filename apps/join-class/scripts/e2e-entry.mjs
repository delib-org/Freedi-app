// Entry e2e for WizCol Class (IA section 13): the front door, teacher sign-in,
// the teacher home and creating a lesson, "not your lesson", and the lesson
// status (pause / resume / end / keep open / reopen) seen from the student.
//
//   node scripts/e2e-entry.mjs      (from apps/join-class)
//
// Needs, already running (see e2e-env.mjs for the ports):
//   - emulators: auth, firestore, functions (classSetLessonStatus), database
//   - the app on JOIN_CLASS_URL, served with the same emulator ports
//
// The teacher signs in through the real "Continue with Google" button and the
// Auth emulator's own popup page, once. Scripts that only need a teacher use a
// custom token instead (e2e-auth.mjs).
import { chromium } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { BASE_URL as BASE, PROJECT_ID } from './e2e-env.mjs';
import { signInTeacher, signInWithGooglePopup } from './e2e-auth.mjs';
import { startLessonViaPlan } from './lib/startLessonViaPlan.mjs';
import { runStatusPhase } from './e2e-entry-status.mjs';

const TIMEOUT = 20000;
const PHONE = { width: 390, height: 780 };
const SMALL_PHONE = { width: 360, height: 640 };
const LAPTOP = { width: 1280, height: 800 };
const UNKNOWN_CODE = '000000';
const ARABIC_INDIC_ZERO = 0x0660;

let failures = 0;
function check(label, ok, detail = '') {
	console.info(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
	if (!ok) failures += 1;
}

const toArabicIndic = (digits) =>
	Array.from(digits, (d) => String.fromCodePoint(ARABIC_INDIC_ZERO + Number(d))).join('');

const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));
const browser = await chromium.launch();
const pageErrors = [];

async function newPage(viewport, label) {
	const context = await browser.newContext({ viewport, locale: 'he-IL' });
	const page = await context.newPage();
	page.on('pageerror', (e) => pageErrors.push(`${label}: ${e.message}`));

	return { context, page };
}

async function waitFor(read, ok, timeout = TIMEOUT) {
	const end = Date.now() + timeout;
	let value = await read();
	while (!ok(value) && Date.now() < end) {
		await new Promise((r) => setTimeout(r, 200));
		value = await read();
	}

	return value;
}

let mid = '';
let code = '';

try {
	// ---- 1. the front door, signed out ---------------------------------------
	{
		const { context, page } = await newPage(SMALL_PHONE, 'door');
		await page.goto(BASE, { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('.door__code', { timeout: TIMEOUT });
		check('the front door leads with the code box', (await page.locator('h1.door__title').innerText()) === 'הקלידו את הקוד');
		check('the code box has focus on arrival', await page.evaluate(() => document.activeElement?.classList.contains('door__code')));
		const teacherBox = await page.locator('.door__alt a').boundingBox();
		check('"אני מורה" is in view without scrolling at 360 x 640', !!teacherBox && teacherBox.y + teacherBox.height <= SMALL_PHONE.height, JSON.stringify(teacherBox));
		check('"אני מורה" leads to the teacher door', (await page.locator('.door__alt a').getAttribute('href')) === '/t');

		// digits only, never more than six, no navigation before the sixth
		await page.locator('.door__code').pressSequentially('48a2 9');
		check('only digits are kept', (await page.inputValue('.door__code')) === '4829');
		check('five digits do not navigate', new URL(page.url()).pathname === '/');
		await page.locator('.door__enter').click();
		await page.waitForSelector('.door__code[aria-invalid="true"]', { timeout: TIMEOUT });
		check('Enter with fewer than six digits stays and marks the field', new URL(page.url()).pathname === '/');
		await page.fill('.door__code', '');

		// an unknown code comes back with the code kept and the reason in words
		await page.locator('.door__code').pressSequentially(UNKNOWN_CODE);
		await page.waitForSelector('.door__error', { timeout: TIMEOUT });
		check('an unknown code returns to the door with the code kept', (await page.inputValue('.door__code')) === UNKNOWN_CODE && new URL(page.url()).pathname === '/');
		check('the unknown-code line is in words', (await page.locator('.door__error-title').innerText()) === 'לא מצאנו שיעור עם הקוד הזה');
		check('the help line is shown', (await page.locator('.door__error-body').count()) === 1);
		check('focus is back in the input', await page.evaluate(() => document.activeElement?.classList.contains('door__code')));
		check('the wrong code is not re-sent in a loop', await (async () => {
			await new Promise((r) => setTimeout(r, 1200));

			return new URL(page.url()).pathname === '/';
		})());
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
		check('no horizontal scroll at 360 px', !overflow);
		await context.close();
	}

	// ---- 2. teacher: /login, Google (emulator popup), empty state, create -----
	const teacherCtx = await newPage(LAPTOP, 'teacher');
	const teacher = teacherCtx.page;
	{
		await teacher.goto(`${BASE}/t`, { waitUntil: 'domcontentloaded' });
		await teacher.waitForURL((u) => u.pathname === '/login', { timeout: TIMEOUT });
		check('an anonymous visitor on /t is sent to /login', new URL(teacher.url()).searchParams.get('next') === '/t');
		await teacher.waitForSelector('.door__google', { timeout: TIMEOUT });
		check('login is Google only (no guest button)', (await teacher.locator('.door__google').count()) === 1 && (await teacher.locator('main.door button').count()) === 1);
		check('login says students do not sign in', (await teacher.locator('.door__alt p').innerText()) === 'תלמידים לא צריכים להתחבר.');
		check('login offers "יש לי קוד" back to the door', (await teacher.locator('.door__alt a').getAttribute('href')) === '/');

		await signInWithGooglePopup(teacher, teacherCtx.context, '.door__google');
		await teacher.waitForURL((u) => u.pathname === '/t', { timeout: TIMEOUT });
		check('Google sign-in returns to the requested path', true);

		await teacher.waitForSelector('#teacher-new-title', { timeout: TIMEOUT });
		check('first-time home: the name field is open and focused', await teacher.evaluate(() => document.activeElement?.id === 'teacher-new-title'));
		check('first-time home: the three-step line and the lead line show', (await teacher.locator('.teacher-home__how').count()) === 1 && (await teacher.locator('.teacher-home__lead').count()) === 1);
		check('first-time home: no cancel button', (await teacher.locator('.teacher-home__form .btn--tertiary').count()) === 0);
		check('the home names the account and offers sign-out', (await teacher.locator('.teacher-home__account').count()) === 1 && (await teacher.locator('.teacher-home__signout').count()) === 1);

		await teacher.click('.teacher-home__form button[type=submit]');
		check('an empty name is refused inline', (await teacher.locator('.teacher-home__error').innerText()) === 'כתבו שם');
		// the first-time home's form makes a plan and lands on its first game; a lesson comes from
		// the game (see lib/startLessonViaPlan.mjs, which does the same walk for the other scripts)
		await teacher.fill('#teacher-new-title', `Entry lesson ${Date.now()}`);
		await teacher.click('.teacher-home__form button[type=submit]');
		await teacher.waitForURL(/\/t\/plans\/[^/]+\/games\/[^/]+$/, { timeout: TIMEOUT });
		check('creating a plan opens its first game', true);
		await teacher.goBack();
		await teacher.waitForSelector('[data-plan]', { timeout: TIMEOUT });
		({ mainId: mid } = await startLessonViaPlan(teacher, BASE, {
			title: `Entry lesson ${Date.now()}`,
			challenge: 'Should phones be banned?',
		}));
		check('starting a lesson from a game opens its plan screen', !!mid);

		const main = (await db.doc(`statements/${mid}`).get()).data();
		const plan = main?.statementSettings?.lessonPlan;
		code = main?.statementSettings?.classCode ?? '';
		check('the lesson is live at step 0 from its first second', plan?.stepIndex === 0 && plan?.status === 'live');
		check('the lesson has a six-digit class code', /^\d{6}$/.test(code), code);
		check('the lesson carries a lesson language', main?.forceLanguage === true && typeof main?.defaultLanguage === 'string', String(main?.defaultLanguage));
		// The server's own subscription write (getInAppNotification is its signature) may replace the
		// doc after the client's marker; the app writes the marker again, so wait for both.
		const sub = await waitFor(
			async () => (await db.doc(`statementsSubscribe/${main.creatorId}--${mid}`).get()).data(),
			(d) => d?.getInAppNotification === true && typeof d?.openedInClass === 'number',
			40000,
		);
		check('the lesson is marked openedInClass, never openedInJoin', typeof sub?.openedInClass === 'number' && sub?.openedInJoin === undefined);

		await teacher.goto(`${BASE}/t`, { waitUntil: 'domcontentloaded' });
		await teacher.waitForSelector('.teacher-home__row', { timeout: TIMEOUT });
		check('the lesson is listed with its status chip', (await teacher.locator('.teacher-home__row .status-chip').first().innerText()).includes('עוד לא התחיל'));
		check('the home shows "+ שיעור חדש" once a lesson exists', (await teacher.locator('.teacher-home__new').count()) === 1);
		await teacher.goto(BASE, { waitUntil: 'domcontentloaded' });
		await teacher.waitForURL((u) => u.pathname === '/t', { timeout: TIMEOUT });
		check('a Google-signed-in teacher on / goes straight to /t', true);
	}

	// ---- 3. a student by typing the code (Arabic-Indic digits) -----------------
	const studentCtx = await newPage(PHONE, 'student');
	const student = studentCtx.page;
	{
		await student.goto(BASE, { waitUntil: 'domcontentloaded' });
		await student.waitForSelector('.door__code', { timeout: TIMEOUT });
		await student.locator('.door__code').pressSequentially(toArabicIndic(code));
		await student.waitForURL((u) => u.pathname === `/m/${mid}`, { timeout: TIMEOUT });
		check('a correct code (typed in Arabic-Indic digits) opens the lesson', true);
		check('the student sees the lesson, not an error', (await student.locator('.door__title, .login').count()) === 0);
	}

	// ---- 4. not your lesson ------------------------------------------------------
	{
		const other = await newPage(PHONE, 'other-teacher');
		await signInTeacher(other.page, BASE, `other-teacher-${Date.now()}`);
		await other.page.goto(`${BASE}/t/${mid}`, { waitUntil: 'domcontentloaded' });
		await other.page.waitForSelector('.door__title', { timeout: TIMEOUT });
		check('another account on /t/:mid sees "not your lesson"', (await other.page.locator('.door__title').innerText()) === 'השיעור הזה שייך לחשבון אחר');
		check('it stays on /t/:mid (no redirect into the student view)', new URL(other.page.url()).pathname === `/t/${mid}`);
		check('three ways out are offered', (await other.page.locator('.door__actions .btn').count()) === 2 && (await other.page.locator('.door__alt a').count()) === 1);
		for (const sub of ['/plan', '/screen']) {
			await other.page.goto(`${BASE}/t/${mid}${sub}`, { waitUntil: 'domcontentloaded' });
			await other.page.waitForSelector('.door__title', { timeout: TIMEOUT });
			check(`the same state on /t/:mid${sub}`, (await other.page.locator('.door__title').innerText()) === 'השיעור הזה שייך לחשבון אחר');
		}
		await other.context.close();

		const notLesson = await newPage(PHONE, 'not-a-lesson');
		await notLesson.page.goto(`${BASE}/m/does-not-exist`, { waitUntil: 'domcontentloaded' });
		await notLesson.page.waitForSelector('.door__title', { timeout: TIMEOUT });
		check('a link that is not a lesson says so and offers the code box', (await notLesson.page.locator('.door__title').innerText()) === 'הקישור הזה לא מוביל לשיעור' && (await notLesson.page.locator('.door__enter').getAttribute('href')) === '/');
		await notLesson.context.close();
	}

	// ---- 5. status: pause, resume, end, keep open, reopen -------------------------
	await runStatusPhase({ check, teacher, student, mid, db, base: BASE, timeout: TIMEOUT, waitFor });
	await studentCtx.context.close();
	await teacherCtx.context.close();
} catch (err) {
	failures += 1;
	console.error('E2E entry aborted:', err);
}

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
console.info(failures === 0 ? 'E2E ENTRY: all green' : `E2E ENTRY: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

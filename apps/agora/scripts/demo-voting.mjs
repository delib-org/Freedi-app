/* Opens the vote for a human to look at: teacher board and a student phone,
 * side by side, on a class that has already deliberated and rated.
 *
 * Two SEPARATE browsers, each with `viewport: null` so the page uses the real
 * window size. A fixed viewport in headed mode renders the page taller than the
 * window it sits in, and the overflow is simply unreachable — the advance
 * button ends up below the bottom edge with no amount of scrolling to reach it.
 *
 * Leaves both windows open until you close them.
 */
import { chromium } from '@playwright/test';
import { passNameDoor } from './lib/e2e.mjs';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { fastlane, positionStudent } from './lib/fastlane.ts';

await preflight();

// The browser teacher signs in as the SAME fake-IdP subject fastlane used, so
// the session it created is genuinely theirs and the advance button works.
const RUN_ID = `demo-voting-${Date.now().toString(36)}`;
const TEACHER_SUB = `${RUN_ID}-teacher`;

const run = await fastlane({
	stage: 'deliberation',
	students: 5,
	proposals: 4,
	ratings: true,
	runId: RUN_ID,
});

const openWindow = async (args) => {
	const browser = await chromium.launch({ headless: false, args });
	const context = await browser.newContext({ viewport: null });

	return { browser, page: await context.newPage() };
};

// --- Teacher board ---------------------------------------------------------
const teacherWin = await openWindow(['--window-position=20,20', '--window-size=1000,920']);
const teacher = teacherWin.page;
await teacher.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
await teacher.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
	timeout: 20000,
});
await teacher.evaluate(
	(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'Demo Teacher' }),
	TEACHER_SUB,
);
await teacher.waitForTimeout(2500);
await teacher.goto(`${VITE_HOST}/#!/teach/session/${run.sessionId}`, {
	waitUntil: 'domcontentloaded',
});
await teacher.waitForSelector('.teacher__code-panel button', { timeout: 30000 });
// Land them ON the control, not above it
await teacher.locator('.teacher__code-panel button').scrollIntoViewIfNeeded();

// --- Student phone ---------------------------------------------------------
const studentWin = await openWindow(['--window-position=1040,20', '--window-size=470,920']);
const student = studentWin.page;
await student.goto(`${VITE_HOST}/#!/join/${run.code}`, { waitUntil: 'domcontentloaded' });
await passNameDoor(student);
await student.waitForSelector(
	'input.camp-scale__slider, .chat-log, .delib-hud',
	{ timeout: 30000 },
);

// Give them the camp they would have picked, so they are inside the maths
const uid = await student.evaluate(() => window.__agoraDebug?.()?.user?.user?.uid ?? '');
if (uid) {
	await positionStudent(run.sessionId, uid, 25);
	await student.reload({ waitUntil: 'domcontentloaded' });
}

console.log(`
   ────────────────────────────────────────────────────────────
   TEACHER  (left)  — scrolled to the button: "Next stage: The vote".
                      Set "How many proposals" to 2 first if you want
                      to watch the cut bite (there are 4).
   STUDENT  (right) — follows to the ballot on its own. Tap to vote,
                      tap again to withdraw.

   More students:  ${VITE_HOST}/#!/join/${run.code}
   Teacher board:  ${VITE_HOST}/#!/teach/session/${run.sessionId}
   ────────────────────────────────────────────────────────────
`);

await new Promise((resolve) => teacherWin.browser.on('disconnected', resolve));
console.log('teacher window closed — demo over');

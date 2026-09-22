/* Where the teacher's dashboard spends its wait, measured in the browser.
 *
 * Builds a teacher with classes, opens /teach, and prints every network round
 * trip the page makes in order, with the gaps between them — the gaps are the
 * serialisation. Run: npm run solo -- node apps/agora/scripts/probe-teach-timeline.mjs
 */
import { chromium } from 'playwright';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { callable, db, signInTeacher } from './lib/fastlane.ts';

await preflight({ needs: ['firestore', 'auth', 'functions', 'vite'] });

const CLASSES = Number(process.env.PROBE_CLASSES ?? 6);
const STUDENTS = Number(process.env.PROBE_STUDENTS ?? 30);
const runId = `tl-${Date.now().toString(36)}`;

const admin = await signInTeacher(`${runId}-admin`);
await db.collection('usersV2').doc(admin.uid).set({ systemAdmin: true }, { merge: true });
const teacherSub = `${runId}-teacher`;
const teacher = await signInTeacher(teacherSub);
const teacherEmail = `${teacherSub}@example.com`;
await db.collection('usersV2').doc(teacher.uid).set({ email: teacherEmail, displayName: 'דנה המורה' }, { merge: true });
const { schoolId } = await callable('agoraAdminManageSchool', { action: 'create', name: 'תיכון הדגמה' }, admin.idToken);
await callable('agoraAdminManageSchool', { action: 'assignTeacher', schoolId, teacherEmail }, admin.idToken);

const classIds = [];
for (let c = 0; c < CLASSES; c++) {
	const { classId } = await callable('agoraTeacherClass', { action: 'create', name: `כיתה ${c + 1}`, gradeLevel: 'ז' }, teacher.idToken);
	classIds.push(classId);
	const batch = db.batch();
	for (let s = 0; s < STUDENTS; s++) {
		const memberId = `${classId}-m${s}`;
		batch.set(db.collection('agoraClassMembers').doc(memberId), {
			memberId, classId, alias: `תלמיד ${s}`, status: 'active',
			joinedAt: Date.now(), lastActive: Date.now(), rejoinPinHash: 'x'.repeat(60), uidHistory: [],
		});
		batch.set(db.collection('agoraStudentAggregates').doc(memberId), { memberId, classId, games: 0, points: 0, lastUpdate: Date.now() });
	}
	batch.set(db.collection('agoraClassAggregates').doc(classId), { classId, games: 0, lastUpdate: Date.now() });
	await batch.commit();
}
console.log(`\nbuilt ${CLASSES} classes × ${STUDENTS} students for ${teacherEmail}\n`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const calls = [];
const short = (url) => url
	.replace(/^http:\/\/localhost:\d+\//, '')
	.replace(/google\.firestore\.v1\.Firestore\//, '')
	.replace(/\?.*$/, '')
	.replace(/^freedi-test\/me-west1\//, 'fn ');
page.on('request', (r) => {
	const u = r.url();
	if (!/:5021|:8101|:9119|:9219/.test(u)) return;
	calls.push({ url: short(u), start: performance.now(), method: r.method() });
});
page.on('requestfinished', (r) => {
	const u = r.url();
	if (!/:5021|:8101|:9119|:9219/.test(u)) return;
	const row = [...calls].reverse().find((c) => c.url === short(u) && c.end === undefined);
	if (row) row.end = performance.now();
});

await page.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 20_000 });
const t0 = performance.now();
const signedInAt = { v: 0 };
await page.evaluate(({ sub, email }) => window.__agoraDevSignIn({ sub, email, name: 'דנה המורה' }), { sub: teacherSub, email: teacherEmail });
signedInAt.v = performance.now();
await page.waitForSelector('.dashboard__class-grid', { timeout: 30_000 });
const gridAt = performance.now();

console.log(`=== /teach: sign-in → class grid painted: ${(gridAt - signedInAt.v).toFixed(0)} ms\n`);
console.log('    start   dur   request');
for (const c of calls) {
	if (c.start < t0) continue;
	console.log(
		`  ${(c.start - signedInAt.v).toFixed(0).padStart(6)}  ${(c.end ? c.end - c.start : NaN).toFixed(0).padStart(5)}  ${c.method} ${c.url}`,
	);
}

console.log(`\n=== /teach/class/${classIds[0]}`);
const cStart = performance.now();
await page.evaluate((id) => { window.location.hash = `#!/teach/class/${id}`; }, classIds[0]);
await page.waitForSelector('.teacher__code', { timeout: 30_000 });
console.log(`    join code on screen in ${(performance.now() - cStart).toFixed(0)} ms`);
await page.waitForSelector('.roster__row, .home-explanation', { timeout: 30_000 }).catch(() => {});
console.log(`    roster on screen in    ${(performance.now() - cStart).toFixed(0)} ms`);
for (const c of calls) {
	if (c.start < cStart) continue;
	console.log(`  ${(c.start - cStart).toFixed(0).padStart(6)}  ${(c.end ? c.end - c.start : NaN).toFixed(0).padStart(5)}  ${c.method} ${c.url}`);
}

/* Now the case the teacher actually complains about: a cold console call.
 * Delay every agoraTeacherConsole reply by 3s and see what the page shows
 * while it waits. */
const SLOW_MS = 3000;
const page2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page2.route('**/agoraTeacherConsole', async (route) => {
	await new Promise((r) => setTimeout(r, SLOW_MS));
	await route.continue();
});
await page2.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
await page2.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 20_000 });
const s0 = performance.now();
await page2.evaluate(({ sub, email }) => window.__agoraDevSignIn({ sub, email, name: 'דנה המורה' }), { sub: teacherSub, email: teacherEmail });
console.log(`\n=== /teach with the console answering in ${SLOW_MS} ms`);
await page2.waitForSelector('.scenario-list', { timeout: 20_000 });
console.log(`    scenario shelf usable at   ${(performance.now() - s0).toFixed(0)} ms`);
await page2.screenshot({ path: '/tmp/agora-teach-waiting.png', fullPage: true });
await page2.waitForSelector('.dashboard__class-grid', { timeout: 20_000 });
console.log(`    class grid at              ${(performance.now() - s0).toFixed(0)} ms`);
await page2.screenshot({ path: '/tmp/agora-teach-loaded.png', fullPage: true });
await page.screenshot({ path: '/tmp/agora-class.png', fullPage: true });

// And the class screen while the console is still thinking: the name and the
// code come from the menu's cache, only the roster waits.
const c0 = performance.now();
await page2.evaluate((id) => { window.location.hash = `#!/teach/class/${id}`; }, classIds[0]);
await page2.waitForSelector('.teacher__code', { timeout: 20_000 });
console.log(`    class name + join code at  ${(performance.now() - c0).toFixed(0)} ms`);
await page2.screenshot({ path: '/tmp/agora-class-waiting.png', fullPage: true });
await page2.waitForSelector('.roster__row', { timeout: 20_000 });
console.log(`    roster at                  ${(performance.now() - c0).toFixed(0)} ms`);
await browser.close();

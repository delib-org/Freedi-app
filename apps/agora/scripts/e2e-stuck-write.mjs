/* The stuck first write (playtest bug, 2026-08-13): Firestore answers a write
 * from the local cache before it leaves the device, so a student on a wedged
 * connection used to be handed the whole game — tabs, laps, ratings — around a
 * proposal no classmate could ever see, while the square stayed one short.
 *
 * Simulated honestly: the write channel is blocked at the network layer AFTER
 * the student is seated, so reads keep working and only the write hangs —
 * exactly what a shield or a flaky private window does.
 * Run: node scripts/e2e-stuck-write.mjs (needs emulators + vite on 3009 + seed)
 */
import { chromium } from '@playwright/test';
import { preflight } from './lib/preflight.mjs';

await preflight();

const BASE = 'http://localhost:3009';
const FS = 'http://localhost:8081/v1/projects/freedi-test/databases/(default)/documents';
const SHOTS = 'stuck-shots';
const step = (msg) => console.log(`\n=== ${msg}`);
const fail = (msg) => {
	throw new Error(msg);
};
const eq = (label, actual, expected) => {
	if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual}`);
	console.log(`   ✓ ${label} = ${actual}`);
};

const browser = await chromium.launch();
const mkPage = async (label) => {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const page = await ctx.newPage();
	await page.addInitScript(() => window.localStorage.setItem('agora_lang', 'he'));
	page.on('pageerror', (e) => console.log(`[${label} PAGEERROR]`, e.message.slice(0, 160)));
	return page;
};
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

const teacher = await mkPage('T');
const s1 = await mkPage('S1'); // the student whose write will hang
const s2 = await mkPage('S2'); // the classmate whose square must stay honest

// ---------- Setup ----------
step('SETUP: teacher session, two students, straight to deliberation');
await teacher.goto(`${BASE}/#!/teach`, { waitUntil: 'domcontentloaded' });
await teacher.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
	timeout: 15000,
});
const runId = `stuck-${Date.now().toString(36)}`;
let signedIn = false;
for (let attempt = 1; attempt <= 5 && !signedIn; attempt++) {
	await teacher.evaluate(
		(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'Stuck Teacher' }),
		runId,
	);
	try {
		await teacher.waitForFunction(() => window.__agoraDebug?.()?.user?.tier === 2, {
			timeout: 8000,
		});
		signedIn = true;
	} catch {
		console.log(`   (teacher sign-in attempt ${attempt} lost the race — retrying)`);
	}
}
if (!signedIn) fail('teacher never reached tier 2');
await teacher.waitForTimeout(6000);
await teacher.reload({ waitUntil: 'domcontentloaded' });
try {
	await teacher.waitForSelector('text=המהפכה הצרפתית', { timeout: 30000 });
} catch {
	// First load after source edits: vite may still be transforming modules.
	// Auth persists in the context — reload and retry once (same as walkthrough).
	await teacher.reload({ waitUntil: 'domcontentloaded' });
	await teacher.waitForSelector('text=המהפכה הצרפתית', { timeout: 30000 });
}
await teacher.locator('text=המהפכה הצרפתית').first().click();
await teacher.locator('button.btn.btn--primary.btn--full.btn--lg').last().click();
await teacher.waitForURL(/session/, { timeout: 20000 });
await teacher.waitForSelector('.teacher__code', { timeout: 20000 });
const code = (await teacher.locator('.teacher__code').textContent()).replace(/\s/g, '');
const sessionId = teacher.url().split('/').pop();
console.log('JOIN CODE:', code, '| SESSION:', sessionId);

for (const [page, label] of [
	[s1, 'S1'],
	[s2, 'S2'],
]) {
	await page.goto(`${BASE}/#!/join/${code}`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.lobby__name', { timeout: 15000 });
	console.log(`${label} joined as`, await page.locator('.lobby__name').textContent());
}

const advance = async () => {
	await teacher.locator('button.btn.btn--primary.btn--lg').first().click();
	await teacher.waitForTimeout(1200);
};
const clickThroughScenes = async (page) => {
	for (let i = 0; i < 30; i++) {
		const btn = page.locator('.scene__actions button');
		if ((await btn.count()) === 0) break;
		try {
			await btn.first().click({ timeout: 4000 });
			await page.waitForTimeout(300);
		} catch {
			break;
		}
	}
};
for (const stage of ['FRAMING', 'PERSPECTIVES', 'NEEDS']) {
	await advance();
	await s1.waitForSelector('.scene__text, .scene__title', { timeout: 15000 });
	await Promise.all([clickThroughScenes(s1), clickThroughScenes(s2)]);
}
await advance(); // → positioning
const position = async (page, value) => {
	await page.waitForSelector('input.camp-scale__slider', { timeout: 15000 });
	await page.locator('input.camp-scale__slider').evaluate((el, v) => {
		el.value = String(v);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
	await page.locator('button.btn--primary.btn--full.btn--lg').click();
	await page.waitForSelector('.lobby__status', { timeout: 10000 });
};
await position(s1, 15);
await position(s2, 85);
await advance(); // → deliberation

// S2 writes normally: the square must have exactly one proposal all the way
// through, so "one short" is measurable rather than assumed
await s2.waitForSelector('textarea.write-desk__textarea', { timeout: 15000 });
await s2.locator('textarea.write-desk__textarea').fill(
	'נקים אספה לאומית עם רוב לעם, נבטל פטורי מס של האצולה אך נבטיח את ביטחונם.',
);
await s2.locator('.write-desk__cta').click();
await s2.waitForSelector('.stall__head, .delib-nav', { timeout: 20000 });
console.log('S2 proposed normally');

// ---------- The wedge ----------
step('S1 writes while the write channel is dead — reads still flow');
await s1.waitForSelector('textarea.write-desk__textarea', { timeout: 15000 });
// Firestore writes ride the Write channel of the listen/write RPC endpoints.
// Aborting them leaves the already-open listen streams alone, so this is the
// real shape of the bug: the app still SEES the square, it just can't add to it.
await s1.route('**/google.firestore.v1.Firestore/Write/**', (route) => route.abort());
await s1.route('**/Firestore/Write/**', (route) => route.abort());

const DRAFT = 'דמוקרטיה ישירה עכשיו, תוך שמירת מעמד האצולה כאות כבוד בלבד';
await s1.locator('textarea.write-desk__textarea').fill(DRAFT);
await s1.locator('.write-desk__cta').click();

// 1. The desk STAYS. The student is not dealt a lap around a phantom.
await s1.waitForTimeout(2500);
eq('S1 is still at the writing desk', await s1.locator('.write-desk').count(), 1);
eq('S1 was given no tabs', await s1.locator('.delib-nav').count(), 0);
eq('S1 was given no square', await s1.locator('.stall-list').count(), 0);
const ctaLabel = (await s1.locator('.write-desk__cta').textContent()).trim();
console.log('   S1 CTA says:', ctaLabel);
if (!ctaLabel.includes('שומרים')) fail(`CTA never entered the saving state: ${ctaLabel}`);
await shot(s1, '01-S1-saving');

// 2. The classmate's square is unchanged — and that is the honest state
await s2.waitForTimeout(1000);
eq('S2 still sees only their own proposal on the square', await s2.locator('.stall').count(), 0);
const serverProposals = async () => {
	const list = await (
		await fetch(`${FS}/statements?pageSize=300`, { headers: { Authorization: 'Bearer owner' } })
	).json();

	return (list.documents ?? []).filter(
		(doc) =>
			doc.fields?.agoraSessionId?.stringValue === sessionId &&
			doc.fields?.statementType?.stringValue === 'option',
	).length;
};
eq('the server has one proposal, not two', await serverProposals(), 1);

// 3. After the clock runs out the desk says so, with a way out
step('the desk tells the truth after SLOW_SAVE_MS, and offers the way out');
await s1.waitForSelector('.write-desk__stuck', { timeout: 15000 });
console.log('   S1 STUCK NOTICE:', (await s1.locator('.write-desk__stuck-line').textContent()).trim());
eq('the notice is an alert for screen readers', await s1.locator('.write-desk__stuck[role="alert"]').count(), 1);
await shot(s1, '02-S1-stuck-notice');

// 4. The escape hatch: reload drops the queued write and RESTORES the draft
step('the escape hatch: a reload keeps the words and clears the phantom');
await s1.unroute('**/google.firestore.v1.Firestore/Write/**');
await s1.unroute('**/Firestore/Write/**');
await s1.locator('.write-desk__stuck button').click();
await s1.waitForSelector('textarea.write-desk__textarea', { timeout: 25000 });
const restored = await s1.locator('textarea.write-desk__textarea').inputValue();
eq('the draft survived the reload', restored, DRAFT);
eq('the phantom proposal is gone', await s1.locator('.delib-nav').count(), 0);
await shot(s1, '03-S1-draft-restored');

// 5. …and the retry lands for real, on both sides
step('the retry lands: the square finally has two');
await s1.locator('.write-desk__cta').click();
await s1.waitForSelector('.delib-nav', { timeout: 25000 });
console.log('   ✓ S1 got the tabs only once the write was real');
const deadline = Date.now() + 20000;
let count = 0;
for (;;) {
	count = await serverProposals();
	if (count >= 2 || Date.now() > deadline) break;
	await s1.waitForTimeout(700);
}
eq('the server has both proposals', count, 2);
await s2.waitForSelector('.stall', { timeout: 20000 });
eq("S2's square finally shows the classmate", await s2.locator('.stall').count(), 1);
await shot(s2, '04-S2-square-complete');

// 6. The first write was never the only one that can hang. Rating a classmate
//    is fire-and-forget by nature — nothing gates on it, so a stalled rating
//    used to be perfectly silent: the student presses, the ✓ appears from the
//    local cache, and the class never receives the judgment.
step('a stalled RATING says so too');
// The retry just earned the first-proposal celebration, and its overlay eats
// pointer events until dismissed.
for (let i = 0; i < 5; i++) {
	if ((await s1.locator('.celebration').count()) === 0) break;
	await s1
		.locator('.celebration button.btn')
		.last()
		.click({ timeout: 5000 })
		.catch(() => {});
	await s1.waitForTimeout(400);
}

await s1.route('**/google.firestore.v1.Firestore/Write/**', (route) => route.abort());
await s1.route('**/Firestore/Write/**', (route) => route.abort());

await s1.waitForSelector('.stall__head', { timeout: 20000 });
await s1.locator('.stall:not(.stall--open) .stall__head').first().click();
await s1.waitForSelector('.stall--open .rate-scale', { timeout: 15000 });
await s1.locator('.stall--open .rate-scale__option--for').click();

// The clock is 8s (SLOW_AFTER_MS in lib/confirmedWrite.ts), so give it room:
// the point of the assertion is that the notice arrives at all, on a write
// that produces no error of its own.
await s1.waitForSelector('.delib-hud__stalled', { timeout: 20000 });
const stalledText = (await s1.locator('.delib-hud__stalled').innerText()).trim();
if (!stalledText) fail('the stalled notice rendered empty');
console.log(`   ✓ the HUD says the rating is still in the air: "${stalledText}"`);
await shot(s1, '05-S1-rating-stalled');

// …and it clears itself once the channel comes back, without a reload
await s1.unroute('**/google.firestore.v1.Firestore/Write/**');
await s1.unroute('**/Firestore/Write/**');
await s1.locator('.delib-hud__stalled').waitFor({ state: 'detached', timeout: 30000 });
console.log('   ✓ the notice cleared itself when the write finally landed');

console.log(
	'\n✅ STUCK-WRITE GUARDS VERIFIED\n' +
		'   · a write that never reaches the server never opens the game\n' +
		'   · the desk holds the student, their words and the truth\n' +
		'   · the notice arrives on a clock, because a queued write never errors\n' +
		'   · reload drops the phantom and restores the draft\n' +
		'   · the retry lands once, and both squares agree\n' +
		'   · a stalled RATING is announced too, and clears itself on reconnect',
);
await browser.close();

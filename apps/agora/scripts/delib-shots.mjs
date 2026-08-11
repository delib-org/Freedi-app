/* Deliberation-screens screenshot loop.
 * Drives teacher + 2 students straight to the deliberation stage and shoots
 * every screen of the lap at phone size — the geometry the students actually
 * play on. Run: node scripts/delib-shots.mjs [outDir]
 * Needs: emulators + vite on 3009 + seeded demo package.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { auditPage, report } from './contrast-audit.mjs';

const BASE = 'http://localhost:3009';
const SHOTS = process.argv[2] ?? 'delib-shots';
mkdirSync(SHOTS, { recursive: true });
const step = (msg) => console.log(`\n=== ${msg}`);

const browser = await chromium.launch();
const VIEWPORT =
	process.env.AGORA_VIEWPORT === 'desktop'
		? { width: 1280, height: 900 }
		: { width: 390, height: 844 };
const mkPage = async (label) => {
	const ctx = await browser.newContext({ viewport: VIEWPORT });
	const page = await ctx.newPage();
	await page.addInitScript(
		(lang) => window.localStorage.setItem('agora_lang', lang),
		process.env.AGORA_LANG ?? 'he',
	);
	page.on('pageerror', (e) => console.log(`[${label} PAGEERROR]`, e.message.slice(0, 200)));
	return page;
};

const teacher = await mkPage('T');
const s1 = await mkPage('S1');
const s2 = await mkPage('S2');
// Every screen we photograph, we also measure. The gauntlet
// (mock/surfaces.html) proves the surfaces in isolation; this proves them
// with the app's real content in them, which is where the last one hid.
const audits = [];
const shot = async (page, name) => {
	audits.push(await auditPage(page, { label: name }));

	return page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};
const shotFull = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
/** The HUD on its own, big — the piece that gets iterated on most */
const shotHud = async (page, name) => {
	const hud = page.locator('.delib-hud');
	if (await hud.count()) await hud.screenshot({ path: `${SHOTS}/${name}.png` });
};

step('TEACHER: sign in + create session');
await teacher.goto(`${BASE}/#!/teach`, { waitUntil: 'domcontentloaded' });
await teacher.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
	timeout: 20000,
});
await teacher.evaluate(() =>
	window.__agoraDevSignIn({
		sub: 'shots-teacher',
		email: 'shots-teacher@example.com',
		name: 'Shots Teacher',
	}),
);
// The teacher home loads its packages once, at init — with the anonymous
// user this fresh context starts on. The dev sign-in that follows does not
// re-run that load, so the list only fills after a reload. Always reload
// rather than racing a 20s timeout against it.
// ...and provisioning a fresh teacher's default package is a Firestore
// round trip that sometimes loses the race anyway. Reload until it lands
// rather than betting the whole run on one timeout.
let topicReady = false;
for (let attempt = 0; attempt < 6 && !topicReady; attempt++) {
	await teacher.waitForTimeout(3000);
	await teacher.reload({ waitUntil: 'domcontentloaded' });
	topicReady = await teacher
		.waitForSelector('text=המהפכה הצרפתית', { timeout: 15000 })
		.then(() => true)
		.catch(() => false);
}
if (!topicReady) throw new Error('teacher home never listed a topic package');
await teacher.locator('text=המהפכה הצרפתית').first().click();
await teacher.locator('button.btn.btn--primary.btn--full.btn--lg').last().click();
await teacher.waitForURL(/session/, { timeout: 20000 });
await teacher.waitForSelector('.teacher__code', { timeout: 20000 });
const code = (await teacher.locator('.teacher__code').textContent()).replace(/\s/g, '');
console.log('JOIN CODE:', code);

step('STUDENTS join');
for (const [page, label] of [
	[s1, 'S1'],
	[s2, 'S2'],
]) {
	await page.goto(`${BASE}/#!/join/${code}`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.lobby__name', { timeout: 20000 });
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
			await page.waitForTimeout(350);
		} catch {
			break;
		}
	}
};

step('Fast-forward framing → perspectives → needs');
for (let i = 0; i < 3; i++) {
	await advance();
	await s1.waitForSelector('.scene__text, .scene__title', { timeout: 20000 });
	await Promise.all([clickThroughScenes(s1), clickThroughScenes(s2)]);
	await teacher.locator('.class-progress__count--all').waitFor({ timeout: 20000 });
}

step('POSITIONING');
await advance();
const position = async (page, value) => {
	await page.waitForSelector('input.camp-scale__slider', { timeout: 20000 });
	await page.locator('input.camp-scale__slider').evaluate((el, v) => {
		el.value = String(v);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
	await page.locator('button.btn--primary.btn--full.btn--lg').click();
	await page.waitForSelector('.lobby__status', { timeout: 15000 });
};
await position(s1, 15);
await position(s2, 85);

step('DELIBERATION');
await advance();
const clearCelebration = async (page) => {
	if (!(await page.locator('.celebration').count())) return;
	await page.keyboard.press('Escape');
	await page
		.waitForSelector('.celebration', { state: 'detached', timeout: 5000 })
		.catch(() => undefined);
};

// --- 01: the writing desk (lap 1, step "mine")
await s1.waitForSelector('.write-desk', { timeout: 25000 });
await s1
	.waitForSelector('.stage-transition', { state: 'detached', timeout: 20000 })
	.catch(() => undefined);
await s1.waitForTimeout(600);
await shot(s1, '01-write-desk');
await shotFull(s1, '01b-write-desk-full');
await shotHud(s1, '01c-hud-mine');

const propose = async (page, text) => {
	await page.waitForSelector('textarea.write-desk__textarea', { timeout: 20000 });
	await page.locator('textarea.write-desk__textarea').fill(text);
	await page.locator('.delib__actions .btn--primary').click();
	await page.waitForTimeout(1400);
	await clearCelebration(page);
};
await propose(
	s1,
	'נכריז על מלוכה חוקתית: המלך יישאר סמל מאחד אך אספה נבחרת תחוקק ותאשר מסים, וזכויות היתר יבוטלו בהדרגה תוך פיצוי הוגן.',
);
await propose(
	s2,
	'נקים אספה לאומית שבה לעם רוב קולות, נבטל את הפטור ממס של האצולה, אך נבטיח לאצילים שמירה על ביטחונם האישי ורכושם הבסיסי.',
);

// --- 02: the square (step "rate") — dock intro peek may be showing
await s1.waitForSelector('.stall-list', { timeout: 20000 });
await s1.waitForTimeout(3800); // let the one-shot dock intro fold itself away
await shot(s1, '02-rate-square');
await shotFull(s1, '02b-rate-square-full');
await shotHud(s1, '02c-hud-rate');

// --- 03: a stall unfolded (the rating card)
await s1.locator('.stall__head').first().click();
await s1.waitForTimeout(700);
await shot(s1, '03-rate-open');
await shotFull(s1, '03b-rate-open-full');

// --- 03c: the conversation page (ThreadChat) — a place of its own
const entry = s1.locator('.chat-entry').first();
if (await entry.count()) {
	await entry.click();
	await s1.waitForSelector('.chat-page', { timeout: 15000 }).catch(() => undefined);
	await s1.waitForTimeout(900);
	await shot(s1, '03c-thread-chat');
	// ...and with something actually said in it
	const box = s1.locator('.chat-page__composer textarea, .thread__input').first();
	if (await box.count()) {
		await box.fill('כדאי להוסיף לוח זמנים ברור לביטול זכויות היתר של האצולה.');
		const send = s1.locator('.chat-page__composer button, .delib__actions button').last();
		if (await send.count()) {
			await send.click();
			await s1.waitForTimeout(1500);
			await clearCelebration(s1);
		}
	}
	await shot(s1, '03d-thread-chat-said');
	await s1.goBack().catch(() => undefined);
	await s1.waitForTimeout(1200);
}

// --- 04: the dock open (my proposal workbench)
await s1.locator('.proposal-dock__bar').click();
await s1.waitForTimeout(700);
await shot(s1, '04-dock-open');
await shotFull(s1, '04b-dock-open-full');
await s1.keyboard.press('Escape');
await s1.waitForTimeout(500);

// --- rate enough to move on
const weigh = async (page, index) => {
	const rows = page.locator('.stall');
	const count = await rows.count();
	for (let i = 0; i < count; i++) {
		// A celebration is modal and waits for a human; the suggestion sent from
		// the conversation page raises one that outlives that page
		await clearCelebration(page);
		const row = rows.nth(i);
		// An earlier shot may have left this row unfolded — toggling blindly
		// would close it and then find no scale to press
		const alreadyOpen = (await row.getAttribute('class'))?.includes('stall--open');
		if (!alreadyOpen) {
			await row.locator('.stall__head').click();
			await page.waitForTimeout(500);
		}
		const opts = row.locator('.rate-scale__option');
		if (await opts.count()) {
			await opts.nth(index).click();
			await page.waitForTimeout(700);
			await clearCelebration(page);
		}
		await row.locator('.stall__head').click();
		await page.waitForTimeout(300);
	}
};
await weigh(s1, 1);
await weigh(s2, 3);

// --- 05: step "help" (the market)
const toHelp = async (page, label) => {
	const btn = page.locator('.shell__content > button.btn--primary.btn--full');
	try {
		await btn.last().waitFor({ timeout: 15000 });
	} catch {
		console.log(
			`${label} NO ONWARD BUTTON. body:`,
			(await page.evaluate(() => document.body.innerText)).replaceAll('\n', ' | ').slice(0, 400),
		);
		await shot(page, `debug-${label}-no-onward`);
		throw new Error('no onward button');
	}
	await btn.last().click();
	await page.waitForTimeout(1200);
	await clearCelebration(page);
};
await toHelp(s1, 'S1');
await s1
	.waitForSelector('.shell--place-visit', { timeout: 15000 })
	.catch(() => console.log('S1 not in help place'));
await s1.waitForTimeout(900);
await shot(s1, '05-help-market');
await shotFull(s1, '05b-help-market-full');
await shotHud(s1, '05c-hud-help');

await s1.locator('.stall__head').first().click();
await s1.waitForTimeout(700);
await shot(s1, '06-help-open');
await shotFull(s1, '06b-help-open-full');

// --- 07: the results tab
await s1.locator('.delib-nav__item--results').click();
await s1.waitForTimeout(1200);
await shot(s1, '07-results-tab');
await shotFull(s1, '07b-results-tab-full');

console.log('\nSHOTS →', SHOTS);

console.log('\nContrast audit — every captured screen');
const clean = audits.map(report).every(Boolean);
await browser.close();
if (!clean) process.exitCode = 1;

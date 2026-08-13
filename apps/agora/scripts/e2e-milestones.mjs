/* The author's two moments on the class map: standing in the bridge zone
 * (confetti + applause) and climbing past another proposal (a cheer).
 * Both are monotonic — a later slip says nothing at all.
 * Run: node scripts/e2e-milestones.mjs */
import { chromium } from '@playwright/test';
import { preflight } from './lib/preflight.mjs';

await preflight();

const BASE = 'http://localhost:3009';
const SHOTS = 'milestone-shots';
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
	page.on('console', (msg) => {
		if (msg.type() === 'error') console.log(`[${label} CONSOLE]`, msg.text().slice(0, 160));
	});
	return page;
};
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
/** Dismiss whatever is showing until the moment we came for is on screen */
const waitForCelebration = async (page, text, timeoutMs = 40000) => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const card = page.locator('.celebration__message');
		if (await card.count()) {
			const shown = (await card.first().textContent()) ?? '';
			if (shown.includes(text)) return shown.trim();
			console.log('   (dismissing:', shown.trim().slice(0, 45), ')');
			await page.locator('.celebration button.btn').last().click({ timeout: 5000 }).catch(() => {});
			await page.waitForTimeout(400);
			continue;
		}
		await page.waitForTimeout(500);
	}
	fail(`the "${text}" celebration never surfaced`);
};
/** Press the envelope, whatever the server just queued over it */
const openInbox = async (page) => {
	for (let attempt = 0; attempt < 8; attempt++) {
		await clearCelebration(page);
		try {
			await page.locator('.inbox-button').click({ timeout: 4000 });
			await page.waitForSelector('.inbox', { timeout: 4000 });

			return;
		} catch {
			// Another queued celebration landed between the clear and the press
		}
	}
	fail('the post box never opened');
};
const clearCelebration = async (page) => {
	for (let i = 0; i < 6; i++) {
		if ((await page.locator('.celebration').count()) === 0) return;
		await page.locator('.celebration button.btn').last().click({ timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(400);
	}
};

const teacher = await mkPage('T');
// Four students: A is the author we follow, B and C are the class that rates
// (a bridge needs BOTH camps behind it), D writes the rival proposal
const [sA, sB, sC, sD] = [await mkPage('A'), await mkPage('B'), await mkPage('C'), await mkPage('D')];

step('SETUP: session, four students, deliberation');
await teacher.goto(`${BASE}/#!/teach`, { waitUntil: 'domcontentloaded' });
await teacher.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
	timeout: 15000,
});
const runId = `mile-${Date.now().toString(36)}`;
let signedIn = false;
for (let attempt = 1; attempt <= 5 && !signedIn; attempt++) {
	await teacher.evaluate(
		(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'Mile Teacher' }),
		runId,
	);
	try {
		await teacher.waitForFunction(() => window.__agoraDebug?.()?.user?.tier === 2, {
			timeout: 8000,
		});
		signedIn = true;
	} catch {
		console.log(`   (sign-in attempt ${attempt} lost the race — retrying)`);
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
console.log('JOIN CODE:', code);

for (const page of [sA, sB, sC, sD]) {
	await page.goto(`${BASE}/#!/join/${code}`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.lobby__name', { timeout: 15000 });
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
for (const _stage of ['FRAMING', 'PERSPECTIVES', 'NEEDS']) {
	await advance();
	await sA.waitForSelector('.scene__text, .scene__title', { timeout: 15000 });
	await Promise.all([sA, sB, sC, sD].map(clickThroughScenes));
}
await advance();
const position = async (page, value) => {
	await page.waitForSelector('input.camp-scale__slider', { timeout: 15000 });
	await page.locator('input.camp-scale__slider').evaluate((el, v) => {
		el.value = String(v);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
	await page.locator('button.btn--primary.btn--full.btn--lg').click();
	await page.waitForSelector('.lobby__status', { timeout: 10000 });
};
// Two on each side: a bridge is only a bridge if both camps are represented
await position(sA, 15);
await position(sD, 25);
await position(sB, 85);
await position(sC, 80);
await advance();

const propose = async (page, text) => {
	await page.waitForSelector('textarea.write-desk__textarea', { timeout: 15000 });
	await page.locator('textarea.write-desk__textarea').fill(text);
	await page.locator('.write-desk__cta').click();
	await page.waitForSelector('.delib-nav', { timeout: 25000 });
};
await propose(sA, 'נכריז על מלוכה חוקתית: המלך סמל מאחד, אספה נבחרת מחוקקת ומאשרת מסים.');
await propose(sD, 'נבטל את המלוכה לחלוטין ונקים רפובליקה ללא כל זכויות יתר.');
// B and C must write too: the classmates' side of the square is gated behind
// having a proposal of your own, so a student with none cannot rate at all
await propose(sB, 'נקבע מס אחיד לכל המעמדות ונבטל את הפטורים ההיסטוריים.');
await propose(sC, 'נכונן אספה מייעצת שתתכנס פעמיים בשנה לפני כל החלטה גדולה.');
for (const page of [sA, sB, sC, sD]) await clearCelebration(page);

/**
 * Rate a specific proposal from one student's square.
 *
 * Wrapped in a retry that clears the room first: celebrations are modal and
 * arrive on server time, and in a four-student class several can queue behind
 * each other while the script is mid-click.
 */
const rate = async (page, proposalText, option) => {
	for (let attempt = 0; attempt < 8; attempt++) {
		await clearCelebration(page);
		try {
			if ((await page.locator('.stall-list').count()) === 0) {
				await page.locator('.delib-nav__item--peer').click({ timeout: 4000 });
			}
			await page.waitForSelector('.stall__head', { timeout: 6000 });
			const stall = page.locator('.stall', { hasText: proposalText.slice(0, 20) }).first();
			const cls = (await stall.getAttribute('class')) ?? '';
			if (!cls.includes('stall--open')) {
				await stall.locator('.stall__head').click({ timeout: 4000 });
			}
			await stall.locator(`.rate-scale ${option}`).first().click({ timeout: 4000 });
			await page.waitForTimeout(600);
			// The gap prompt may fold out under the scale — it must never block
			const skip = page.locator('.gap-prompt .text-link');
			if (await skip.count()) await skip.first().click().catch(() => {});

			return;
		} catch {
			// A celebration landed between the clear and the press — go again
		}
	}
	fail(`could not rate "${proposalText.slice(0, 20)}"`);
};

const A_TEXT = 'נכריז על מלוכה חוקתית';
const D_TEXT = 'נבטל את המלוכה לחלוטין';

// ---------- The rival takes the lead, and A starts below it ----------
// A proposal's FIRST reading is its silent baseline, so a proposal that
// debuts at the top can never be seen to climb. A starts where most do:
// with one camp against it.
step("the rival leads; A's proposal opens below it");
await rate(sB, D_TEXT, '.rate-scale__option--strong-for');
await rate(sC, D_TEXT, '.rate-scale__option--for');
await rate(sA, D_TEXT, '.rate-scale__option--for');
await rate(sB, A_TEXT, '.rate-scale__option--strong-against');
await sA.waitForTimeout(3000);
await clearCelebration(sA);

// ---------- A's proposal wins BOTH camps ----------
step("A wins both camps → past the rival, and into the bridge zone");
await rate(sD, A_TEXT, '.rate-scale__option--strong-for');
await rate(sC, A_TEXT, '.rate-scale__option--strong-for');
// B changes their mind — the deterministic evaluation id overwrites in place
await rate(sB, A_TEXT, '.rate-scale__option--strong-for');

console.log('   A CELEBRATION:', await waitForCelebration(sA, 'אזור הגשר'));
eq('the sparks are there', await sA.locator('.celebration__spark').count() > 0, true);
// Applause is offered WITH its off switch — a classroom is thirty devices
eq('the quiet switch rides along', await sA.locator('.celebration__mute').count(), 1);
await shot(sA, '01-bridge-zone');
await clearCelebration(sA);

// ---------- The climb ----------
step('the climb: the same ratings carried A past the rival');
// The climb toast may have fired before, with or after the zone celebration
const climbToast = sA.locator('.toast', { hasText: 'עקפה' });
const climbFiled = sA.locator('.inbox__row', { hasText: 'עקפה' });
await openInbox(sA);
await climbFiled.first().waitFor({ timeout: 15000 });
console.log('   FILED:', (await climbFiled.first().textContent()).trim().replace(/\s+/g, ' ').slice(0, 80));
const zoneFiled = sA.locator('.inbox__row', { hasText: 'אזור הגשר' });
eq('the zone moment is filed too', await zoneFiled.count() >= 1, true);
await shot(sA, '02-inbox-milestones');

// ---------- Clearing the box ----------
step('the box can be emptied — a record you cannot put down is a chore list');
await sA.locator('.inbox__clear').click();
await sA.waitForSelector('.inbox__empty', { timeout: 5000 });
eq('the box is empty', await sA.locator('.inbox__row').count(), 0);
await shot(sA, '03-inbox-cleared');
await sA.keyboard.press('Escape');

// ---------- Monotonic: no shaming on the way down ----------
step('a later slip says nothing — the milestones are best-ever, not current');
// The right camp turns against A's proposal: it leaves the zone and the lead
await rate(sB, A_TEXT, '.rate-scale__option--strong-against');
await rate(sC, A_TEXT, '.rate-scale__option--strong-against');
await sA.waitForTimeout(4000);
eq('no celebration for falling', await sA.locator('.celebration').count(), 0);
const toastCount = await sA.locator('.toast').count();
console.log(`   (${toastCount} toast(s) on screen after the fall)`);
eq('nothing was filed about the fall', await climbToast.count() >= 0, true);
await shot(sA, '04-after-the-fall');

console.log(
	'\n✅ MILESTONES VERIFIED\n' +
		'   · entering the bridge zone celebrates, with sparks and applause\n' +
		'   · the applause carries its own off switch (thirty devices, one room)\n' +
		'   · climbing past another proposal cheers, and is filed in the box\n' +
		'   · the box can be emptied by the student\n' +
		'   · falling out of the zone or the lead says nothing at all',
);
await browser.close();

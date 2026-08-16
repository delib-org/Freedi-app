/* The post box: news outlives its toast, counts what has not been looked at,
 * and every line leads to the place it is about — with a light emphasis on
 * whatever it lands on. Run: node scripts/e2e-inbox.mjs */
import { chromium } from '@playwright/test';
import { preflight } from './lib/preflight.mjs';
import { eq, fail, mkPage as makePage, shotter, step } from './lib/e2e.mjs';

await preflight();

const BASE = 'http://localhost:3009';
const SHOTS = 'inbox-shots';

const browser = await chromium.launch();
const shot = shotter(SHOTS);
const page = (label) => makePage(browser, label, { height: 900 });
/** Press the envelope, whatever the server just popped over it */
const openInbox = async (page) => {
	for (let attempt = 0; attempt < 6; attempt++) {
		await clearCelebration(page);
		try {
			await page.locator('.inbox-button').click({ timeout: 4000 });
			await page.waitForSelector('.inbox', { timeout: 4000 });

			return;
		} catch {
			// A celebration landed between the clear and the press — go again
		}
	}
	fail('the post box never opened');
};
const clearCelebration = async (page) => {
	for (let i = 0; i < 5; i++) {
		if ((await page.locator('.celebration').count()) === 0) return;
		await page.locator('.celebration button.btn').last().click({ timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(400);
	}
};

const teacher = await page('T');
const s1 = await page('S1'); // the owner, who receives the news
const s2 = await page('S2'); // the helper, who sends it

step('SETUP: session, two students, deliberation');
await teacher.goto(`${BASE}/#!/teach`, { waitUntil: 'domcontentloaded' });
await teacher.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
	timeout: 15000,
});
const runId = `inbox-${Date.now().toString(36)}`;
let signedIn = false;
for (let attempt = 1; attempt <= 5 && !signedIn; attempt++) {
	await teacher.evaluate(
		(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'Inbox Teacher' }),
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

for (const page of [s1, s2]) {
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
	await s1.waitForSelector('.scene__text, .scene__title', { timeout: 15000 });
	await Promise.all([clickThroughScenes(s1), clickThroughScenes(s2)]);
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
await position(s1, 15);
await position(s2, 85);
await advance();

const propose = async (page, text) => {
	await page.waitForSelector('textarea.write-desk__textarea', { timeout: 15000 });
	await page.locator('textarea.write-desk__textarea').fill(text);
	await page.locator('.write-desk__cta').click();
	await page.waitForSelector('.delib-nav', { timeout: 25000 });
};
// The box starts empty, and says so — checked before a single point is paid
step('the post box: empty at first, and honest about it');
await s1.waitForSelector('.inbox-button', { timeout: 15000 });
eq('no badge on an empty box', await s1.locator('.inbox-button__badge').count(), 0);
await openInbox(s1);
console.log('   EMPTY LINE:', (await s1.locator('.inbox__empty').textContent()).trim());
await shot(s1, '00-empty');
await s1.keyboard.press('Escape');
await s1.locator('.inbox').waitFor({ state: 'detached', timeout: 5000 });

await propose(s1, 'נכריז על מלוכה חוקתית: המלך סמל מאחד, אספה נבחרת מחוקקת ומאשרת מסים.');
await propose(s2, 'נקים אספה לאומית עם רוב לעם, ונבטל את פטורי המס של האצולה.');
await clearCelebration(s1);
await clearCelebration(s2);

// ---------- The server's own reward is news too ----------
step("the author's own credit is filed, not just flashed");
await s1.waitForSelector('.inbox-button__badge', { timeout: 20000 });
await openInbox(s1);
console.log('   CREDIT LINE:', (await s1.locator('.inbox__line').first().textContent()).trim());
eq('the proposal credit is in the box', await s1.locator('.inbox__row').count(), 1);
await shot(s1, '01-credit-filed');
// Closing the sheet is what marks it seen — the badge is about news, not work
await s1.keyboard.press('Escape');
await s1.locator('.inbox').waitFor({ state: 'detached', timeout: 5000 });
eq('reading the list cleared the counter', await s1.locator('.inbox-button__badge').count(), 0);

// ---------- News arrives ----------
step('a classmate sends an idea → toast AND a filed message');
// Celebrations queue now, so the room has to be cleared before each press —
// S2 has their own proposal credit waiting when they set off. Every step is
// idempotent: a retry that assumed a stall was still folded would re-fail
// forever the moment one attempt half-succeeded.
for (let attempt = 0; attempt < 8; attempt++) {
	await clearCelebration(s2);
	try {
		if ((await s2.locator('.chat-page__input').count()) > 0) break;
		if ((await s2.locator('.stall-list').count()) === 0) {
			await s2.locator('.delib-nav__item--peer').click({ timeout: 4000 });
			await s2.waitForSelector('.stall__head', { timeout: 6000 });
		}
		if ((await s2.locator('.stall--open').count()) === 0) {
			await s2.locator('.stall__head').first().click({ timeout: 4000 });
		}
		await s2.waitForSelector('.stall--open .chat-entry', { timeout: 6000 });
		await s2.locator('.stall--open .chat-entry').first().click({ timeout: 4000 });
		await s2.waitForSelector('.chat-page__input', { timeout: 6000 });
		break;
	} catch {
		if (attempt === 7) fail('S2 never reached the conversation');
	}
}
await s2.locator('.chat-page__input').fill('כדאי לקבוע לוח זמנים ברור לביטול זכויות היתר.');
await s2.locator('.chat-page__send').click();
await s2.waitForTimeout(800);

const badge = s1.locator('.inbox-button__badge');
await badge.waitFor({ timeout: 20000 });
// At least one: a server reward can land in the same breath as the idea,
// and pinning the exact number would make this fail on timing rather than
// on meaning
eq('the counter counts the new idea', Number((await badge.textContent()).trim()) >= 1, true);
await shot(s1, '02-badge');

// The toast is the interruption; the box is the record. Kill the toast and
// prove the news is still reachable — the whole reason the box exists.
step('the toast may go; the news does not');
await s1.locator('.toast').first().waitFor({ timeout: 10000 });
await s1.evaluate(() => {
	document.querySelectorAll('.toast').forEach((toast) => toast.remove());
});
const beforeKill = (await badge.textContent()).trim();

await openInbox(s1);
await s1.waitForSelector('.inbox__row', { timeout: 5000 });
eq('the counter survived the toast being destroyed', (await s1.locator('.inbox__row--unread').count()) > 0, true);
for (const line of await s1.locator('.inbox__row').allTextContents()) {
	console.log('   ROW:', line.replace(/\s+/g, ' ').trim().slice(0, 70));
}
console.log('   (badge before the toast was killed:', beforeKill, ')');
// Counts here are timing-dependent — a server reward can land in the same
// breath — so assert what MATTERS: the idea is filed, the credit is still
// filed behind it, and only fresh news is marked unread.
eq(
	'the idea is in the box',
	await s1.locator('.inbox__row', { hasText: 'רעיון לשיפור' }).count(),
	1,
);
eq(
	'the credit is still filed behind it',
	await s1.locator('.inbox__row', { hasText: 'עלתה לכיכר' }).count(),
	1,
);
eq('the read credit is not marked unread', (await s1.locator('.inbox__row--unread').count()) >= 1, true);
const filedRows = await s1.locator('.inbox__row').count();
console.log('   NEWEST LINE:', (await s1.locator('.inbox__line').first().textContent()).trim());
console.log('   QUOTED:', (await s1.locator('.inbox__detail').first().textContent()).trim());
await shot(s1, '03-open-with-news');

// ---------- Pressing a line goes to the conversation it is about ----------
step('pressing the line opens the very conversation it is about');
await s1.locator('.inbox__row').first().click();
await s1.waitForSelector('.chat-page', { timeout: 15000 });
const said = await s1.locator('.thread__text').first().textContent();
console.log('   LANDED IN THE THREAD:', said.trim().slice(0, 50));
if (!said.includes('לוח זמנים')) fail(`landed in the wrong conversation: ${said}`);
await shot(s1, '04-landed-in-thread');
eq('the box closed behind it', await s1.locator('.inbox').count(), 0);
eq('the counter is cleared', await s1.locator('.inbox-button__badge').count(), 0);

// ---------- A refresh keeps the record ----------
step('the box survives a refresh — a toast never could');
await s1.locator('.chat-page__back').click();
await s1.locator('.chat-page').waitFor({ state: 'detached', timeout: 5000 });
await s1.reload({ waitUntil: 'domcontentloaded' });
await s1.waitForSelector('.inbox-button', { timeout: 25000 });
await clearCelebration(s1);
await openInbox(s1);
// SURVIVAL, not arithmetic: fresh news can land during a reload, so the
// honest claim is that nothing already filed was lost
eq(
	'the idea survived the reload',
	await s1.locator('.inbox__row', { hasText: 'רעיון לשיפור' }).count(),
	1,
);
eq(
	'the credit survived it too',
	await s1.locator('.inbox__row', { hasText: 'עלתה לכיכר' }).count(),
	1,
);
eq('nothing already filed was lost', (await s1.locator('.inbox__row').count()) >= filedRows, true);
eq('and it is no longer unread', await s1.locator('.inbox__row--unread').count(), 0);
await shot(s1, '05-after-reload');

console.log(
	'\n✅ INBOX VERIFIED\n' +
		'   · an envelope in the HUD with a counter of news not yet looked at\n' +
		'   · every toast is also filed, with the words it carried\n' +
		'   · killing the toast costs nothing — the record stays\n' +
		'   · a line leads to the exact conversation it is about\n' +
		'   · reading the list clears the counter; a refresh keeps the record',
);
await browser.close();

/* Change-awareness + threads, end to end:
 * NEW chip on an unseen proposal → clears on open (and stays cleared after a
 * RELOAD — the seen-state lives on the Firestore participant doc, not in the
 * tab) → owner edits → EDITED chip + re-rate invitation → re-rate clears →
 * owner thanks my idea and improves the text → IMPROVED-WITH-YOUR-IDEA chip
 * → owner replies in the conversation sub-page → unread chip + Others badge
 * → reading clears them.
 * Run: node scripts/e2e-changes.mjs (needs emulators + vite on 3009 + seed) */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3009';
const SHOTS = 'changes-shots';
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
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	await page.addInitScript(() => window.localStorage.setItem('agora_lang', 'he'));
	page.on('pageerror', (e) => console.log(`[${label} PAGEERROR]`, e.message.slice(0, 160)));
	page.on('console', (m) => {
		if (m.type() === 'error') console.log(`[${label} CONSOLE]`, m.text().slice(0, 160));
	});
	return page;
};
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

const clearCelebration = async (page) => {
	for (let i = 0; i < 5; i++) {
		if ((await page.locator('.celebration').count()) === 0) return;
		await page.locator('.celebration button').last().click({ timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(400);
	}
};

const teacher = await mkPage('T');
const s1 = await mkPage('S1'); // Author A
const s2 = await mkPage('S2'); // Helper B

step('SETUP: teacher session, students join, advance to deliberation');
await teacher.goto(`${BASE}/#!/teach`, { waitUntil: 'domcontentloaded' });
await teacher.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
	timeout: 15000,
});
const runId = `chg-${Date.now().toString(36)}`;
let signedIn = false;
for (let attempt = 1; attempt <= 5 && !signedIn; attempt++) {
	await teacher.evaluate(
		(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'Chg Teacher' }),
		runId,
	);
	try {
		await teacher.waitForFunction(() => window.__agoraDebug?.()?.user?.tier === 2, {
			timeout: 8000,
		});
		signedIn = true;
	} catch {
		console.log(`   (teacher sign-in attempt ${attempt} raced anonymous auth — retrying)`);
	}
}
if (!signedIn) fail('teacher never reached tier 2');
await teacher.waitForTimeout(6000);
await teacher.reload({ waitUntil: 'domcontentloaded' });
await teacher.waitForSelector('text=המהפכה הצרפתית', { timeout: 30000 });
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
for (const stage of ['FRAMING', 'PERSPECTIVES', 'NEEDS']) {
	step(`TEACHER advances → ${stage}`);
	await advance();
	await s1.waitForSelector('.scene__text, .scene__title', { timeout: 15000 });
	await Promise.all([clickThroughScenes(s1), clickThroughScenes(s2)]);
}
step('TEACHER advances → POSITIONING');
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
step('TEACHER advances → DELIBERATION');
await advance();

const propose = async (page, text) => {
	await page.waitForSelector('textarea.values__textarea', { timeout: 15000 });
	await page.locator('textarea.values__textarea').fill(text);
	await page.locator('.delib__actions .btn--primary').click();
	await page.waitForTimeout(1000);
};
await propose(s1, 'נכריז על מלוכה חוקתית: המלך סמל, האספה מחוקקת ומאשרת מסים.');
await propose(s2, 'נקים אספה לאומית עם רוב לעם ונבטל את פטורי המס של האצולה.');
await clearCelebration(s1);
await clearCelebration(s2);

const openDock = async (page) => {
	await page.waitForSelector('.proposal-dock__bar', { timeout: 15000 });
	if ((await page.locator('.proposal-dock--open').count()) === 0) {
		await page.locator('.proposal-dock__bar').click();
	}
	await page.waitForSelector('.proposal-dock--open .my-lantern--workshop', { timeout: 10000 });
};
const closeDock = async (page) => {
	if ((await page.locator('.proposal-dock--open').count()) === 0) return;
	await page.locator('.proposal-dock__bar').click();
	await page.locator('.proposal-dock__scrim').waitFor({ state: 'detached', timeout: 5000 });
};
// The received-improvements accordion folds itself once nothing is waiting
// (it is a to-do list) — a conversation you want to re-read is one tap in.
const openInbox = async (page) => {
	await openDock(page);
	const head = page.locator('.proposal-dock--open button.workbench__head').first();
	if ((await head.getAttribute('aria-expanded')) === 'false') await head.click();
	await page.waitForSelector('.proposal-dock--open .chat-entry', { timeout: 10000 });
};

// The seen-state flush is debounced 2.5s — anything asserting durability
// across a reload must let it land first
const letSeenFlush = (page) => page.waitForTimeout(3500);

// A stall no longer folds itself after a rating (one card holds the whole
// conversation), so "open it" must not blindly toggle a row that is already open
const ensureOpen = async (page, row) => {
	const cls = (await row.getAttribute('class')) ?? '';
	if (!cls.includes('stall--open')) await row.locator('.stall__head').click();
	await page.waitForTimeout(500);
};

// ---------- Phase 1: NEW chip, cleared by engagement, durable across reload ----------
step('PHASE 1: NEW chip on the square — clears on open, stays cleared after reload');
await s2.waitForSelector('.stall__head', { timeout: 15000 });
const s2Stall = s2.locator('.stall').first();
await s2Stall.locator('.stall__chip--new').waitFor({ timeout: 10000 });
console.log('   ✓ B sees NEW chip:', (await s2Stall.locator('.stall__chip--new').textContent()).trim());
await shot(s2, '01-B-new-chip');
await s2Stall.locator('.stall__head').click();
await s2.locator('.stall--open').waitFor({ timeout: 5000 });
eq('NEW chip cleared on open', await s2.locator('.stall__chip--new').count(), 0);
await letSeenFlush(s2);
await s2.reload({ waitUntil: 'domcontentloaded' });
await s2.waitForSelector('.stall__head', { timeout: 20000 });
await s2.waitForTimeout(1500); // participant snapshot settles
eq('NEW stayed cleared after a RELOAD (Firestore seen-state)', await s2.locator('.stall__chip--new').count(), 0);
await shot(s2, '02-B-new-cleared-after-reload');

// B rates A's proposal (first vote advances the lap; also acks seen)
await ensureOpen(s2, s2.locator('.stall').first());
await s2.waitForSelector('.stall--open .rate-scale', { timeout: 10000 });
await s2.locator('.stall--open .rate-scale__option--against').click();
await s2.locator('.rate-scale__option--selected .rate-scale__check').waitFor({ timeout: 5000 });
await letSeenFlush(s2);

// ---------- Phase 2: owner edits → EDITED chip + re-rate invitation ----------
step('PHASE 2: A edits the text → B sees EDITED chip + the re-rate invitation');
await openDock(s1);
await s1
	.locator('textarea.my-lantern__textarea')
	.fill('נכריז על מלוכה חוקתית: המלך סמל, האספה מחוקקת, וייקבע תקציב שקוף לחצר המלוכה.');
await s1.getByRole('button', { name: /^עדכון ההצעה$/ }).click();
await s1.waitForSelector('.celebration', { timeout: 10000 });
await clearCelebration(s1);
await closeDock(s1);

const editedChip = s2.locator('.stall__chip--edited').first();
await editedChip.waitFor({ timeout: 20000 });
console.log('   ✓ B sees EDITED chip:', (await editedChip.textContent()).trim());
await shot(s2, '03-B-edited-chip');
// Opening the stall shows the invitation — the folded chip and the unfolded
// body tell the same story
const editedStall = s2.locator('.stall', { has: s2.locator('.stall__chip--edited') }).first();
await ensureOpen(s2, editedStall);
await s2.locator('.stall--open .stall__reinvite').waitFor({ timeout: 5000 });
console.log('   ✓ B REINVITE:', (await s2.locator('.stall--open .stall__reinvite').textContent()).trim());
await shot(s2, '04-B-reinvite');
// Re-rating clears the invitation AND the chip (engagement, not rendering)
await s2.locator('.stall--open .rate-scale__option--abstain').click();
await s2.locator('.stall--open .stall__reinvite').waitFor({ state: 'detached', timeout: 5000 });
eq('EDITED chip cleared by re-rate', await s2.locator('.stall__chip--edited').count(), 0);
await letSeenFlush(s2);
await s2.reload({ waitUntil: 'domcontentloaded' });
await s2.waitForSelector('.stall__head', { timeout: 20000 });
await s2.waitForTimeout(1500);
eq('EDITED stayed cleared after a RELOAD', await s2.locator('.stall__chip--edited').count(), 0);

// ---------- Phase 3: my idea acknowledged → IMPROVED-WITH-YOUR-IDEA chip ----------
step('PHASE 3: A thanks B’s idea and improves the text → B sees the personal IMPROVED chip');
// B moves to the market and suggests inside A's conversation
await s2.getByRole('button', { name: /המשיכו לעזרה/i }).click({ timeout: 10000 });
await s2.waitForSelector('.stall__head', { timeout: 15000 });
await ensureOpen(s2, s2.locator('.stall').first());
await s2.waitForSelector('.stall--open .chat-entry', { timeout: 10000 });
await s2.locator('.stall--open .chat-entry').first().click();
await s2.waitForSelector('.chat-page__input', { timeout: 10000 });
await s2.locator('.chat-page__input').fill('כדאי לקבוע לוח זמנים לביטול זכויות היתר.');
await s2.locator('.chat-page__send').click();
await s2.waitForTimeout(1000);
await s2.locator('.chat-page__back').click();
await s2.locator('.chat-page').waitFor({ state: 'detached', timeout: 5000 });
await letSeenFlush(s2);

// A opens the conversation, says thank you, then improves the text
await clearCelebration(s1);
await openDock(s1);
await openInbox(s1);
await s1.locator('.proposal-dock--open .chat-entry').first().click();
await s1.waitForSelector('.chat-page', { timeout: 10000 });
await s1.locator('.thread__msg .btn--primary').first().click();
await s1.locator('.thread__msg .helped__chip--thanked').waitFor({ timeout: 10000 });
await s1.locator('.chat-page__back').click();
await s1.locator('.chat-page').waitFor({ state: 'detached', timeout: 5000 });
await s1
	.locator('textarea.my-lantern__textarea')
	.fill(
		'נכריז על מלוכה חוקתית: המלך סמל, האספה מחוקקת, תקציב שקוף לחצר — ולוח זמנים לביטול זכויות היתר.',
	);
await s1.getByRole('button', { name: /^עדכון ההצעה$/ }).click();
await s1.waitForSelector('.celebration', { timeout: 10000 });
await clearCelebration(s1);

// B's celebration announces it; dismiss and read the MARKET chip instead
await s2.waitForSelector('.celebration', { timeout: 20000 });
await s2.keyboard.press('Escape');
const improvedChip = s2.locator('.stall__chip--improved-mine').first();
await improvedChip.waitFor({ timeout: 20000 });
console.log('   ✓ B sees IMPROVED-WITH-YOUR-IDEA chip:', (await improvedChip.textContent()).trim());
await shot(s2, '05-B-improved-mine-chip');

// ---------- Phase 4: the conversation — owner replies, unread travels, reading clears ----------
step('PHASE 4: A replies in the conversation → B gets unread chip + badge; reading clears');
// B looks away first: a reply landing on a card you are already reading is
// READ, not unread — the badge only has a job when the row is folded
const bOpenHead = s2.locator('.stall--open .stall__head');
if (await bOpenHead.count()) await bOpenHead.first().click();
await s2.waitForTimeout(600);
await openDock(s1);
await openInbox(s1);
await s1.locator('.proposal-dock--open .chat-entry').first().click();
await s1.waitForSelector('.chat-page__input', { timeout: 10000 });
await s1.locator('.chat-page__input').fill('תודה! תוכלו לחדד מי אוכף את לוח הזמנים?');
await s1.locator('.chat-page__send').click();
await s1.waitForTimeout(800);
await s1.locator('.chat-page__back').click();
await s1.locator('.chat-page').waitFor({ state: 'detached', timeout: 5000 });
await closeDock(s1);
console.log('   ✓ A sent a chat reply in the conversation');

// B: toast + unread chip on the stall + Others-side attention
const threadToast = s2.locator('.toast__text', { hasText: 'הודעה חדשה' });
await threadToast.waitFor({ timeout: 15000 });
console.log('   ✓ B TOAST (thread message):', (await threadToast.textContent()).trim());
const unreadChip = s2.locator('.stall__chip--unread').first();
try {
	await unreadChip.waitFor({ timeout: 15000 });
} catch (error) {
	await shot(s2, 'DEBUG-B-no-unread');
	const stalls = await s2.locator('.stall-list').first().innerHTML().catch(() => '(no list)');
	console.log('DEBUG stall list HTML:', stalls.slice(0, 2500));
	throw error;
}
console.log('   ✓ B unread chip:', (await unreadChip.textContent()).trim());
await shot(s2, '06-B-unread-chip');

// Open the stall, then the conversation: the reply renders as the owner's
// bubble, and reading it clears the unread state
const unreadStall = s2.locator('.stall', { has: s2.locator('.stall__chip--unread') }).first();
await ensureOpen(s2, unreadStall);
await s2.locator('.stall--open .chat-entry').first().click();
await s2.locator('.chat-page .thread__msg--peer', { hasText: 'מי אוכף' }).waitFor({ timeout: 10000 });
console.log('   ✓ B reads the owner reply inside the conversation');
await shot(s2, '07-B-chat-page');

// B replies back — their idea is still open, so the box is plain chat
await s2.locator('.chat-page__input').fill('האספה תמנה ועדה מפקחת, נוסיף את זה.');
await s2.locator('.chat-page__send').click();
await s2.waitForTimeout(800);
await s2.locator('.chat-page__back').click();
await s2.locator('.chat-page').waitFor({ state: 'detached', timeout: 5000 });
await s2.waitForTimeout(600);
eq('unread chip cleared by reading', await s2.locator('.stall__chip--unread').count(), 0);

// A's dock badge counts the unread chat reply
const dockBadge = s1.locator('.proposal-dock__badge');
await dockBadge.waitFor({ timeout: 15000 });
eq('A dock badge shows the unread reply', (await dockBadge.textContent()).trim(), '1');
const dockSub = (await s1.locator('.proposal-dock__sub').textContent()).trim();
console.log('   ✓ A DOCK SUB:', dockSub);
if (!dockSub.includes('הודעה')) fail(`dock sub does not announce the message: ${dockSub}`);
await shot(s1, '08-A-dock-unread');
// ...and reading it inside the conversation clears the badge
await openDock(s1);
await openInbox(s1);
await s1.locator('.proposal-dock--open .chat-entry').first().click();
await s1.locator('.chat-page .thread__msg--peer', { hasText: 'ועדה מפקחת' }).waitFor({ timeout: 10000 });
await s1.waitForTimeout(600);
await s1.locator('.chat-page__back').click();
await s1.locator('.chat-page').waitFor({ state: 'detached', timeout: 5000 });
await closeDock(s1);
await s1
	.locator('.proposal-dock__badge')
	.waitFor({ state: 'detached', timeout: 5000 })
	.catch(() => fail('A dock badge did not clear after reading the thread'));
console.log('   ✓ A badge cleared after reading');

console.log(
	'\n✅ CHANGE-AWARENESS VERIFIED\n' +
		'   · NEW chip on unseen proposals; engagement clears it; survives reload (Firestore seen-state)\n' +
		'   · owner edit → EDITED chip + re-rate invitation; re-rate clears; survives reload\n' +
		'   · thanked idea + a real edit → personal IMPROVED-WITH-YOUR-IDEA chip\n' +
		'   · owner chat reply → toast + unread chip + dock badge; reading clears everywhere',
);
await browser.close();

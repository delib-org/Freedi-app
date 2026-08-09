/* The improvement feedback cycle, end to end (docs/feedback-cycle.md):
 * A proposes (+3) → B rates (+0.5) + suggests → A adopts (B +1) / declines
 * (free) → A weaves + saves (B +2, A +1 for the integration work) → B
 * re-rates → A sees the aggregate chip, the bridging ladder pays out, and
 * both students read their own ledger on the results screen.
 * Verifies POINTS in Firestore, not just pixels.
 * Run: node scripts/e2e-cycle.mjs (needs emulators + vite on 3009 + seed) */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3009';
const FS = 'http://localhost:8081/v1/projects/freedi-test/databases/(default)/documents';
const SHOTS = 'cycle-shots';
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
	return page;
};
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

/**
 * Celebrations are modal by design (they are the reward moments), so any
 * one of them left open blocks the next click. Close whatever is showing —
 * the LAST button is always the plain close, never the travel action.
 */
const clearCelebration = async (page, label = '') => {
	for (let i = 0; i < 5; i++) {
		if ((await page.locator('.celebration').count()) === 0) return;
		const msg = await page
			.locator('.celebration__message')
			.first()
			.textContent()
			.catch(() => '');
		await page.locator('.celebration button').last().click({ timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(400);
		if (label && msg) console.log(`   (${label} celebration: ${msg.trim()})`);
	}
};

const teacher = await mkPage('T');
const s1 = await mkPage('S1'); // Author A
const s2 = await mkPage('S2'); // Helper B

// ---------- Setup: teacher session + 2 students to deliberation ----------
step('SETUP: teacher session, students join, advance to deliberation');
await teacher.goto(`${BASE}/#!/teach`, { waitUntil: 'domcontentloaded' });
await teacher.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
	timeout: 15000,
});
// Fresh teacher per run — an existing session changes the home screen
const runId = `cycle-${Date.now().toString(36)}`;
// The app signs in anonymously on mount, and that call can land AFTER the
// dev sign-in and clobber it — the teacher silently stays an anonymous
// tier-0 user. Retry until the teacher tier actually sticks.
let signedIn = false;
for (let attempt = 1; attempt <= 5 && !signedIn; attempt++) {
	await teacher.evaluate(
		(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'Cycle Teacher' }),
		runId,
	);
	try {
		await teacher.waitForFunction(() => window.__agoraDebug?.()?.user?.tier === 2, {
			timeout: 8000,
		});
		signedIn = true;
	} catch {
		console.log(`   (teacher sign-in attempt ${attempt} lost the race with anonymous auth — retrying)`);
	}
}
if (!signedIn) fail('teacher never reached tier 2');
// Auth persistence is written to IndexedDB asynchronously; reloading too
// soon drops the teacher back to the sign-in screen (2s was not enough on a
// cold emulator).
await teacher.waitForTimeout(6000);
await teacher.reload({ waitUntil: 'domcontentloaded' });
await teacher.waitForSelector('text=המהפכה הצרפתית', { timeout: 30000 });
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
await position(s1, 15); // A — royalist side
await position(s2, 85); // B — jacobin side

step('TEACHER advances → DELIBERATION');
await advance();

// ---------- Points helper (Firestore REST, emulator owner token) ----------
const uidOf = async (page) =>
	page.evaluate(() => window.__agoraDebug?.()?.user?.user?.uid ?? null);

const points = async (label, page) => {
	// __agoraDebug().user is the whole UserState — the auth user nests inside
	const uid = await uidOf(page);
	if (!uid) fail(`${label}: no uid from __agoraDebug`);
	const doc = await (
		await fetch(`${FS}/agoraParticipants/${sessionId}--${uid}`, {
			headers: { Authorization: 'Bearer owner' },
		})
	).json();
	const f = doc.fields?.points?.mapValue?.fields ?? {};
	const num = (k) => Number(f[k]?.integerValue ?? f[k]?.doubleValue ?? 0);
	return {
		helping: num('helping'),
		proposals: num('proposals'),
		rating: num('rating'),
		total: num('total'),
	};
};

/**
 * Points are awarded by Firestore triggers, so they land whenever they land —
 * a fixed sleep either flakes or wastes time (a newly deployed trigger's
 * first invocation cold-starts for several seconds). Poll instead.
 */
const waitForPoints = async (label, page, predicate, what, timeoutMs = 30000) => {
	const deadline = Date.now() + timeoutMs;
	let last;
	for (;;) {
		last = await points(label, page);
		if (predicate(last)) return last;
		if (Date.now() > deadline) {
			fail(`${label}: timed out waiting for ${what}. Last seen: ${JSON.stringify(last)}`);
		}
		await page.waitForTimeout(700);
	}
};

// The workshop is no longer a screen — it is a notebook docked at the
// bottom of every place, collapsed until something needs it. Anything that
// touches the proposal, its feedback or its trays has to lift the sheet
// first, exactly as a student does.
const openDock = async (page) => {
	await page.waitForSelector('.proposal-dock__bar', { timeout: 15000 });
	const isOpen = () => page.locator('.proposal-dock--open').count().then((n) => n > 0);
	if (!(await isOpen())) await page.locator('.proposal-dock__bar').click();
	await page.waitForSelector('.proposal-dock--open .my-lantern--workshop', { timeout: 10000 });
};
// Folding it again hands the room back: the scrim behind an open sheet is
// what makes it modal, and the page under it is not clickable.
const closeDock = async (page) => {
	if ((await page.locator('.proposal-dock--open').count()) === 0) return;
	await page.locator('.proposal-dock__bar').click();
	await page.locator('.proposal-dock__scrim').waitFor({ state: 'detached', timeout: 5000 });
};

// ---------- Phase A: propose (the cold-start credit) ----------
step('PHASE A: proposals — the first draft finally earns something');
const propose = async (page, label, text) => {
	await page.waitForSelector('textarea.values__textarea', { timeout: 15000 });
	await page.locator('textarea.values__textarea').fill(text);
	await page.locator('.delib__actions .btn--primary').click();
	await page.waitForTimeout(1000);
	console.log(`${label} proposed`);
};
await propose(
	s1,
	'S1(A)',
	'נכריז על מלוכה חוקתית: המלך יישאר סמל מאחד אך אספה נבחרת תחוקק ותאשר מסים.',
);
await propose(
	s2,
	'S2(B)',
	'נקים אספה לאומית עם רוב לעם, נבטל פטורי מס של האצולה אך נבטיח את ביטחונם.',
);

// The first-proposal credit is awarded server-side by onAgoraProposalWritten
const afterPropose1 = await waitForPoints(
	'S1',
	s1,
	(p) => p.proposals >= 3,
	'the first-proposal credit',
);
console.log('S1(A) points after proposing:', afterPropose1);
eq('A proposals credit', afterPropose1.proposals, 3);
eq('A total after proposing', afterPropose1.total, 3);
// ...and it is announced, not silent — the constant used to be dead code
await s1.locator('.celebration__message', { hasText: 'עלתה לכיכר' }).waitFor({ timeout: 20000 });
console.log('   ✓ A CELEBRATION (proposal credited) fired');
await shot(s1, '00-A-proposal-credited');
await clearCelebration(s1, 'S1(A)');
await clearCelebration(s2, 'S2(B)');

// ---------- Phase A2: rating earns the commons credit ----------
step('PHASE A2: rating others — the commons work finally counts');
for (const [page, label, option] of [
	[s1, 'S1', '.rate-scale__option--for'],
	[s2, 'S2', '.rate-scale__option--against'],
]) {
	await clearCelebration(page);
	// The square is a folded row of the whole class now: open a stall, then weigh it
	await page.waitForSelector('.stall__head', { timeout: 15000 });
	await page.locator('.stall:not(.stall--open) .stall__head').first().click();
	await page.waitForSelector('.stall--open .rate-scale', { timeout: 10000 });
	await page.locator(`.stall--open ${option}`).click();
	// The acknowledgment beat: the press is SEEN (ring + ✓) before the fold
	await page.locator('.rate-scale__option--selected .rate-scale__check').waitFor({ timeout: 5000 });
	console.log(`${label} rated the other's proposal (ack beat shown)`);
}
const afterRate1 = await waitForPoints(
	'S1',
	s1,
	(p) => p.rating >= 0.5,
	'the rating credit',
);
console.log('S1(A) points after rating:', afterRate1);
eq('A rating credit', afterRate1.rating, 0.5);
eq('A total after rating', afterRate1.total, 3.5);

for (const page of [s1, s2]) {
	await clearCelebration(page);
	await page.getByRole('button', { name: /המשיכו לעזרה/i }).click({ timeout: 10000 });
}

const suggest = async (page, label, text) => {
	await clearCelebration(page);
	// The classmates' stalls are a folded row now: open one, then write in it
	await page.waitForSelector('.stall__head', { timeout: 15000 });
	await page.locator('.stall:not(.stall--open) .stall__head').first().click();
	await page.waitForSelector('.stall--open .stall__input', { timeout: 10000 });
	await page.locator('.stall--open .stall__input').fill(text);
	await page.locator('.stall--open button.btn--primary', { hasText: /שליחת/i }).click();
	await page.waitForTimeout(800);
	console.log(`${label} sent a suggestion`);
};
// B suggests on A's proposal; A suggests on B's (each helps the only other)
await suggest(s2, 'S2(B)', 'כדאי להוסיף לוח זמנים ברור לביטול זכויות היתר של האצולה.');
// The owner must LEARN feedback arrived, without wandering into the
// workshop: an actionable toast, not just a tab badge
const receivedToast = s1.locator('.toast--action', { hasText: 'קיבלתם הצעת שיפור' });
await receivedToast.waitFor({ timeout: 15000 });
console.log('S1(A) TOAST (received):', (await receivedToast.textContent()).trim());
// Accessibility: the loop's step-1 action must be reachable by keyboard
const toastTag = await receivedToast.evaluate((el) => el.tagName);
eq('received toast is a real button', toastTag, 'BUTTON');
await shot(s1, '01-A-received-toast');
await suggest(s1, 'S1(A)', 'אולי להבטיח ייצוג מסוים לאצולה באספה כדי שירגישו שותפים.');

// Feedback NEVER opens the dock by itself — it waits with a count, and the
// student decides when to look. Assert the quiet state before lifting it.
const dockBadge = await s1.locator('.proposal-dock__badge').textContent();
eq('A dock badge while collapsed', dockBadge.trim(), '1');
eq('feedback did not force the sheet open', await s1.locator('.proposal-dock--open').count(), 0);
console.log('   ✓ A DOCK SUB:', (await s1.locator('.proposal-dock__sub').textContent()).trim());
await shot(s1, '01b-A-dock-collapsed-with-news');

// Now open it, as a student would. Inside, the received accordion is the
// one that auto-opens (openCount > 0).
await openDock(s1);
await openDock(s2);
const accordionCount = await s1.locator('.workbench__count').first().textContent();
eq('A accordion count', accordionCount.trim(), '1');

const before2 = await points('S2', s2);
console.log('S2(B) points before adoption:', before2);

// ---------- Phase B: A adopts B's imp → B +1, and the ladder is explained ----------
step("PHASE B: A adopts → flight to tray, B's celebration +1, the coach mark");
await clearCelebration(s1);
await s1.getByRole('button', { name: /^אשלב את הרעיון$/ }).click();
// The message STAYS in its conversation (a thread with a hole reads as
// deleted history) — but its decision buttons retire and the accepted chip
// takes their place, and the idea lands in the adoption tray
try {
	await s1.locator('.thread__msg .helped__chip--accepted').waitFor({ timeout: 10000 });
} catch (error) {
	await shot(s1, 'DEBUG-A-after-accept');
	const html = await s1
		.locator('.my-lantern--workshop')
		.first()
		.innerHTML()
		.catch(() => '(no workshop)');
	console.log('DEBUG workshop HTML:', html.slice(0, 3000));
	throw error;
}
const decisionLeft = await s1.getByRole('button', { name: /^אשלב את הרעיון$/ }).count();
eq('adopted imp no longer asks for a decision', decisionLeft, 0);
await s1.waitForSelector('.chat-drawer', { timeout: 5000 });
// The accept → tick → save contract is the least self-evident mechanic in
// the game; on the first accept it is spelled out where the work happens
await s1.locator('.weave-coach').waitFor({ timeout: 5000 });
console.log('   ✓ A COACH MARK:', (await s1.locator('.weave-coach__text').textContent()).trim().slice(0, 60), '…');
await shot(s1, '02-A-tray-and-coach');

await s2.waitForSelector('.celebration', { timeout: 15000 });
const acceptMsg = await s2.locator('.celebration__message').textContent();
console.log('B CELEBRATION (accepted):', acceptMsg.trim());
if (!acceptMsg.includes('+1')) fail('accepted celebration does not name +1');
// The one good-news moment with no action button must still say what's next
const hint = await s2.locator('.celebration__hint').textContent();
console.log('   ✓ B ACCEPTED HINT:', hint.trim());
if (!hint.includes('+2')) fail(`accepted hint does not teach the +2 rung: ${hint}`);
// Accessibility: it is a real dialog and focus is on the action
const dialogRole = await s2.locator('.celebration__card').getAttribute('role');
eq('celebration role', dialogRole, 'alertdialog');
const focused = await s2.evaluate(() => document.activeElement?.className ?? '');
if (!focused.includes('btn')) fail(`celebration did not move focus to a button (got "${focused}")`);
console.log('   ✓ celebration moved focus to its primary action');
await shot(s2, '03-B-celebration-accepted');
// Escape must close it — a modal you can only dismiss with a mouse is a trap
await s2.keyboard.press('Escape');
await s2.locator('.celebration').waitFor({ state: 'detached', timeout: 5000 });
console.log('   ✓ Escape dismissed the celebration');

const afterAccept = await waitForPoints(
	'S2',
	s2,
	(p) => p.helping >= before2.helping + 1,
	'the accept credit',
);
console.log('S2(B) points after accept:', afterAccept);
eq('B helping after accept', afterAccept.helping, before2.helping + 1);

// ---------- Phase C: B declines A's imp → free, and the card retires ----------
step('PHASE C: B declines → quiet toast, NO points cost, card retires');
const before1 = await points('S1', s1);
console.log('S1(A) points before decline:', before1);
await clearCelebration(s2);
await s2.getByRole('button', { name: /^לא תודה$/ }).click();
// Other toasts (e.g. helped-improved) may share the stack — find OURS
const declinedToast = s1.locator('.toast__text', { hasText: 'לא אומץ' });
await declinedToast.waitFor({ timeout: 15000 });
const declinedText = (await declinedToast.textContent()).trim();
console.log('A TOAST (declined):', declinedText);
// The penalty was regressive — the floor exempted spammers and taxed only
// productive helpers — so it is gone, and the copy must not name a cost
if (/0\.25|−|\-0/.test(declinedText)) fail(`declined toast still names a penalty: ${declinedText}`);
await shot(s1, '04-A-declined-toast');
await s1.waitForTimeout(3000); // a penalty would have landed by now
const afterDecline = await points('S1', s1);
console.log('S1(A) points after decline:', afterDecline);
eq('A helping unchanged by decline', afterDecline.helping, before1.helping);
eq('A total unchanged by decline', afterDecline.total, before1.total);
// The conversation keeps its record: the declined message stays in the
// thread wearing a muted status chip, and no decision buttons remain.
await openDock(s2);
const receivedHead = s2.locator('button.workbench__head', { hasText: 'הצעות שיפור' }).first();
if ((await receivedHead.getAttribute('aria-expanded')) === 'false') await receivedHead.click();
await s2.waitForSelector('.thread__msg .helped__chip--declined', { timeout: 10000 });
console.log(
	'   ✓ B WORKSHOP declined chip:',
	(await s2.locator('.thread__msg .helped__chip--declined').textContent()).trim(),
);
eq(
	'declined imp no longer asks for a decision',
	await s2.getByRole('button', { name: /^לא תודה$/ }).count(),
	0,
);
// Hand the room back before B is asked to act in it again
await closeDock(s2);

// ---------- Phase D: A weaves + saves → B +2, A +1 for the integration ----------
step('PHASE D: A ticks woven + saves → B +2, A +1 integration credit');
await openDock(s1);
const trayBefore = await s1.locator('.chat-drawer__item').count();
eq('tray holds the pending idea', trayBefore, 1);
if ((await s1.locator('.archive').count()) !== 0) fail('archive shown before anything was woven');
// Custom checkbox: the styled span covers the input — click the label
await s1.locator('label.chat-drawer__check').first().click();
const ticked = await s1.locator('.chat-drawer__check-input').first().isChecked();
if (!ticked) fail('woven tick did not register');
// Actually WEAVE it — that is what the tick claims and what the coach mark
// instructs. The server stamps the "bridge power before my edit" baseline
// on a real text change, so a tick-only save must not reset it.
await s1
	.locator('textarea.my-lantern__textarea')
	.fill(
		'נכריז על מלוכה חוקתית: המלך יישאר סמל מאחד אך אספה נבחרת תחוקק ותאשר מסים, ' +
			'ולצד זה ייקבע לוח זמנים ברור לביטול זכויות היתר של האצולה.',
	);
const beforeWeave1 = await points('S1', s1);
await s1.getByRole('button', { name: /^עדכון ההצעה$/ }).click();
// A gets their own "proposal improved" glitter — dismiss it
await s1.waitForSelector('.celebration', { timeout: 10000 });
await s1.locator('.celebration button.btn--primary').click();

await s2.waitForSelector('.celebration', { timeout: 15000 });
const wovenMsg = await s2.locator('.celebration__message').textContent();
console.log('B CELEBRATION (woven):', wovenMsg.trim());
if (!wovenMsg.includes('+2')) fail('woven celebration does not name +2');
const buttons = await s2.locator('.celebration button').count();
if (buttons < 2) fail('woven celebration missing the travel button');
await shot(s2, '05-B-celebration-woven');
// Primary = the continuation: travel to the improved proposal
await s2.locator('.celebration button.btn--primary').click();
await s2.waitForSelector('.helped__item', { timeout: 10000 });
const spotlit = await s2.locator('.helped__item--spotlight').count();
console.log('B landed on helped item, spotlight:', spotlit === 1 ? 'YES' : 'no');
await shot(s2, '06-B-helped-spotlight');

// Doc notification #5: the helped proposal visibly moved — ✨ marker on
// the card, and the status chip records the idea as woven in
await s2.locator('.helped__improved').waitFor({ timeout: 10000 });
console.log('B SEES ✨:', (await s2.locator('.helped__improved').textContent()).trim());
const chip = await s2.locator('.helped__chip').first().textContent();
if (!chip.includes('שולב')) fail(`expected woven-in chip, got: ${chip}`);
console.log('   ✓ B SUGGESTION CHIP:', chip.trim());

const afterWoven = await waitForPoints(
	'S2',
	s2,
	(p) => p.helping >= before2.helping + 3,
	'the woven credit',
);
console.log('S2(B) points after woven:', afterWoven);
eq('B helping total for a landed idea', afterWoven.helping, before2.helping + 3);
// The AUTHOR's side of the economy: weaving a classmate's idea is real
// editorial labor and used to be entirely unpaid
const afterWeave1 = await waitForPoints(
	'S1',
	s1,
	(p) => p.proposals >= beforeWeave1.proposals + 1,
	"the author's integration credit",
);
console.log('S1(A) points after weaving:', afterWeave1);
eq('A integration credit', afterWeave1.proposals, beforeWeave1.proposals + 1);

// The woven idea LEAVES the working tray and lands in the archive
await openDock(s1);
await s1.locator('.archive__toggle').waitFor({ timeout: 15000 });
eq('tray emptied after weaving', await s1.locator('.chat-drawer__item').count(), 0);
eq('archive badge', (await s1.locator('.archive__count').textContent()).trim(), '1');
await s1.locator('.archive__toggle').click();
await s1.locator('.archive__item').first().waitFor({ timeout: 5000 });
console.log('A ARCHIVE CREDIT:', (await s1.locator('.archive__from').first().textContent()).trim());
await shot(s1, '07-A-archive-open');

// ---------- Phase E: B re-rates → ack, marker clears, bridge pays out ----------
step('PHASE E: B re-rates → the loop closes, and the bridging ladder pays');
await s2.locator('.helped__item .rate-scale--compact .rate-scale__option--strong-for').click();
console.log('B re-rated: strong-for');
// Step 5 was the one handoff with NO feedback at all — now it answers
await s2.locator('.helped__rerate-ack').waitFor({ timeout: 5000 });
console.log('   ✓ B RE-RATE ACK:', (await s2.locator('.helped__rerate-ack').textContent()).trim());
// ...and the "take another look" marker stops nagging someone who just did
await s2.locator('.helped__improved').waitFor({ state: 'detached', timeout: 10000 });
console.log('   ✓ ✨ marker cleared once B re-rated (no more stale nagging)');
await shot(s2, '08-B-rerate-acked');

// The bridging bonus: unreachable in a small class before the confidence
// ramp learned how many cross-camp students actually exist
const bridgeCeleb = s1.locator('.celebration__message', { hasText: 'גישרה' });
await bridgeCeleb.waitFor({ timeout: 20000 });
console.log('A CELEBRATION (bridging):', (await bridgeCeleb.textContent()).trim());
await shot(s1, '09-A-bridging-celebration');
await s1.locator('.celebration button.btn--ghost').click();
const afterBridge1 = await waitForPoints(
	'S1',
	s1,
	(p) => p.proposals >= afterWeave1.proposals + 15,
	'the bridging bonus',
);
console.log('S1(A) points after bridging:', afterBridge1);
eq('A bridging bonus', afterBridge1.proposals, afterWeave1.proposals + 15);

// A's aggregate return signal, measured against a SERVER-stamped baseline.
// It reaches the owner through the collapsed bar first — the sub line is
// the whole point of docking the notebook rather than hiding it.
await openDock(s1);
await s1.waitForSelector('.my-lantern__moved', { timeout: 15000 });
await s1.locator('.my-lantern__moved', { hasText: 'כוח הגשר עלה' }).waitFor({ timeout: 15000 });
const moved = await s1.locator('.my-lantern__moved').textContent();
console.log('A SEES:', moved.trim());
if (!moved.includes('דירוג אחד')) fail(`expected singular ratings-moved copy, got: ${moved}`);
await closeDock(s1);
const movedSub = await s1.locator('.proposal-dock__sub').textContent();
console.log('A SEES ON THE BAR:', movedSub.trim());
if (!movedSub.includes('דירוג')) fail(`ratings-moved never reached the dock bar: ${movedSub}`);
await shot(s1, '10a-A-dock-ratings-moved');
// The baseline used to live in sessionStorage — one refresh erased the
// direction and left a bare count. It must now survive a reload.
await s1.reload({ waitUntil: 'domcontentloaded' });
// A reload lands on a COLLAPSED dock: open is never persisted, because
// collapsed-by-default is the feature
await s1.waitForSelector('.proposal-dock__bar', { timeout: 20000 });
eq('dock starts collapsed after a reload', await s1.locator('.proposal-dock--open').count(), 0);
await openDock(s1);
await s1.locator('.my-lantern__moved', { hasText: 'כוח הגשר עלה' }).waitFor({ timeout: 20000 });
console.log('   ✓ direction SURVIVED a full page reload (server-stamped baseline)');
await shot(s1, '10-A-ratings-moved');
await closeDock(s1);

// ---------- Phase F: the structural spam guard ----------
step('PHASE F: open-ideas cap replaces the points penalty');
await s2.locator('.delib-nav__item--peer').click();
await s2.waitForSelector('.helped__item', { timeout: 10000 });
// Follow-ups are thread messages now. Plain chat is uncapped conversation;
// only messages MARKED as improvement ideas occupy an open-idea slot — so
// the cap test must tick the mark-as-idea toggle each time.
const followUpIdea = async (page, text) => {
	const toggle = page.locator('.helped__item .thread__kind-toggle input').first();
	if (!(await toggle.isChecked())) await toggle.click();
	await page.locator('.helped__item .thread__input').first().fill(text);
	await page.locator('.helped__item .thread__composer button.btn--secondary').first().click();
	await page.waitForTimeout(1200);
};
await followUpIdea(s2, 'אפשר להוסיף סעיף שמבטיח שהאספה תתכנס לפחות פעמיים בשנה.');
await followUpIdea(s2, 'ואולי גם לקבוע מי מכריע במקרה של תיקו בהצבעה.');
// Two unresolved ideas on one proposal is the ceiling — and it is STATED,
// not enforced silently
const capToggle = s2.locator('.helped__item .thread__kind-toggle input').first();
if (!(await capToggle.isChecked())) await capToggle.click();
await s2.locator('.helped__item .thread__input').first().fill('ניסיון לשלוח רעיון שלישי בזמן ששניים ממתינים.');
await s2.locator('.helped__item .action-hint').waitFor({ timeout: 10000 });
console.log('   ✓ B CAP HINT:', (await s2.locator('.helped__item .action-hint').first().textContent()).trim());
const sendDisabled = await s2
	.locator('.helped__item .thread__composer button.btn--secondary')
	.first()
	.isDisabled();
eq('third open idea blocked', sendDisabled, true);
// ...and unticking the idea mark turns the same box back into free chat
await capToggle.click();
// The hint retires with the mark — wait for the redraw before reading the button
await s2
	.locator('.helped__item .action-hint')
	.first()
	.waitFor({ state: 'detached', timeout: 5000 });
const chatSendDisabled = await s2
	.locator('.helped__item .thread__composer button.btn--secondary')
	.first()
	.isDisabled();
eq('plain chat is never capped', chatSendDisabled, false);
await shot(s2, '11-B-open-ideas-cap');

// ---------- Phase G: the ledger the economy was missing ----------
step('PHASE G: results — every student finally sees their own total');
const finalS1 = await points('S1', s1);
const finalS2 = await points('S2', s2);
console.log('FINAL S1(A):', finalS1);
console.log('FINAL S2(B):', finalS2);

step('TEACHER advances → RESULTS');
await advance();
await teacher.waitForTimeout(3000);
for (const [page, label, expected] of [
	[s1, 'S1(A)', finalS1],
	[s2, 'S2(B)', finalS2],
]) {
	await page.waitForSelector('.results__mine', { timeout: 30000 });
	const shown = (await page.locator('.results__total--mine').textContent()).trim();
	console.log(`${label} PERSONAL RECAP total on screen:`, shown);
	// Quarter balances must render exactly — flooring makes students "lose"
	// points they watched themselves earn
	eq(`${label} recap matches Firestore`, Number(shown), expected.total);
	const story = await page.locator('.results__story li').allTextContents();
	console.log(`${label} STORY:`, story.map((s) => s.trim()).join(' | '));
	if (story.length === 0) fail(`${label}: personal recap has no narrative lines`);
}
await shot(s1, '12-A-results-recap');
await shot(s2, '13-B-results-recap');

console.log(
	'\n✅ FULL CYCLE VERIFIED (all three phases)\n' +
		'   Phase 1 (UX)\n' +
		'     · accepted celebration teaches the +2 rung (hint) and is a real dialog\n' +
		'       (alertdialog role, focus moved, Escape closes)\n' +
		'     · actionable toast is a <button> — keyboard-reachable\n' +
		'     · declined cards retire to one muted line; the workshop stays a to-do list\n' +
		'     · re-rate is acknowledged and clears the stale ✨ marker\n' +
		'     · first-accept coach mark explains accept → tick → save\n' +
		'   Phase 2 (economy)\n' +
		'     · first proposal credited (+3) and announced\n' +
		'     · rating the commons credited (+0.5)\n' +
		'     · decline costs nothing; an open-ideas cap guards spam instead\n' +
		'     · author earns the integration credit (+1) for weaving a classmate in\n' +
		'     · graduated bridging ladder paid out in a TWO-student class\n' +
		'   Phase 3 (surfaces)\n' +
		'     · ratings-moved direction survives a reload (server-stamped baseline)\n' +
		'     · personal recap on results matches Firestore, quarters intact',
);
await browser.close();

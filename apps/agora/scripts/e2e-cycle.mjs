/* The improvement feedback cycle, end to end (docs/feedback-cycle.md):
 * A proposes (+3) → B rates (+0.5) + suggests in the conversation → A says
 * thank you (B +1) / no thanks (free) → A improves the text → B re-rates →
 * A sees the aggregate chip, the bridging ladder pays out, and both students
 * read their own ledger on the results screen.
 * Verifies POINTS in Firestore, not just pixels.
 * Run: node scripts/e2e-cycle.mjs (needs emulators + vite on 3009 + seed) */
import { chromium } from '@playwright/test';
import { preflight } from './lib/preflight.mjs';

// Fail in seconds with a readable reason instead of minutes with a stack trace
await preflight();

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

/**
 * The emulator occasionally blips under three concurrent browser contexts, and
 * a run this long must not die on one dropped socket — the fetch is polling,
 * so a retry is exactly as honest as the poll it sits inside.
 */
const ownerFetch = async (path) => {
	let lastError;
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			return await (
				await fetch(`${FS}/${path}`, {
					headers: { Authorization: 'Bearer owner' },
					signal: AbortSignal.timeout(8000),
				})
			).json();
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}
	throw lastError;
};

const browser = await chromium.launch();
const mkPage = async (label) => {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	await page.addInitScript(() => window.localStorage.setItem('agora_lang', 'he'));
	page.on('pageerror', (e) => console.log(`[${label} PAGEERROR]`, e.message.slice(0, 160)));
	// A Mithril render that throws surfaces here, not as a pageerror — and a
	// blank screen with no output is the worst possible failure report
	page.on('console', (m) => {
		if (m.type() === 'error') console.log(`[${label} CONSOLE]`, m.text().slice(0, 160));
	});
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
	const doc = await ownerFetch(`agoraParticipants/${sessionId}--${uid}`);
	const f = doc.fields?.points?.mapValue?.fields ?? {};
	const num = (k) => Number(f[k]?.integerValue ?? f[k]?.doubleValue ?? 0);
	return {
		helping: num('helping'),
		proposals: num('proposals'),
		rating: num('rating'),
		revising: num('revising'),
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

// The received-improvements accordion lives on the MY SCREEN (the dock
// keeps only the pen). It folds itself once nothing is waiting (it is a
// to-do list) — a conversation you want to re-read is one tap in.
const openInbox = async (page) => {
	await closeDock(page);
	await page.locator('.delib-nav__item--mine').click();
	const head = page.locator('.my-screen button.workbench__head').first();
	if ((await head.getAttribute('aria-expanded')) === 'false') await head.click();
	await page.waitForSelector('.my-screen .chat-entry', { timeout: 10000 });
};

// ---------- Phase A: propose (the cold-start credit) ----------
step('PHASE A: proposals — the first draft finally earns something');
const propose = async (page, label, text) => {
	await page.waitForSelector('textarea.write-desk__textarea', { timeout: 15000 });
	await page.locator('textarea.write-desk__textarea').fill(text);
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
	// A below-top rating folds out the gap→composer INVITATION under the
	// scale — the judgment just formed is the improvement funnel's mouth
	await page.locator('.stall--open .gap-prompt').waitFor({ timeout: 5000 });
	console.log(`${label} sees the gap invitation`);
}
// The invitation must never gate: S1 dismisses theirs with one tap, S2
// leaves theirs open — and BOTH continue buttons below must work regardless
await s1.locator('.gap-prompt .text-link').click();
await s1.locator('.gap-prompt').waitFor({ state: 'detached', timeout: 5000 });
console.log('   ✓ gap invitation dismissed with one tap (S1)');
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

// A conversation is a SUB-PAGE now (like Join's option chat): the card
// carries only an indicator, and writing means travelling into the chat and
// coming back out again.
const openThreadFromStall = async (page) => {
	await page.waitForSelector('.stall--open .chat-entry', { timeout: 10000 });
	await page.locator('.stall--open .chat-entry').first().click();
	try {
		await page.waitForSelector('.chat-page__input', { timeout: 10000 });
	} catch (error) {
		await shot(page, 'DEBUG-no-chat-page');
		console.log('DEBUG chat-page count:', await page.locator('.chat-page').count());
		console.log('DEBUG entries:', await page.locator('.stall--open .chat-entry').count());
		console.log(
			'DEBUG shell classes:',
			await page.locator('.shell').first().getAttribute('class').catch(() => '(none)'),
		);
		console.log(
			'DEBUG body head:',
			(await page.locator('body').innerText()).slice(0, 400).replace(/\n/g, ' | '),
		);
		throw error;
	}
};
const sendInChat = async (page, text) => {
	await page.locator('.chat-page__input').fill(text);
	await page.locator('.chat-page__send').click();
	await page.waitForTimeout(800);
};
const leaveChat = async (page) => {
	await page.locator('.chat-page__back').click();
	await page.locator('.chat-page').waitFor({ state: 'detached', timeout: 5000 });
};
const suggest = async (page, label, text) => {
	await clearCelebration(page);
	// The classmates' stalls are a folded row now: open one, then step into
	// its conversation
	await page.waitForSelector('.stall__head', { timeout: 15000 });
	await page.locator('.stall:not(.stall--open) .stall__head').first().click();
	await openThreadFromStall(page);
	await sendInChat(page, text);
	await leaveChat(page);
	console.log(`${label} sent a suggestion`);
};
// B suggests on A's proposal; A suggests on B's (each helps the only other)
await suggest(s2, 'S2(B)', 'כדאי להוסיף לוח זמנים ברור לביטול זכויות היתר של האצולה.');
// The owner must LEARN feedback arrived, without wandering into the
// workshop: an actionable toast, not just a tab badge
const receivedToast = s1.locator('.toast--action', { hasText: 'רעיון לשיפור' });
await receivedToast.waitFor({ timeout: 15000 });
console.log('S1(A) TOAST (received):', (await receivedToast.textContent()).trim());
// Accessibility: the loop's step-1 action must be reachable by keyboard
const toastTag = await receivedToast.evaluate((el) => el.tagName);
eq('received toast is a real button', toastTag, 'BUTTON');
await shot(s1, '01-A-received-toast');
await suggest(s1, 'S1(A)', 'אולי להבטיח ייצוג מסוים לאצולה באספה כדי שירגישו שותפים.');

// Feedback NEVER forces a screen change — it waits as a count on the My
// tab (the dock keeps only the pen since b21fa1cde), and the student
// decides when to look.
const navBadge = s1.locator('.delib-nav__item--mine .delib-nav__badge');
await navBadge.waitFor({ timeout: 10000 });
eq('A My-tab badge', (await navBadge.textContent()).trim(), '1');
eq('feedback did not force the sheet open', await s1.locator('.proposal-dock--open').count(), 0);
await shot(s1, '01b-A-mine-badge-with-news');

// Walk to the My screen, as a student would. There, the received accordion
// is the one that auto-opens (openCount > 0).
await s1.locator('.delib-nav__item--mine').click();
const accordionCount = await s1.locator('.my-screen .workbench__count').first().textContent();
eq('A accordion count', accordionCount.trim(), '1');

const before2 = await points('S2', s2);
console.log('S2(B) points before adoption:', before2);

// ---------- Phase B: A thanks B's idea → B +1 ----------
step("PHASE B: A opens the conversation and says thank you → B's celebration +1");
await clearCelebration(s1);
// The owner's inbox is a list of INDICATORS; the decision lives inside the
// conversation, exactly where the idea was said
await openInbox(s1);
await s1.locator('.my-screen .chat-entry').first().click();
await s1.waitForSelector('.chat-page', { timeout: 10000 });
await shot(s1, '02-A-thread-page');
await s1.locator('.thread__msg .btn--primary').first().click();
// The message STAYS in its conversation (a thread with a hole reads as
// deleted history) — its decision buttons retire and the thanked chip takes
// their place
try {
	await s1.locator('.thread__msg .helped__chip--thanked').waitFor({ timeout: 10000 });
} catch (error) {
	await shot(s1, 'DEBUG-A-after-thanks');
	const html = await s1
		.locator('.chat-page')
		.first()
		.innerHTML()
		.catch(() => '(no chat page)');
	console.log('DEBUG chat page HTML:', html.slice(0, 3000));
	throw error;
}
eq(
	'thanked idea no longer asks for a decision',
	await s1.getByRole('button', { name: /^לא תודה$/ }).count(),
	0,
);
// The thank→pen handoff: the moment 🙏 lands, the editable quote flips open
// with the thanked idea PINNED beside it — the next natural act is weaving
await s1.locator('.chat-page__pinned-quote').waitFor({ timeout: 5000 });
console.log(
	'   ✓ A thank→pen handoff — pinned idea:',
	(await s1.locator('.chat-page__pinned-quote').textContent()).trim().slice(0, 50),
);
eq('the editor opened with the pin', await s1.locator('.chat-page__edit-input').count(), 1);
await shot(s1, '02b-A-thanked');
// Leaving without saving is allowed — the handoff is an invitation too
await s1.locator('.chat-page__edit .btn--ghost').click();
await leaveChat(s1);

await s2.waitForSelector('.celebration', { timeout: 15000 });
const thankMsg = await s2.locator('.celebration__message').textContent();
console.log('B CELEBRATION (thanked):', thankMsg.trim());
if (!thankMsg.includes('+1')) fail('thank-you celebration does not name +1');
// Accessibility: it is a real dialog and focus is on the action
const dialogRole = await s2.locator('.celebration__card').getAttribute('role');
eq('celebration role', dialogRole, 'alertdialog');
const focused = await s2.evaluate(() => document.activeElement?.className ?? '');
if (!focused.includes('btn')) fail(`celebration did not move focus to a button (got "${focused}")`);
console.log('   ✓ celebration moved focus to its primary action');
await shot(s2, '03-B-celebration-thanked');
// Escape must close it — a modal you can only dismiss with a mouse is a trap
await s2.keyboard.press('Escape');
await s2.locator('.celebration').waitFor({ state: 'detached', timeout: 5000 });
console.log('   ✓ Escape dismissed the celebration');

const afterThanks = await waitForPoints(
	'S2',
	s2,
	(p) => p.helping >= before2.helping + 1,
	'the thank-you credit',
);
console.log('S2(B) points after the thank-you:', afterThanks);
eq('B helping after the thank-you', afterThanks.helping, before2.helping + 1);

// ---------- Phase C: B declines A's imp → free, and the card retires ----------
step('PHASE C: B declines → quiet toast, NO points cost, card retires');
const before1 = await points('S1', s1);
console.log('S1(A) points before decline:', before1);
await clearCelebration(s2);
// Same door as the thank-you: the decision is taken inside the conversation
await openInbox(s2);
await s2.locator('.my-screen .chat-entry').first().click();
await s2.waitForSelector('.chat-page', { timeout: 10000 });
await s2.getByRole('button', { name: /^לא תודה$/ }).click();
// Other toasts (e.g. helped-improved) may share the stack — find OURS.
// The decline is a DOOR now, not a dead end: owner-authorship framing
// ("they went a different direction"), and the toast itself is a button
// that walks the freed idea slot back into the market.
const declinedToast = s1.locator('.toast--action', { hasText: 'דוכן אחר' });
await declinedToast.waitFor({ timeout: 15000 });
const declinedText = (await declinedToast.textContent()).trim();
console.log('A TOAST (declined):', declinedText);
eq(
	'declined toast is a real button (the re-entry ramp)',
	await declinedToast.evaluate((el) => el.tagName),
	'BUTTON',
);
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
await s2.waitForSelector('.thread__msg .helped__chip--declined', { timeout: 10000 });
console.log(
	'   ✓ B CHAT declined chip:',
	(await s2.locator('.thread__msg .helped__chip--declined').textContent()).trim(),
);
eq(
	'declined imp no longer asks for a decision',
	await s2.getByRole('button', { name: /^לא תודה$/ }).count(),
	0,
);
// Hand the room back before B is asked to act in it again
await leaveChat(s2);
await closeDock(s2);

// ---------- Phase D: A improves the text → B is invited back ----------
step('PHASE D: A rewrites the proposal with the idea in it → B sees ✨');
await openDock(s1);
// The server stamps the "bridge power before my edit" baseline on a real
// text change, which is what the direction chip in Phase E reads
await s1
	.locator('textarea.my-lantern__textarea')
	.fill(
		'נכריז על מלוכה חוקתית: המלך יישאר סמל מאחד אך אספה נבחרת תחוקק ותאשר מסים, ' +
			'ולצד זה ייקבע לוח זמנים ברור לביטול זכויות היתר של האצולה.',
	);
await s1.getByRole('button', { name: /^עדכון ההצעה$/ }).click();
// The save itself is QUIET now: the button flips to "נשמר" and no glitter
// fires on the keystroke. Whether the save deserved a celebration is the
// SERVER's verdict — and this one earns twice: the first credited revision
// (+1: real text change after B's rating) and the thank-then-revise weave
// (+1: B was thanked in Phase B). Both arrive as notifications a beat later.
await s1.getByRole('button', { name: /נשמר/ }).waitFor({ timeout: 10000 });
console.log('   ✓ A save acknowledged quietly (no instant glitter)');
await s1.waitForSelector('.celebration', { timeout: 25000 });
console.log(
	'A CELEBRATION (server-credited):',
	(await s1.locator('.celebration__message').textContent()).trim(),
);
const afterRevision = await waitForPoints(
	'S1',
	s1,
	(p) => p.revising >= 1 && p.proposals >= before1.proposals + 1,
	'the revision + weave credits',
);
console.log('S1(A) points after the revision:', afterRevision);
eq('A revision credit (feedback-gated, first)', afterRevision.revising, 1);
eq('A weave credit for the thanked idea', afterRevision.proposals, before1.proposals + 1);
await clearCelebration(s1, 'S1(A)');
await closeDock(s1);

// The helped proposal visibly moved — B is told, on the card they helped
await clearCelebration(s2);
await s2.locator('.delib-nav__item--peer').click();
await s2.waitForSelector('.stall__head', { timeout: 15000 });
if ((await s2.locator('.stall--open').count()) === 0) {
	await s2.locator('.stall:not(.stall--open) .stall__head').first().click();
}
// The card B helped now invites them back — and because A said thank you,
// the invitation is the PERSONAL one ("your idea is in there")
const reinvite = s2.locator('.stall--open .stall__reinvite');
await reinvite.waitFor({ timeout: 20000 });
console.log('B SEES ✨:', (await reinvite.textContent()).trim());
eq(
	'the re-invitation is the personal one',
	await s2.locator('.stall__reinvite--mine').count(),
	1,
);
await shot(s2, '06-B-helped-improved');

// ---------- Phase D2: the same invitation, inside the conversation ----------
step('PHASE D2: the thread invites B to re-weigh — behind a read gate');
await openThreadFromStall(s2);
const reweigh = s2.locator('.chat-system--reweigh');
await reweigh.waitFor({ timeout: 15000 });
console.log('B SEES IN THE THREAD:', (await reweigh.textContent()).trim().replace(/\s+/g, ' '));
// The diff is the evidence, and it must be ABOVE the invitation
eq('the edit diff is in the thread', await s2.locator('.chat-system__diff').count(), 1);
// The scale does not exist until the student says they read the change:
// a rating asked for next to "they used your idea" is a rating bought
eq('the scale is gated', await s2.locator('.chat-system--reweigh .rate-scale').count(), 0);
await s2.locator('.chat-system__gate .btn--primary').click();
await s2.locator('.chat-system--reweigh .rate-scale').waitFor({ timeout: 5000 });
console.log('   ✓ the scale appears only after "I read the change"');
// ...and it arrives BLANK: marking the face I gave last time, right where I
// am asked for another, is an anchor on the number the game is scored by
eq(
	'the gated scale carries no previous answer',
	await s2.locator('.chat-system--reweigh .rate-scale__option--selected').count(),
	0,
);
await shot(s2, '07-B-thread-reweigh');
// Leave without answering — Phase E answers from the square instead, which
// is how we learn the invitation clears wherever the rating happens
await leaveChat(s2);

// ---------- Phase E: B re-rates → ack, marker clears, bridge pays out ----------
step('PHASE E: B re-rates → the loop closes, and the bridging ladder pays');
await s2.locator('.stall--open .rate-scale--compact .rate-scale__option--strong-for').click();
console.log('B re-rated: strong-for');
// Step 5 was the one handoff with NO feedback at all — now it answers
await s2.locator('.helped__rerate-ack').waitFor({ timeout: 5000 });
console.log('   ✓ B RE-RATE ACK:', (await s2.locator('.helped__rerate-ack').textContent()).trim());
// ...and the "take another look" marker stops nagging someone who just did
await s2.locator('.stall__reinvite').waitFor({ state: 'detached', timeout: 10000 });
console.log('   ✓ ✨ marker cleared once B re-rated (no more stale nagging)');
await shot(s2, '08-B-rerate-acked');

// The bridging score after B's strong-for: cross-camp warmth(1)=1 at full
// confidence → 0.65×100 = 65, and NO own-camp raters exist in a two-student
// class — so under the re-pointed thresholds (tier 1 = 70, commit 6a1f70f5a)
// the ladder is honestly out of reach here. Verify the SCORE landed at 65
// and no tier paid; the ladder's payouts live in the bridging unit tests.
const sessionMaxBridging = async () => {
	const list = await ownerFetch('agoraScores?pageSize=300');

	return Math.max(
		0,
		...(list.documents ?? [])
			.filter((doc) => doc.fields?.sessionId?.stringValue === sessionId)
			.map((doc) =>
				Number(
					doc.fields?.bridgingScore?.doubleValue ??
						doc.fields?.bridgingScore?.integerValue ??
						0,
				),
			),
	);
};
const deadline = Date.now() + 20000;
let bridging = 0;
for (;;) {
	bridging = await sessionMaxBridging();
	if (bridging >= 65 || Date.now() > deadline) break;
	await s1.waitForTimeout(700);
}
eq('A bridging score after the cross-camp strong-for', Math.round(bridging), 65);
const afterBridge1 = await points('S1', s1);
console.log('S1(A) points after the re-rate:', afterBridge1);
eq('no tier paid below 70 (weave still the only proposals delta)', afterBridge1.proposals, before1.proposals + 1);

// A's aggregate return signal, measured against a SERVER-stamped baseline.
// It lives on the My screen — the owner's reading room.
await closeDock(s1);
await s1.locator('.delib-nav__item--mine').click();
await s1.waitForSelector('.my-lantern__moved', { timeout: 15000 });
// The class AVERAGE, not the bridging score: bridging is blended and damped
// enough to round a real change of mind away to zero, and "moved by 0" is the
// one thing this line must never say to a student whose revision worked
await s1
	.locator('.my-lantern__moved', { hasText: 'התמיכה הממוצעת עלתה' })
	.waitFor({ timeout: 15000 });
const moved = await s1.locator('.my-lantern__moved').textContent();
console.log('A SEES:', moved.trim());
if (!moved.includes('דירוג אחד')) fail(`expected singular ratings-moved copy, got: ${moved}`);
// The aggregate line grew a MEMORY: the revision journey strip — where each
// past version stood, ending at the live number
const journey = s1.locator('.journey');
await journey.waitFor({ timeout: 15000 });
console.log('A JOURNEY STRIP:', (await journey.innerText()).replace(/\s+/g, ' ').trim());
eq('journey shows past version + now', await s1.locator('.journey__step').count() >= 2, true);
await shot(s1, '10a-A-journey-strip');
// The baseline used to live in sessionStorage — one refresh erased the
// direction and left a bare count. It must now survive a reload.
await s1.reload({ waitUntil: 'domcontentloaded' });
// A reload lands on a COLLAPSED dock: open is never persisted, because
// collapsed-by-default is the feature
await s1.waitForSelector('.proposal-dock__bar', { timeout: 20000 });
eq('dock starts collapsed after a reload', await s1.locator('.proposal-dock--open').count(), 0);
// A reload lands wherever the WORK is; the My screen is one tap away
await s1.locator('.delib-nav__item--mine').click();
await s1
	.locator('.my-lantern__moved', { hasText: 'התמיכה הממוצעת עלתה' })
	.waitFor({ timeout: 20000 });
console.log('   ✓ direction SURVIVED a full page reload (server-stamped baseline)');
await shot(s1, '10-A-ratings-moved');

// ---------- Phase E2: the loop's two ends meet in the conversation ----------
step('PHASE E2: the invitation clears, the circle is named, and A is told');
await s2.locator('.delib-nav__item--peer').click();
await s2.waitForSelector('.stall--open', { timeout: 10000 });
await openThreadFromStall(s2);
// The rating happened out on the square, and the thread's invitation is
// gone anyway: the moment is derived from state, not fired as an event
eq(
	'the thread invitation cleared with the square rating',
	await s2.locator('.chat-system--reweigh').count(),
	0,
);
console.log('   ✓ answering anywhere clears the invitation everywhere');
// An idea went out, was thanked, the text changed, and it was weighed again
const roundTrip = s2.locator('.chat-system--roundtrip');
await roundTrip.waitFor({ timeout: 15000 });
console.log('B SEES:', (await roundTrip.textContent()).trim().replace(/\s+/g, ' '));
await shot(s2, '07b-B-round-trip');
await leaveChat(s2);

// A's side of the very same conversation: the class answered the revision.
// The owner reaches a thread through the inbox, not the square.
await clearCelebration(s1);
await openInbox(s1);
await s1.locator('.my-screen .chat-entry').first().click();
await s1.waitForSelector('.chat-page', { timeout: 10000 });
const scoreLine = s1.locator('.chat-system--score');
await scoreLine.waitFor({ timeout: 15000 });
const scoreText = (await scoreLine.textContent()).trim().replace(/\s+/g, ' ');
console.log('A SEES IN THE THREAD:', scoreText);
// The class owns the number, in both directions — and the helper is only
// ever named on the ACT that led to the revision
if (!scoreText.includes('דירג')) fail(`the score line never reported the class: ${scoreText}`);
// …and it says WHAT the class did to the reading, not only that it acted
if (!scoreText.includes('התמיכה הממוצעת')) {
	fail(`the score line never reported the class average: ${scoreText}`);
}
await shot(s1, '07c-A-thread-score-moved');
await leaveChat(s1);
await closeDock(s1);

// ---------- Phase F: one open idea at a time, no toggle to get wrong ----------
step('PHASE F: the conversation decides — idea while the desk is clear, chat while it is not');
await s2.locator('.delib-nav__item--peer').click();
await s2.waitForSelector('.stall--open', { timeout: 10000 });
await openThreadFromStall(s2);
// B's first idea was answered (thanked) in Phase B, so the box offers the
// NEXT idea — helping stays earnable lap after lap
const sendLabel = () => s2.locator('.chat-page__send').textContent();
if (!(await sendLabel()).includes('שיפור')) {
	fail(`expected the box to offer an idea after the last one was answered: ${await sendLabel()}`);
}
console.log('   ✓ B BOX OFFERS AN IDEA:', (await sendLabel()).trim());
await sendInChat(s2, 'אפשר להוסיף סעיף שמבטיח שהאספה תתכנס לפחות פעמיים בשנה.');
// ...and while that one waits on the author, the same box is plain talk —
// a conversation can never pile unanswered work on someone's desk
await s2.locator('.chat-page__send.btn--secondary').waitFor({ timeout: 10000 });
console.log('   ✓ B BOX IS NOW CHAT:', (await sendLabel()).trim());
await s2.locator('.chat-page__input').fill('ואם זה מסובך מדי, אפשר גם רק פעם בשנה.');
// Mithril redraws on the next frame — poll for the armed button rather than
// reading the attribute in the same tick as the keystroke
await s2
	.locator('.chat-page__send:not([disabled])')
	.waitFor({ timeout: 5000 })
	.catch(() => fail('plain chat was blocked — the box must never cap conversation'));
console.log('   ✓ plain chat is never blocked');
await shot(s2, '11-B-one-open-idea');
await leaveChat(s2);

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
		'     · the conversation is a sub-page: card indicator in, back button out\n' +
		'     · thank-you celebration is a real dialog\n' +
		'       (alertdialog role, focus moved, Escape closes)\n' +
		'     · actionable toast is a <button> — keyboard-reachable\n' +
		'     · declined ideas retire to one muted line inside their conversation\n' +
		'     · re-rate is acknowledged and clears the stale ✨ marker\n' +
		'   Phase 2 (economy)\n' +
		'     · first proposal credited (+3) and announced\n' +
		'     · rating the commons credited (+0.5)\n' +
		'     · a thank-you pays the helper (+1); no thanks costs nothing\n' +
		'     · first credited revision paid (+1, feedback- and delta-gated)\n' +
		'     · thank-then-revise weave paid the author (+1 per distinct helper)\n' +
		'     · one open idea per conversation — the box switches to chat by itself\n' +
		'     · bridging pipeline verified to 65 (tier honestly out of reach for 2 students)\n' +
		'   Phase 3 (surfaces)\n' +
		'     · ratings-moved direction survives a reload (server-stamped baseline)\n' +
		'     · personal recap on results matches Firestore, quarters intact',
);
await browser.close();

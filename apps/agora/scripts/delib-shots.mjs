/* Deliberation-screens screenshot loop.
 * Drives teacher + 2 students straight to the deliberation stage and shoots
 * every screen of the lap at phone size — the geometry the students actually
 * play on. Run: node scripts/delib-shots.mjs [outDir]
 * Needs: emulators + vite on 3009 + seeded demo package.
 */
import { chromium } from '@playwright/test';
import { passNameDoor } from './lib/e2e.mjs';
import { mkdirSync } from 'node:fs';
import { auditPage, report } from './contrast-audit.mjs';
import { auditType, summarise } from './type-audit.mjs';
import { preflight } from './lib/preflight.mjs';

// Fail in seconds with a readable reason instead of minutes with a stack trace
await preflight();

const BASE = 'http://localhost:3009';
const SHOTS = process.argv[2] ?? 'delib-shots';
mkdirSync(SHOTS, { recursive: true });
const step = (msg) => console.log(`\n=== ${msg}`);

const browser = await chromium.launch();
// AGORA_WIDTH overrides the phone width — 360 is the narrow-Android floor and
// sits BELOW the app's own 380px breakpoint, so it exercises rules 390 never
// reaches. AGORA_VIEWPORT=desktop still means the wide shot.
const VIEWPORT =
	process.env.AGORA_VIEWPORT === 'desktop'
		? { width: 1280, height: 900 }
		: { width: Number(process.env.AGORA_WIDTH) || 390, height: 844 };
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
// ...and we measure the TYPE on the same pass. At 390px the question stops
// being "can this be seen" and starts being "is it big enough to read" —
// independent failures, so both run on every screen.
const typeAudits = [];
const shot = async (page, name) => {
	audits.push(await auditPage(page, { label: name }));
	typeAudits.push(await auditType(page, { label: name }));

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
// A FRESH teacher every run. Reusing one sub means the second run signs in as
// a teacher who already owns an open session, and the home screen offers to
// resume it instead of listing packages — which reads exactly like
// "provisioning never landed" and is not that at all.
const TEACHER_SUB = `shots-teacher-${Date.now().toString(36)}`;
await teacher.evaluate(
	(sub) =>
		window.__agoraDevSignIn({
			sub,
			email: `${sub}@example.com`,
			name: 'Shots Teacher',
		}),
	TEACHER_SUB,
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
	// The sign-in has to settle into IndexedDB before a reload can pick it
	// up, and provisioning is a Firestore round trip after that
	await teacher.waitForTimeout(6000);
	await teacher.reload({ waitUntil: 'domcontentloaded' });
	topicReady = await teacher
		.waitForSelector('text=המהפכה הצרפתית', { timeout: 25000 })
		.then(() => true)
		.catch(() => false);
}
if (!topicReady) throw new Error('teacher home never listed a topic package');
await teacher.locator('text=המהפכה הצרפתית').first().click();
await teacher.locator('button.btn.btn--primary.btn--full.btn--lg').last().click();
// Choosing a scenario no longer opens a session — it opens the stage plan,
// where the teacher orders the journey first. The walk to a live session is
// two clicks now, and the same CTA carries both of them.
await teacher.waitForURL(/teach\/start/, { timeout: 20000 });
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
	await passNameDoor(page);
	await page.waitForSelector('.lobby__name', { timeout: 20000 });
	console.log(`${label} joined as`, await page.locator('.lobby__name').textContent());
}
// The stages BEFORE deliberation are played through blind by this driver, but
// a student reads them on the same phone — so they are measured on the way
// past even though the interesting screenshots are all further in.
await shot(teacher, '00a-teacher-session');
await shot(s1, '00b-student-lobby');

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

// The perspectives stage does not end with its scenes: it hands the student a
// value question PER CHARACTER, and the stage only counts as finished once
// every one has an answer. A driver that only clicks scene buttons stalls
// here forever waiting for a class-progress that will never fill.
const answerValues = async (page, text) => {
	for (let i = 0; i < 6; i++) {
		const box = page.locator('textarea.values__textarea');
		if (await box.count()) {
			await box.fill(`${text} ${i + 1}`);
			await page.locator('button.btn--primary.btn--full.btn--lg').click();
			// Grading is a round trip; the "next character" button only appears
			// once the answer itself has landed
			await page.waitForTimeout(1500);
		}
		const next = page.locator('button.btn--secondary.btn--full');
		if ((await next.count()) === 0) break;
		await next.first().click();
		await page.waitForTimeout(600);
	}
};

const VALUE_ANSWER =
	'הדמות מחזיקה בערך של צדק וכבוד לאדם, ומאמינה שלכל אדם מגיעה זכות להשמיע את קולו.';

step('Fast-forward framing → perspectives → needs');
for (let i = 0; i < 3; i++) {
	await advance();
	await s1.waitForSelector('.scene__text, .scene__title', { timeout: 20000 });
	await shot(s1, `00c-scene-${i}`);
	await Promise.all([clickThroughScenes(s1), clickThroughScenes(s2)]);
	// The needs board, if these scenes ended on one
	if (await s1.locator('.needs-board').count()) await shot(s1, `00d-needs-board-${i}`);
	// The value question, if this stage asks one
	if (await s1.locator('textarea.values__textarea').count()) {
		await shot(s1, `00-values-${i}`);
		await Promise.all([answerValues(s1, VALUE_ANSWER), answerValues(s2, VALUE_ANSWER)]);
		await shot(s1, `00b-values-graded-${i}`);
	}
	await teacher
		.locator('.class-progress__count--all')
		.waitFor({ timeout: 20000 })
		.catch(() => console.log(`  (stage ${i}: class progress never read all-done, continuing)`));
}

step('POSITIONING');
await advance();
const position = async (page, value) => {
	await page.waitForSelector('input.camp-scale__slider', { timeout: 20000 });
	if (page === s1) await shot(s1, '00e-positioning');
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
// A celebration raised by a classmate's arrival is modal and waits for a
// human — it will swallow this click and every one after it
await clearCelebration(s1);
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

// --- 04: MY screen (the workshop: what came back, the elders, the needs)
await s1.locator('.delib-nav__item--mine').click();
await s1.waitForTimeout(800);
await shot(s1, '04-my-screen');
await shotFull(s1, '04b-my-screen-full');

// --- 04c: the dock open over it (the pen, reached from the screen's own
// edit handle — the dock bar opens the same box)
await s1.locator('.my-screen__edit').click();
await s1.waitForTimeout(700);
await shot(s1, '04c-dock-open');
await s1.keyboard.press('Escape');
await s1.waitForTimeout(500);
// ...and back to the square, where the lap's work is
await s1.locator('.delib-nav__item--peer').click();
await s1.waitForTimeout(800);

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

// --- 08: a proposal's detail panel, opened off a dot on the class map. The
// board's smallest type lives in here (raters, callout, why) and nothing
// above this line ever opens it.
const dot = s1.locator('.board__dot, .board__point').first();
if (await dot.count()) {
	await dot.click({ force: true });
	await s1.waitForTimeout(800);
	await shot(s1, '08-board-detail');
}

// --- 09: the teacher's own screens, on a phone. A teacher runs the room off
// whatever is in their pocket, so their chrome is held to the same floor.
await shot(teacher, '09-teacher-deliberation');

console.log('\nSHOTS →', SHOTS);

console.log('\nContrast audit — every captured screen');
const clean = audits.map(report).every(Boolean);

console.log(`\nType audit @${VIEWPORT.width}px — every captured screen`);
const typeClean = summarise(typeAudits);
await browser.close();
if (!clean || !typeClean) process.exitCode = 1;

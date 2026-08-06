/* The improvement feedback cycle, end to end (docs/feedback-cycle.md):
 * A proposes → B rates + suggests → A adopts (B +1) / declines (B −0.25,
 * floored) → A weaves + saves (B +2, celebration travels to re-rate) →
 * B re-rates → A sees the aggregate 📈 chip. Verifies POINTS in Firestore,
 * not just pixels.
 * Run: node scripts/e2e-cycle.mjs (needs emulators + vite on 3009 + seed) */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3009';
const FS = 'http://localhost:8081/v1/projects/freedi-test/databases/(default)/documents';
const SHOTS = 'cycle-shots';
const step = (msg) => console.log(`\n=== ${msg}`);
const fail = (msg) => {
	throw new Error(msg);
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
await teacher.evaluate(
	(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'Cycle Teacher' }),
	runId,
);
// TeacherHome loads topics once, racing the dev sign-in — wait for the
// teacher tier to actually land, then reload so the list is queried as
// the signed-in teacher (which also provisions the default topic)
await teacher.waitForFunction(() => window.__agoraDebug?.()?.user?.tier === 2, { timeout: 20000 });
await teacher.waitForTimeout(2000); // let auth persistence flush before reload
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

// ---------- Phase A: propose, rate, suggest (both directions) ----------
step('PHASE A: proposals, cross-ratings, suggestions');
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

for (const [page, label, option] of [
	[s1, 'S1', '.rate-scale__option--for'],
	[s2, 'S2', '.rate-scale__option--against'],
]) {
	await page.waitForSelector('.rate-scale', { timeout: 15000 });
	await page.locator(option).click();
	// The acknowledgment beat: the press is SEEN (ring + ✓) before the swap
	await page.locator('.rate-scale__option--selected .rate-scale__check').waitFor({ timeout: 5000 });
	console.log(`${label} rated the other's proposal (ack beat shown)`);
}
for (const page of [s1, s2]) {
	await page.getByRole('button', { name: /המשיכו לעזרה/i }).click({ timeout: 10000 });
}

const suggest = async (page, label, text) => {
	await page.waitForSelector('.advice-note textarea.text-input', { timeout: 15000 });
	await page.locator('.advice-note textarea.text-input').fill(text);
	await page.locator('button.btn--primary', { hasText: /שליחת/i }).click();
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
await shot(s1, '00-A-received-toast');
await suggest(s1, 'S1(A)', 'אולי להבטיח ייצוג מסוים לאצולה באספה כדי שירגישו שותפים.');

// Both land on lap 2 "mine" — received accordions auto-open (openCount > 0)
await s1.waitForSelector('.my-lantern--workshop', { timeout: 15000 });
await s2.waitForSelector('.my-lantern--workshop', { timeout: 15000 });

// ---------- Points helper (Firestore REST, emulator owner token) ----------
const points = async (label, page) => {
	// __agoraDebug().user is the whole UserState — the auth user nests inside
	const uid = await page.evaluate(() => window.__agoraDebug?.()?.user?.user?.uid ?? null);
	if (!uid) fail(`${label}: no uid from __agoraDebug`);
	const doc = await (
		await fetch(`${FS}/agoraParticipants/${sessionId}--${uid}`, {
			headers: { Authorization: 'Bearer owner' },
		})
	).json();
	const f = doc.fields?.points?.mapValue?.fields ?? {};
	const num = (k) =>
		Number(f[k]?.integerValue ?? f[k]?.doubleValue ?? 0);
	return { helping: num('helping'), total: num('total') };
};

// Doc notification #1: besides the toast, the passive cues must be there —
// a count on the received accordion and a badge on the "mine" tab
const accordionCount = await s1.locator('.workbench__count').first().textContent();
if (accordionCount.trim() !== '1') fail(`accordion count = ${accordionCount}, expected 1`);
console.log('A PASSIVE CUES: accordion count =', accordionCount.trim());

const before2 = await points('S2', s2);
console.log('S2(B) points before:', before2);

// ---------- Phase B: A adopts B's imp → B +1 ----------
step("PHASE B: A adopts → flight to tray, B's celebration, +1");
await s1.getByRole('button', { name: /^אשלב את הרעיון$/ }).click();
// The card flies to the adoption tray; then it must be OUT of the received
// list and IN the drawer
await s1.waitForTimeout(1800);
const stillListed = await s1.locator('.workshop__item').count();
if (stillListed !== 0) fail(`adopted imp still in received list (${stillListed})`);
await s1.waitForSelector('.chat-drawer', { timeout: 5000 });
console.log('A: imp left the received list and sits in the adoption tray');
await shot(s1, '01-A-tray-after-adopt');

await s2.waitForSelector('.celebration', { timeout: 15000 });
const acceptMsg = await s2.locator('.celebration__message').textContent();
console.log('B CELEBRATION (accepted):', acceptMsg.trim());
if (!acceptMsg.includes('+1')) fail('accepted celebration does not name +1');
await shot(s2, '02-B-celebration-accepted');
await s2.locator('.celebration button.btn--primary').click(); // no action → close

const afterAccept = await points('S2', s2);
console.log('S2(B) points after accept:', afterAccept);
if (afterAccept.helping !== before2.helping + 1) fail(`expected +1 helping, got ${JSON.stringify(afterAccept)}`);

// ---------- Phase C: B declines A's imp → A −0.25 floored at 0 ----------
step("PHASE C: B declines → A's quiet toast, floor at 0");
const before1 = await points('S1', s1);
console.log('S1(A) points before decline:', before1);
await s2.getByRole('button', { name: /^לא תודה$/ }).click();
// Other toasts (e.g. helped-improved) may share the stack — find OURS
const declinedToast = s1.locator('.toast__text', { hasText: 'לא אומץ' });
await declinedToast.waitFor({ timeout: 15000 });
console.log('A TOAST (declined):', (await declinedToast.textContent()).trim());
await shot(s1, '03-A-declined-toast');
const afterDecline = await points('S1', s1);
console.log('S1(A) points after decline:', afterDecline);
const expected1 = Math.max(0, before1.helping - 0.25);
if (afterDecline.helping !== expected1) fail(`expected ${expected1} helping, got ${JSON.stringify(afterDecline)}`);

// ---------- Phase D: A weaves + saves → B +2, travel to re-rate ----------
step('PHASE D: A ticks woven + saves → B +2 and travels to re-rate');
// Custom checkbox: the styled span covers the input — click the label
await s1.locator('label.chat-drawer__check').first().click();
const ticked = await s1.locator('.chat-drawer__check-input').first().isChecked();
if (!ticked) fail('woven tick did not register');
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
await shot(s2, '04-B-celebration-woven');
// Primary = the continuation: travel to the improved proposal
await s2.locator('.celebration button.btn--primary').click();
await s2.waitForSelector('.helped__item', { timeout: 10000 });
const spotlit = await s2.locator('.helped__item--spotlight').count();
console.log('B landed on helped item, spotlight:', spotlit === 1 ? 'YES' : 'no');
await shot(s2, '05-B-helped-spotlight');

// Doc notification #5: the helped proposal visibly moved — ✨ marker on
// the card, and the status chip records the idea as woven in
await s2.locator('.helped__improved').waitFor({ timeout: 10000 });
console.log('B SEES ✨:', (await s2.locator('.helped__improved').textContent()).trim());
const chip = await s2.locator('.helped__chip').first().textContent();
console.log('B SUGGESTION CHIP:', chip.trim());
if (!chip.includes('שולב')) fail(`expected woven-in chip, got: ${chip}`);

const afterWoven = await points('S2', s2);
console.log('S2(B) points after woven:', afterWoven);
if (afterWoven.helping !== before2.helping + 3) fail(`expected +3 total helping, got ${JSON.stringify(afterWoven)}`);

// ---------- Phase E: B re-rates → A sees the aggregate 📈 chip ----------
step('PHASE E: B re-rates the improved text → A sees 📈 ratings-moved');
await s2.locator('.helped__item .rate-scale--compact .rate-scale__option--strong-for').click();
console.log('B re-rated: strong-for');
// Selection grammar: chosen card ringed + ✓ badge, siblings receded
await s2.locator('.rate-scale__option--selected .rate-scale__check').waitFor({ timeout: 10000 });
const hasSel = await s2.locator('.rate-scale--has-selection').count();
if (hasSel === 0) fail('rate scale group missing has-selection state');
console.log('B SELECTION: ring + check badge visible, siblings receded');
await s2.waitForTimeout(700); // let the pulse settle for the screenshot
await shot(s2, '07-B-rerate-selected');
await s1.waitForSelector('.my-lantern__moved', { timeout: 15000 });
// B moved −0.5 → +1: the cross-camp support (and so the bridge) must
// RISE — the chip carries direction on the aggregate, not just a count
await s1
	.locator('.my-lantern__moved', { hasText: 'כוח הגשר עלה' })
	.waitFor({ timeout: 15000 });
const moved = await s1.locator('.my-lantern__moved').textContent();
console.log('A SEES:', moved.trim());
// n=1 → the singular copy, no digit: "דירוג אחד עודכן..."
if (!moved.includes('דירוג אחד')) fail(`expected singular ratings-moved copy, got: ${moved}`);
await shot(s1, '06-A-ratings-moved');

// ---------- Phase F: the ledger's fractional arithmetic ----------
// Phase C only proved the FLOOR (0 stays 0). The doc's −0.25 must also
// bite a real balance: A earns +1, then loses a quarter of it.
step('PHASE F: follow-up adopted (+1), then declined (−0.25) off a real balance');
const followUp = async (page, label, text) => {
	await page.locator('.helped__followup').first().fill(text);
	await page
		.locator('.helped__item button.btn--secondary', { hasText: /שליחת/ })
		.first()
		.click();
	await page.waitForTimeout(1200);
	console.log(`${label} sent a follow-up suggestion`);
};
// A is peeking at their workshop; go to the Others side for the helped card
await s1.locator('.delib-nav__item--peer').click();
await s1.waitForSelector('.helped__item', { timeout: 10000 });
await followUp(s1, 'S1(A)', 'אפשר להוסיף סעיף שמבטיח שהאספה תתכנס לפחות פעמיים בשנה.');

// B adopts it → A +1
await s2.locator('.delib-nav__item').first().click();
await s2.waitForSelector('.my-lantern--workshop', { timeout: 10000 });
await s2.getByRole('button', { name: /^אשלב את הרעיון$/ }).click();
await s1.waitForSelector('.celebration', { timeout: 15000 });
console.log('A CELEBRATION (accepted):', (await s1.locator('.celebration__message').textContent()).trim());
await s1.locator('.celebration button.btn--primary').click();
const afterEarn = await points('S1', s1);
console.log('S1(A) points after earning:', afterEarn);
if (afterEarn.helping !== 1) fail(`expected 1 helping, got ${JSON.stringify(afterEarn)}`);

// A sends another follow-up, B declines it → 1 − 0.25 = 0.75 (fractional!)
await s1.locator('.delib-nav__item--peer').click();
await s1.waitForSelector('.helped__item', { timeout: 10000 });
await followUp(s1, 'S1(A)', 'ואולי גם לקבוע מי מכריע במקרה של תיקו בהצבעה.');
await s2.waitForSelector('.workshop__item', { timeout: 15000 });
await s2.getByRole('button', { name: /^לא תודה$/ }).click();
await s2.waitForTimeout(1500);
const afterQuarter = await points('S1', s1);
console.log('S1(A) points after a real decline:', afterQuarter);
if (afterQuarter.helping !== 0.75) {
	fail(`expected 0.75 helping (1 − 0.25), got ${JSON.stringify(afterQuarter)}`);
}
console.log('LEDGER: fractional deduction lands exactly (0.75) — no rounding, no floor');

console.log(
	'\n✅ FULL CYCLE VERIFIED\n' +
		'   #1 received  → toast + accordion count\n' +
		'   #2 accepted  → celebration, +1\n' +
		'   #3 declined  → quiet toast, floor holds at 0, −0.25 off a real balance = 0.75\n' +
		'   #4 woven in  → celebration +2 (=+3 total), travel button, spotlight\n' +
		'   #5 improved  → ✨ marker + "שולב בנוסח" chip on the helped card\n' +
		'   #6 re-rated  → aggregate chip with direction (bridge power rose)',
);
await browser.close();

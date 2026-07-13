/* Full manual-style walkthrough: teacher UI + 2 student UIs through every stage.
 * Run: node scripts/walkthrough.mjs (needs emulators + vite on 3009 + seeded demo) */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3009';
const SHOTS = 'walkthrough-shots';
const step = (msg) => console.log(`\n=== ${msg}`);

const browser = await chromium.launch();
const mkPage = async (label) => {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => console.log(`[${label} PAGEERROR]`, e.message.slice(0, 160)));
	return page;
};

const teacher = await mkPage('T');
const s1 = await mkPage('S1');
const s2 = await mkPage('S2');
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

// ---------- Teacher: sign in, pick topic, open session ----------
step('TEACHER: sign in + create session');
await teacher.goto(`${BASE}/#!/teach`, { waitUntil: 'domcontentloaded' });
await teacher.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 15000 });
await teacher.evaluate(() =>
	window.__agoraDevSignIn({ sub: 'walk-teacher', email: 'walk-teacher@example.com', name: 'Walkthrough Teacher' })
);
try {
	await teacher.waitForSelector('text=המהפכה הצרפתית', { timeout: 20000 });
} catch {
	// First load after source edits: vite may still be transforming modules.
	// Auth persists in the context — reload and retry once.
	await teacher.reload({ waitUntil: 'domcontentloaded' });
	await teacher.waitForSelector('text=המהפכה הצרפתית', { timeout: 30000 });
}
await teacher.locator('text=המהפכה הצרפתית').first().click();
await teacher.locator('button.btn.btn--primary.btn--full.btn--lg').last().click();
await teacher.waitForURL(/session/, { timeout: 20000 });
await teacher.waitForSelector('.teacher__code', { timeout: 20000 });
const code = (await teacher.locator('.teacher__code').textContent()).replace(/\s/g, '');
if (!code) throw new Error('No join code found on teacher screen');
console.log('JOIN CODE:', code);
const sessionId = teacher.url().split('/').pop();
console.log('SESSION:', sessionId);

// ---------- Students join ----------
step('STUDENTS: join via code');
for (const [page, label] of [[s1, 'S1'], [s2, 'S2']]) {
	await page.goto(`${BASE}/#!/join/${code}`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.lobby__name', { timeout: 15000 });
	console.log(`${label} in lobby as:`, await page.locator('.lobby__name').textContent());
}
await teacher.waitForTimeout(1500);
await shot(teacher, '01-teacher-lobby');
await shot(s1, '02-student-lobby');

const advance = async () => {
	await teacher.locator('button.btn.btn--primary.btn--lg').first().click();
	await teacher.waitForTimeout(1200);
};

// Student-paced scenes: click through dialogue reveals ('···', secondary)
// and continue buttons (primary) until the waiting screen appears
const clickThroughScenes = async (page, label) => {
	for (let i = 0; i < 30; i++) {
		const btn = page.locator('.scene__actions button');
		if ((await btn.count()) === 0) break;
		try {
			await btn.first().click({ timeout: 4000 });
			await page.waitForTimeout(400);
		} catch {
			break;
		}
	}
	console.log(`${label} scenes done`);
};

// ---------- Framing / Perspectives / Needs ----------
for (const stage of ['FRAMING (intro→tunnel→period)', 'PERSPECTIVES (both sides)', 'NEEDS (the pivot)']) {
	step(`TEACHER advances → ${stage}`);
	await advance();
	await s1.waitForSelector('.scene__text, .scene__title', { timeout: 15000 });
	if (stage.startsWith('NEEDS')) await shot(s1, '03-student-needs-scene');
	if (stage.startsWith('PERSPECTIVES')) await shot(s1, '03a-student-perspective');
	await Promise.all([clickThroughScenes(s1, 'S1'), clickThroughScenes(s2, 'S2')]);
}

// After the needs scenes: both sides' needs stay on screen, side by side
try {
	await s1.waitForSelector('.needs-board', { timeout: 10000 });
} catch (e) {
	console.log('S1 BODY:', (await s1.evaluate(() => document.body.innerText)).slice(0, 300));
	await shot(s1, 'debug-needs-board');
	throw e;
}
console.log(
	'NEEDS BOARD COLUMNS:',
	await s1.locator('.needs-board__column').count(),
	'| first need:',
	(await s1.locator('.needs-board__list li').first().textContent()).slice(0, 50)
);
await shot(s1, '04-needs-board');

// ---------- Positioning ----------
step('TEACHER advances → POSITIONING');
await advance();
// Scale ends must show the CHARACTER names (camp in parentheses)
await s1.waitForSelector('.camp-scale', { timeout: 15000 });
const scaleText = await s1.locator('.camp-scale').innerText();
if (!scaleText.includes('הרוזן') || !scaleText.includes('(')) {
	throw new Error(`Camp scale missing character names: ${scaleText.replaceAll('\n', ' | ')}`);
}
console.log('SCALE LABELS:', scaleText.replaceAll('\n', ' | ').slice(0, 120));
const position = async (page, label, value) => {
	await page.waitForSelector('input.camp-scale__slider', { timeout: 15000 });
	await page.locator('input.camp-scale__slider').evaluate((el, v) => {
		el.value = String(v);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
	await page.locator('button.btn--primary.btn--full.btn--lg').click();
	await page.waitForSelector('.lobby__status', { timeout: 10000 });
	console.log(`${label} positioned at ${value}`);
};
await position(s1, 'S1', 15); // left — royalist
await position(s2, 'S2', 85); // right — jacobin
await shot(s1, '05-student-positioned');

// ---------- Deliberation: personal cycles ----------
step('TEACHER advances → DELIBERATION (students cycle: mine → rate → help)');
await advance();

const FS = 'http://localhost:8081/v1/projects/freedi-test/databases/(default)/documents';
const ownerGet = async (path) =>
	(await fetch(`${FS}/${path}`, { headers: { Authorization: 'Bearer owner' } })).json();

const propose = async (page, label, text) => {
	await page.waitForSelector('textarea.values__textarea', { timeout: 15000 });
	await page.locator('textarea.values__textarea').fill(text);
	await page.locator('.delib__actions .btn--primary').click();
	await page.waitForTimeout(1200);
	console.log(`${label} proposed`);
};
// Lap 1, step "mine": the needs board is one tap away while writing
await s1.waitForSelector('.needs-peek__toggle', { timeout: 15000 });
await s1.locator('.needs-peek__toggle').click();
await s1.waitForSelector('.needs-board', { timeout: 5000 });
console.log('NEEDS PEEK opens during propose');
await shot(s1, '06a-needs-peek-in-propose');
await s1.locator('.needs-peek__toggle').click();

await propose(s1, 'S1', 'נכריז על מלוכה חוקתית: המלך יישאר סמל מאחד אך אספה נבחרת תחוקק ותאשר מסים, וזכויות היתר יבוטלו בהדרגה תוך פיצוי הוגן.');
await propose(s2, 'S2', 'נקים אספה לאומית שבה לעם רוב קולות, נבטל את הפטור ממס של האצולה, אך נבטיח לאצילים שמירה על ביטחונם האישי ורכושם הבסיסי.');

// Both auto-advanced to step "rate" — five-level scale, cross-camp ratings
await s1.waitForSelector('.rate-scale', { timeout: 15000 });
const scaleCount = await s1.locator('.rate-scale__option').count();
if (scaleCount !== 5) throw new Error(`Expected 5 rating levels, got ${scaleCount}`);
await shot(s1, '06-rate-step');
await s1.locator('.rate-scale__option--strong-for').click(); // +1
console.log('S1 rated: very much for (+1)');
await s2.waitForSelector('.rate-scale', { timeout: 15000 });
await s2.locator('.rate-scale__option--for').click(); // +0.5 — fractional value through the pipeline
console.log('S2 rated: for (+0.5)');

// Candidates exhausted → continue to helping
for (const [page, label] of [[s1, 'S1'], [s2, 'S2']]) {
	await page.getByRole('button', { name: /Continue to helping|המשיכו לעזרה/i }).click({ timeout: 10000 });
	console.log(`${label} → help step`);
}

// Step "help": each writes a suggestion for the other → advances to lap 2.
// Same workshop skeleton as "mine": scoreboard + neutral hero + tabbed work area
const suggest = async (page, label, text) => {
	await page.waitForSelector('textarea.text-input', { timeout: 15000 });
	console.log(`${label} HELP HERO:`, (await page.locator('.my-lantern--theirs .my-lantern__title').textContent()).slice(0, 50));
	await page.locator('textarea.text-input').fill(text);
	await page.getByRole('button', { name: /Send|שליחת|improvement|שיפור/i }).click();
	await page.waitForTimeout(800);
	console.log(`${label} sent suggestion`);
};
await shot(s2, '05b-workshop-help');
await suggest(s2, 'S2', 'כדאי להוסיף לוח זמנים ברור לביטול זכויות היתר, כדי ששני הצדדים יידעו למה לצפות.');
await suggest(s1, 'S1', 'אולי כדאי להבטיח גם ייצוג לאצולה באספה, כדי שגם הם ירגישו שותפים.');

// Lap 2, step "mine": the workshop skeleton — scoreboard, hero card, tabbed
// work area with the received suggestion in the Feedback tab
try {
	await s1.waitForSelector('.scoreboard', { timeout: 15000 });
} catch (e) {
	console.log('S1 BODY:', (await s1.evaluate(() => document.body.innerText)).slice(0, 400).replaceAll('\n', ' | '));
	await shot(s1, 'debug-lap2-mine');
	throw e;
}
const lapLabel = await s1.locator('.cycle-strip__laps').getAttribute('aria-label');
if (!lapLabel.includes('2')) throw new Error(`Expected lap 2, pips say: ${lapLabel}`);
console.log('S1 ON LAP:', lapLabel);
console.log('S1 bridging:', await s1.locator('.scoreboard__bridge-value').textContent());
console.log('S1 FEEDBACK BADGE:', await s1.locator('.workshop__badge').first().textContent());
await shot(s1, '06a-workshop-mine');

// Accept the suggestion ("I'll implement") → the suggester gets the glitter
// celebration, and the accepter's editor opens to weave the idea in
await s1.getByRole('button', { name: /^(I'll implement|אשלב את הרעיון)$/i }).click();
await s2.waitForSelector('.celebration', { timeout: 15000 });
console.log('S2 CELEBRATION (accepted):', (await s2.locator('.celebration__message').textContent()).slice(0, 60));
console.log('S2 CELEBRATION DETAIL:', (await s2.locator('.celebration__detail').textContent()).slice(0, 60));
await s2.waitForTimeout(600);
await shot(s2, '07b-celebration-accepted');
await s2.locator('.celebration button.btn--primary').click();

// The editor replaced the work area — close it to consult the characters first
await s1.waitForSelector('textarea.values__textarea', { timeout: 10000 });
await s1.getByRole('button', { name: /^(Cancel|ביטול)$/i }).click();

// In-character reviews: character chips expand into the verdict accordion
await s1.waitForSelector('.char-chips__chip', { timeout: 10000 });
const reviewCard = s1.locator('.char-review');
await s1.locator('.char-chips__chip').nth(0).click(); // the Count
await reviewCard.locator('button.btn--secondary').first().click();
await reviewCard.locator('.char-review__bubble').waitFor({ timeout: 90000 });
console.log('COUNT VERDICT:', (await reviewCard.locator('.char-review__bubble').textContent()).slice(0, 100));
await s1.locator('.char-chips__chip').nth(1).click(); // switch accordion to Camille
await reviewCard.locator('button.btn--secondary').first().click();
await reviewCard.locator('.char-review__bubble').waitFor({ timeout: 90000 });
console.log('CAMILLE VERDICT:', (await reviewCard.locator('.char-review__bubble').textContent()).slice(0, 100));
// The Count's chip now carries his score badge
const chipScore = await s1.locator('.char-chips__chip').nth(0).locator('.char-chips__score').textContent();
console.log('COUNT CHIP BADGE:', chipScore);
await shot(s1, '07-character-review');

// Backend: each character rated as 3 camp raters + 1 human rater = {3,4}
await new Promise((r) => setTimeout(r, 4000));
const raterTotal = (d) =>
	['left', 'right', 'center'].reduce(
		(sum, side) =>
			sum + Number(d.fields.perCamp.mapValue.fields[side].mapValue.fields.n.integerValue ?? 0),
		0
	);
// S1's proposal: 2 characters × 3 AI raters + 1 human = 7 raters
const myProposalScore = ((await ownerGet('agoraScores?pageSize=300')).documents ?? []).find(
	(d) => d.fields.sessionId.stringValue === sessionId && raterTotal(d) >= 7
);
if (!myProposalScore) throw new Error('No score doc with 7 raters found');
const campN = (side) =>
	Number(myProposalScore.fields.perCamp.mapValue.fields[side].mapValue.fields.n.integerValue ?? 0);
const ns = [campN('left'), campN('right')].sort();
if (ns[0] !== 3 || ns[1] !== 4)
	throw new Error(`Expected per-camp raters {3,4}, got left=${campN('left')} right=${campN('right')}`);
console.log('PER-CAMP RATERS OK:', { left: campN('left'), right: campN('right') });

// S1 improves their own proposal → glitter, then lands on the rate step of lap 2
await s1.getByRole('button', { name: /Update proposal|עדכון ההצעה/i }).click();
await s1.waitForSelector('textarea.values__textarea', { timeout: 10000 });
await s1
	.locator('textarea.values__textarea')
	.fill('נכריז על מלוכה חוקתית: המלך יישאר סמל מאחד, אספה נבחרת תחוקק ותאשר מסים, זכויות היתר יבוטלו בהדרגה תוך פיצוי הוגן — ותוקם ועדה משותפת לאצולה ולעם שתלווה את המעבר.');
await s1.locator('.delib__actions .btn--primary').click();
await s1.waitForSelector('.celebration', { timeout: 10000 });
console.log('S1 CELEBRATION (own improvement):', (await s1.locator('.celebration__message').textContent()).slice(0, 60));
await s1.waitForTimeout(600);
await shot(s1, '06b-celebration-own-improvement');
await s1.locator('.celebration button.btn--primary').click();

// Improving STAYS on "my proposal" and old verdicts are marked stale
await s1.waitForSelector('.char-chips__chip', { timeout: 10000 });
const staleLabel = await s1.locator('.char-chips__chip').nth(0).locator('.char-chips__cta').textContent();
console.log('COUNT CHIP AFTER UPDATE (stale):', staleLabel);
if (!/changed|השתנה/i.test(staleLabel)) throw new Error(`Expected stale chip label, got: ${staleLabel}`);

await shot(teacher, '08-teacher-deliberation');

// ---------- Results ----------
step('TEACHER advances → RESULTS');
await advance();
await teacher.waitForSelector('.results__total', { timeout: 120000 });
await s1.waitForSelector('.results__total', { timeout: 30000 });
console.log('CLASS SCORE:', await s1.locator('.results__total').textContent());
console.log('OUTCOME:', await s1.locator('.results__outcome-label').textContent());
console.log('DEBRIEF:', (await s1.locator('.results__debrief-list li').allTextContents()).slice(0, 4));
await s1.waitForTimeout(1500);
await shot(teacher, '09-teacher-results');
await shot(s1, '10-student-results');

await browser.close();
console.log('\nWALKTHROUGH COMPLETE — screenshots in apps/agora/' + SHOTS);

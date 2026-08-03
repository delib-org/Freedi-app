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
	// AGORA_LANG=he node scripts/walkthrough.mjs → run the whole game in that
	// language (RTL check); default follows the browser locale (en)
	if (process.env.AGORA_LANG) {
		await page.addInitScript(
			(lang) => window.localStorage.setItem('agora_lang', lang),
			process.env.AGORA_LANG,
		);
	}
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
	// The teacher's class-progress card fills as students finish their scenes
	await teacher
		.locator('.class-progress__count--all')
		.waitFor({ timeout: 15000 });
	console.log(
		'TEACHER CLASS PROGRESS:',
		await teacher.locator('.class-progress__count').textContent()
	);
	if (stage.startsWith('FRAMING')) await shot(teacher, '02b-teacher-class-progress');
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

// ---------- Deliberation: the guided chat ----------
step('TEACHER advances → DELIBERATION (guided chat: propose → rate → improve → menu)');
await advance();

const FS = 'http://localhost:8081/v1/projects/freedi-test/databases/(default)/documents';
const ownerGet = async (path) =>
	(await fetch(`${FS}/${path}`, { headers: { Authorization: 'Bearer owner' } })).json();

// The guide's active card is the only interactive one; old cards go inert.
// Scope ambiguous selectors to the live cards.
const liveCard = (page, inner) => page.locator(`.chat-card:not(.chat-card--inert) ${inner}`);

// Click a menu option on the ACTIVE menu only. Old menus stay in the log
// with disabled copies of the same button, and Playwright's click binds to
// its first resolution (it never rebinds unless the element detaches) —
// so always target :not([disabled]), which is unique to the fresh menu.
const menuClick = async (page, choice, timeout = 15000) => {
	const btn = page.locator(`.chat-menu__option[data-choice="${choice}"]:not([disabled])`);
	await btn.waitFor({ timeout });
	await btn.click();
};

// The guide greets and asks for a proposal; the needs board is one tap away
await s1.waitForSelector('.chat-composer textarea.text-input', { timeout: 15000 });
await s1.locator('.needs-peek__toggle').last().click();
await s1.waitForSelector('.needs-board', { timeout: 5000 });
console.log('NEEDS PEEK opens inside the proposal composer');
await shot(s1, '06a-needs-peek-in-propose');
await s1.locator('.needs-peek__toggle').last().click();

const propose = async (page, label, text) => {
	await page.waitForSelector('.chat-composer textarea.text-input', { timeout: 15000 });
	await page.locator('.chat-composer textarea.text-input').last().fill(text);
	await page.locator('.chat-composer .btn--primary').last().click();
	await page.waitForTimeout(1200);
	console.log(`${label} proposed`);
};
await propose(s1, 'S1', 'נכריז על מלוכה חוקתית: המלך יישאר סמל מאחד אך אספה נבחרת תחוקק ותאשר מסים, וזכויות היתר יבוטלו בהדרגה תוך פיצוי הוגן.');
await propose(s2, 'S2', 'נקים אספה לאומית שבה לעם רוב קולות, נבטל את הפטור ממס של האצולה, אך נבטיח לאצילים שמירה על ביטחונם האישי ורכושם הבסיסי.');

// The guide deals S1's proposal to S2 (explicitly framed as A CLASSMATE'S).
// If the snapshot raced the submit, the live menu grows a rate button — take it.
const reachRateCard = async (page, label) => {
	await page
		.locator('.delib__rate-card .rate-scale, .chat-menu__option[data-choice="rate_more"]')
		.last()
		.waitFor({ timeout: 15000 });
	if (await page.locator('.chat-menu__option[data-choice="rate_more"]').count()) {
		if ((await page.locator('.delib__rate-card .rate-scale').count()) === 0) {
			await menuClick(page, 'rate_more');
			await page.waitForSelector('.delib__rate-card .rate-scale', { timeout: 10000 });
			console.log(`${label} took rate_more from the menu`);
		}
	}
};
await reachRateCard(s2, 'S2');
const scaleCount = await s2.locator('.delib__rate-card').last().locator('.rate-scale__option').count();
if (scaleCount !== 5) throw new Error(`Expected 5 rating levels, got ${scaleCount}`);
const rateOwner = await s2.locator('.delib__rate-card').last().locator('.owner-chip').textContent();
console.log('S2 RATE CARD OWNER CHIP:', rateOwner);
if (!rateOwner.includes('📙')) throw new Error(`Rate card missing the peer chip: ${rateOwner}`);
await shot(s2, '06-rate-card');

// S2 rates +0.5 (below top) → the guide asks for an improvement suggestion
await s2.locator('.delib__rate-card').last().locator('.rate-scale__option--for').click();
await s2.waitForSelector('.chat-choice', { timeout: 10000 });
await s2.locator('.chat-choice .btn--primary').last().click(); // "I'll suggest an improvement"
await s2.waitForSelector('.chat-composer textarea.text-input', { timeout: 10000 });
await s2
	.locator('.chat-composer textarea.text-input')
	.last()
	.fill('כדאי להוסיף לוח זמנים ברור לביטול זכויות היתר, כדי ששני הצדדים יידעו למה לצפות.');
await s2.locator('.chat-composer .btn--primary').last().click();
console.log('S2 rated +0.5 → improvement prompt → suggestion sent');
await s2.waitForSelector('.chat-menu__options', { timeout: 15000 }); // no more candidates → menu
await shot(s2, '06c-improve-flow-done');

// S1 proposed before any candidates existed, so the guide opened the menu;
// once S2's proposal landed, the LIVE menu grew the rate button
await menuClick(s1, 'rate_more');
await s1.waitForSelector('.delib__rate-card .rate-scale', { timeout: 10000 });
await s1.locator('.delib__rate-card').last().locator('.rate-scale__option--strong-for').click(); // +1
console.log('S1 rated: very much for (+1) — top mark skips the improvement prompt');
await s1.waitForSelector('.chat-menu__options', { timeout: 15000 });

// ScoreHUD rides above the chat: class bridge, my tile, the support chart
await s1.waitForSelector('.scorehud', { timeout: 15000 });
console.log('S1 CLASS BRIDGE:', (await s1.locator('.scorehud__class-value').textContent()).trim());
console.log('S1 MINE ROW:', (await s1.locator('.scorehud__tile--mine').innerText()).replaceAll('\n', ' | '));
const barCount = await s1.locator('.support-chart__bar').count();
if (barCount < 2) throw new Error(`Support chart shows ${barCount} bars, expected >= 2`);
await s1.locator('.support-chart__bar').first().click();
await s1.waitForSelector('.chart-detail', { timeout: 5000 });
console.log('S1 CHART DETAIL:', (await s1.locator('.chart-detail__text').textContent()).slice(0, 60));
await shot(s1, '06b-scorehud-chart');
await s1.locator('.chart-detail__close').click();

// S1 opens "what my proposal received" — S2's suggestion waits with a badge
const feedbackBadge = await s1
	.locator('.chat-menu__option[data-choice="my_feedback"]:not([disabled]) .chat-menu__badge')
	.textContent();
console.log('S1 MY-FEEDBACK BADGE:', feedbackBadge);
try {
	await menuClick(s1, 'my_feedback', 10000);
} catch (e) {
	const dump = await s1.evaluate((sid) => ({
		flow: sessionStorage.getItem(`agora_${sid}_chatflow`),
		cards: [...document.querySelectorAll('.chat-card')].map((c) => ({
			inert: c.className.includes('inert'),
			menu: !!c.querySelector('.chat-menu'),
			buttons: [...c.querySelectorAll('button')].map((b) => `${b.dataset.choice ?? b.textContent?.slice(0, 15)}:${b.disabled ? 'D' : 'E'}`),
		})),
		bubbles: [...document.querySelectorAll('.chat-bubble__body')].map((b) => b.textContent.slice(0, 30)),
	}), sessionId);
	console.log('DEBUG DUMP:', JSON.stringify(dump, null, 1));
	await shot(s1, 'debug-menu-stuck');
	throw e;
}
await s1.waitForSelector('.workshop__item', { timeout: 10000 });
console.log('S1 SUGGESTIONS INLINE:', await liveCard(s1, '.workshop__item').count());
await shot(s1, '06a-my-feedback');

// Accept the suggestion ("I'll implement") → the suggester gets the glitter
await s1.getByRole('button', { name: /^(I'll implement|אשלב את הרעיון)$/i }).click();
await s2.waitForSelector('.celebration', { timeout: 15000 });
console.log('S2 CELEBRATION (accepted):', (await s2.locator('.celebration__message').textContent()).slice(0, 60));
console.log('S2 CELEBRATION DETAIL:', (await s2.locator('.celebration__detail').textContent()).slice(0, 60));
await s2.waitForTimeout(600);
await shot(s2, '07b-celebration-accepted');
await s2.locator('.celebration button.btn--primary').click();

// In-character reviews: menu → ask the characters; chips expand the verdict
await s1.locator('.chat-back .btn--ghost').last().click();
await s1.waitForSelector('.chat-menu__options', { timeout: 10000 });
try {
	await menuClick(s1, 'ask_characters', 10000);
} catch (e) {
	const dump = await s1.evaluate((sid) => ({
		flow: sessionStorage.getItem(`agora_${sid}_chatflow`),
		menus: [...document.querySelectorAll('.chat-menu')].map((menu) => ({
			inert: menu.closest('.chat-card')?.className.includes('inert'),
			options: [...menu.querySelectorAll('.chat-menu__option')].map(
				(b) => `${b.dataset.choice}:${b.disabled ? 'D' : 'E'}`,
			),
		})),
		backButtons: document.querySelectorAll('.chat-back .btn--ghost').length,
	}), sessionId);
	console.log('MENU-HOP DUMP:', JSON.stringify(dump, null, 1));
	throw e;
}
await s1.waitForSelector('.char-chips__chip', { timeout: 10000 });
const reviewCard = s1.locator('.char-review');
// One tap per character: opening the chip auto-asks when no verdict exists
await liveCard(s1, '.char-chips__chip').nth(0).click(); // the Count
await reviewCard.locator('.char-review__bubble').waitFor({ timeout: 90000 });
console.log('COUNT VERDICT:', (await reviewCard.locator('.char-review__bubble').textContent()).slice(0, 100));
await liveCard(s1, '.char-chips__chip').nth(1).click(); // Camille — auto-asks too
await reviewCard
	.locator('.char-review__thinking')
	.waitFor({ timeout: 10000 })
	.catch(() => {});
await reviewCard.locator('.char-review__bubble').waitFor({ timeout: 90000 });
console.log('CAMILLE VERDICT:', (await reviewCard.locator('.char-review__bubble').textContent()).slice(0, 100));
const chipScore = await liveCard(s1, '.char-chips__chip').nth(0).locator('.char-chips__score').textContent();
console.log('COUNT CHIP BADGE:', chipScore);
await shot(s1, '07-character-review');

// Backend: each character rated as 3 camp raters + 1 human rater
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

// S1 improves their own proposal (menu → improve mine, always-editable) → glitter
await s1.locator('.chat-back .btn--ghost').last().click();
await s1.waitForSelector('.chat-menu__options', { timeout: 10000 });
await menuClick(s1, 'improve_mine');
await s1.waitForSelector('.my-lantern__textarea', { timeout: 10000 });
await liveCard(s1, '.my-lantern__textarea')
	.fill('נכריז על מלוכה חוקתית: המלך יישאר סמל מאחד, אספה נבחרת תחוקק ותאשר מסים, זכויות היתר יבוטלו בהדרגה תוך פיצוי הוגן — ותוקם ועדה משותפת לאצולה ולעם שתלווה את המעבר.');
await liveCard(s1, '.my-lantern__save').click();
await s1.waitForSelector('.celebration', { timeout: 10000 });
console.log('S1 CELEBRATION (own improvement):', (await s1.locator('.celebration__message').textContent()).slice(0, 60));
await s1.waitForTimeout(600);
await shot(s1, '06b-celebration-own-improvement');
await s1.locator('.celebration button.btn--primary').click();

// Old verdicts are marked stale after the edit (re-enter the characters place)
await s1.locator('.chat-back .btn--ghost').last().click();
await s1.waitForSelector('.chat-menu__options', { timeout: 10000 });
await menuClick(s1, 'ask_characters');
await s1.waitForSelector('.char-chips__chip', { timeout: 10000 });
const staleLabel = await liveCard(s1, '.char-chips__chip').nth(0).locator('.char-chips__cta').textContent();
console.log('COUNT CHIP AFTER UPDATE (stale):', staleLabel);
if (!/changed|השתנה/i.test(staleLabel)) throw new Error(`Expected stale chip label, got: ${staleLabel}`);

// ---------- The collaboration loop ----------
step('COLLABORATION LOOP: S2 sees the improvement, re-rates, follows up');
// S2's LIVE menu grows the "proposals I helped" option with a change badge
await s2.waitForSelector('.chat-menu__option[data-choice="helped"]:not([disabled]) .chat-menu__badge', { timeout: 15000 });
console.log('S2 HELPED BADGE:', await s2.locator('.chat-menu__option[data-choice="helped"]:not([disabled]) .chat-menu__badge').textContent());
await menuClick(s2, 'helped');
await s2.waitForSelector('.helped__item', { timeout: 15000 });
const helped = liveCard(s2, '.helped__item');
if ((await helped.locator('.helped__chip--accepted').count()) === 0)
	throw new Error('Helped card missing the accepted-status chip');
if ((await helped.locator('.helped__improved').count()) === 0)
	throw new Error('Helped card missing the improved-since marker');
const currentText = await helped.locator('.helped__current').textContent();
if (!currentText.includes('ועדה משותפת'))
	throw new Error('Helped card does not show the improved proposal text');
console.log('S2 SEES ACKNOWLEDGMENT + IMPROVED TEXT ✓');
await shot(s2, '08a-helped-card');

// S2 changes their vote: +0.5 (for) → +1 (very much for)
await helped.locator('.rate-scale__option--strong-for').click();
await s2.waitForSelector(
	'.chat-card:not(.chat-card--inert) .helped__item .rate-scale__option--strong-for.rate-scale__option--selected',
	{ timeout: 10000 }
);
console.log('S2 RE-RATED to +1 ✓');

// S1 (owner) sees the aggregate loop-closing signal — no names — on the HUD
await s1.waitForSelector('.scorehud__tile-hint--moved', { timeout: 15000 });
console.log('S1 RATINGS-MOVED SIGNAL:', await s1.locator('.scorehud__tile-hint--moved').textContent());

// S2 sends a FREE follow-up — the conversation stays in the helped place
await helped.locator('textarea.helped__followup').fill('עכשיו זה משכנע יותר — אולי הוסיפו גם נציגות לאיכרים בוועדה.');
await helped.locator('button.btn--secondary').click();
await s2.waitForTimeout(800);
if ((await liveCard(s2, '.helped__item').count()) === 0)
	throw new Error('Follow-up kicked S2 out of the helped card');
console.log('S2 FOLLOW-UP SENT, still in the helped place ✓');

// S1 sees the follow-up land in a fresh "my feedback" card
await s1.locator('.chat-back .btn--ghost').last().click();
await s1.waitForSelector('.chat-menu__options', { timeout: 10000 });
await menuClick(s1, 'my_feedback');
await s1.waitForFunction(
	() =>
		document.querySelectorAll('.chat-card:not(.chat-card--inert) .workshop__item').length >= 2,
	{ timeout: 15000 }
);
console.log('S1 SEES FOLLOW-UP: suggestion items =', await liveCard(s1, '.workshop__item').count());

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

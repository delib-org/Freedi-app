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
await teacher.waitForSelector('text=המהפכה הצרפתית', { timeout: 20000 });
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

// ---------- Deliberation ----------
step('TEACHER advances → DELIBERATION + propose round');
await advance();
await teacher.waitForSelector('text=/Round controls|שליטת סבבים/i', { timeout: 15000 });
await teacher.getByRole('button', { name: /Propose round|סבב הצעות/i }).click();

const propose = async (page, label, text) => {
	await page.waitForSelector('textarea.values__textarea', { timeout: 15000 });
	await page.locator('textarea.values__textarea').fill(text);
	await page.locator('.delib__actions .btn--primary').click();
	await page.waitForTimeout(1200);
	console.log(`${label} proposed`);
};
// The needs board is one tap away while writing a proposal
await s1.waitForSelector('.needs-peek__toggle', { timeout: 15000 });
await s1.locator('.needs-peek__toggle').click();
await s1.waitForSelector('.needs-board', { timeout: 5000 });
console.log('NEEDS PEEK opens during propose');
await shot(s1, '06a-needs-peek-in-propose');
await s1.locator('.needs-peek__toggle').click();

await propose(s1, 'S1', 'נכריז על מלוכה חוקתית: המלך יישאר סמל מאחד אך אספה נבחרת תחוקק ותאשר מסים, וזכויות היתר יבוטלו בהדרגה תוך פיצוי הוגן.');
await propose(s2, 'S2', 'נקים אספה לאומית שבה לעם רוב קולות, נבטל את הפטור ממס של האצולה, אך נבטיח לאצילים שמירה על ביטחונם האישי ורכושם הבסיסי.');
await shot(s1, '06-propose');

step('Rate round — each student rates the other (cross-camp)');
await teacher.getByRole('button', { name: /Rating round|סבב דירוג/i }).click();
for (const [page, label] of [[s1, 'S1'], [s2, 'S2']]) {
	await page.waitForSelector('.delib__rate-card', { timeout: 15000 });
	await page.locator('.btn--rate-agree').click();
	console.log(`${label} rated agree`);
}
await s1.waitForTimeout(3000);

step('Improve round — suggestions + in-character reviews');
await teacher.getByRole('button', { name: /Improve round|סבב שיפור/i }).click();
// S2 sends a suggestion to S1's proposal
await s2.waitForSelector('textarea.text-input', { timeout: 15000 });
await s2.locator('textarea.text-input').fill('כדאי להוסיף לוח זמנים ברור לביטול זכויות היתר, כדי ששני הצדדים יידעו למה לצפות.');
await s2.getByRole('button', { name: /Send|שליחת|improvement|שיפור/i }).click();
console.log('S2 sent suggestion');

// S1 opens "my proposal": bridging + character reviews + accept suggestion
await s1.getByRole('button', { name: /My proposal|ההצעה שלי/i }).click();
await s1.waitForSelector('.camp-bar', { timeout: 10000 });
console.log('S1 bridging:', await s1.locator('.values__score').first().textContent());

await s1.waitForSelector('.char-review', { timeout: 10000 });
const countCard = s1.locator('.char-review').nth(0);
await countCard.locator('button.btn--secondary').click();
await countCard.locator('.char-review__bubble').waitFor({ timeout: 90000 });
console.log('COUNT VERDICT:', (await countCard.locator('.char-review__bubble').textContent()).slice(0, 100));
console.log('COUNT SCORE:', await countCard.locator('.values__score').textContent());
await shot(s1, '07-character-review');

await s1.getByRole('button', { name: /^(Accept|קבלת ההצעה)$/i }).click();
await s2.waitForSelector('.toast', { timeout: 15000 });
console.log('S2 got toast:', await s2.locator('.toast__text').textContent());

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

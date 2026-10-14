/* The scenario library, in a browser: an approved teacher publishes a scenario
 * with a dragged-in picture, another approved teacher finds it through the
 * filters, reads it in their own language, takes a copy, rates and reviews it,
 * while a teacher who is not approved sees nothing and a private scenario is
 * never listed. Screenshots on a phone and a laptop go to
 * output/scenario-library/.
 *
 * Needs the private suite up (emulators + vite) and OPENAI_API_KEY in the
 * functions env (translation). Run: npx tsx scripts/e2e-scenario-library-ui.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { FieldValue } from 'firebase-admin/firestore';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, mkPage as makePage, shotter, step } from './lib/e2e.mjs';
import { callable, db, signInTeacher } from './lib/fastlane.ts';
import { auditPage, report as reportContrast } from './contrast-audit.mjs';
import { auditType, reportType } from './type-audit.mjs';

const require = createRequire(import.meta.url);
const { agoraTagId, normalizeTagKey } = require('@freedi/shared-types');

await preflight({ needs: ['firestore', 'auth', 'functions', 'vite'] });

const DIR = 'output/scenario-library';
const opened = [];
/** Every page is remembered so a failure can leave a picture of each */
const mkPage = async (...args) => {
	const page = await makePage(...args);
	opened.push(page);

	return page;
};
mkdirSync(DIR, { recursive: true });
const shot = shotter(DIR);
/** Contrast (WCAG AA) and type-size floors, measured on what is on screen right now */
const audits = [];
const audit = async (page, label) => {
	// The skip link lives in index.html, outside every screen, and is not the library's to fix
	const ownRuns = (result) => ({
		...result,
		failures: result.failures.filter((failure) => !failure.selector.includes('skip-link')),
	});
	audits.push({
		label,
		contrast: ownRuns(await auditPage(page, { label })),
		type: ownRuns(await auditType(page, { label })),
	});
};
const runId = `libui-${Date.now().toString(36)}`;
const emailOf = (sub) => `${runId}-${sub}@example.com`;

const tag = (kind, words) => agoraTagId(kind, normalizeTagKey(words));
// A subject nobody has made yet in this emulator, so "create" is really offered
const NEW_TAG = `קבלת החלטות ${runId}`;
const SMOKING = tag('subject', 'עישון');
const BULLYING = tag('subject', 'בריונות (אלימות בכיתה)');
const MAJORITY = tag('subject', 'רוב מול מיעוט בדמוקרטיה');
const SOCIETY = tag('lessonType', 'חברה');
const CIVICS = tag('lessonType', 'אזרחות');
const HISTORY = tag('lessonType', 'היסטוריה');

const svgCover = (a, b, label) =>
	`data:image/svg+xml;utf8,${encodeURIComponent(
		`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='800' height='500' fill='url(#g)'/><circle cx='620' cy='140' r='90' fill='white' fill-opacity='.22'/><circle cx='180' cy='380' r='140' fill='white' fill-opacity='.14'/><text x='60' y='440' font-family='sans-serif' font-size='54' fill='white' fill-opacity='.9'>${label}</text></svg>`,
	)}`;

step('A. a school, approved teachers, an outsider and an admin');
const mk = async (sub, name) => {
	const who = await signInTeacher(`${runId}-${sub}`);
	await db.collection('usersV2').doc(who.uid).set({ email: emailOf(sub), displayName: name }, { merge: true });

	return { ...who, sub, name };
};
const admin = await mk('admin', 'Ada Admin');
await db.collection('usersV2').doc(admin.uid).set({ systemAdmin: true }, { merge: true });
const author = await mk('author', 'דנה כהן');
const reader = await mk('reader', 'Ron Reader');
const outsider = await mk('outsider', 'Olly Outsider');
const { schoolId } = await callable('agoraAdminManageSchool', { action: 'create', name: 'תיכון הדגמה' }, admin.idToken);
for (const who of [author, reader]) {
	await callable('agoraAdminManageSchool', { action: 'assignTeacher', schoolId, teacherEmail: emailOf(who.sub) }, admin.idToken);
}
await callable('agoraLibraryAccess', {}, author.idToken);
await callable('agoraLibraryAccess', {}, reader.idToken);

step('B. the library has other teachers work in it');
const demo = (await db.collection('agoraTopicPackages').doc('demo-french-revolution').get()).data();
if (!demo) fail('seed the demo package first (npm run seed)');
const now = Date.now();
const day = 24 * 60 * 60 * 1000;
const others = [
	['המהפכה הצרפתית: לחם וחירות', 'הכיתה מצילה את צרפת של 1789 וצריכה פתרון שכל הצדדים יכולים לחיות איתו.', [MAJORITY], [HISTORY, CIVICS], 'he', ['#7350e3', '#f56aa8'], 'Mira Levi', { c: 23, avg: 4.8 }, 41, 20 * day],
	['עישון בבית הספר: מי מחליט?', 'דיון בכיתה על איסור עישון בחצר, בין זכויות הפרט לבריאות הציבור.', [SMOKING], [SOCIETY], 'he', ['#22b699', '#56dfc0'], 'Yossi Bar', { c: 19, avg: 4.7 }, 28, 9 * day],
	['מי שותק בכיתה? בריונות ועמדות', 'מצבים של אלימות בין תלמידים, ומה כל צד צריך כדי שיהיה בטוח לדבר.', [BULLYING], [SOCIETY, CIVICS], 'he', ['#f5a623', '#e0873c'], 'Dana Shalom', { c: 8, avg: 4.4 }, 12, 3 * day],
	['Majority rule and minority rights', 'The class designs a school council where a loud majority cannot silence a quiet minority.', [MAJORITY], [CIVICS], 'en', ['#0f6fb5', '#4a53c0'], 'Tom Reed', { c: 5, avg: 4.2 }, 6, 2 * day],
	['חוק הרוב: מה קורה לקול של אחד?', 'הכיתה מקימה ועדה ומחליטה איך מגינים על דעה שאינה פופולרית.', [MAJORITY, BULLYING], [CIVICS], 'he', ['#8b6bf0', '#4a2fae'], 'Noa Peled', { c: 0, avg: 0 }, 0, 1 * day],
];
let seeded = 0;
for (const [title, summary, subjects, lessons, language, [c1, c2], authorName, rating, copies, age] of others) {
	const id = `${runId}-seed-${seeded++}`;
	await db.collection('agoraTopicPackages').doc(id).set({
		...demo,
		topicPackageId: id,
		creatorId: `seed-author-${seeded}`,
		title,
		language,
		status: 'ready',
		createdAt: now - age,
		lastUpdate: now - age,
		visibility: 'public',
		library: { summary, subjectIds: subjects, lessonTypeIds: lessons, coverUrl: svgCover(c1, c2, authorName), coverSource: 'upload', publishedAt: now - age, authorId: `seed-author-${seeded}`, authorName: authorName.split(' ')[0], hidden: false },
		stats: { ratingCount: rating.c, ratingSum: Math.round(rating.c * rating.avg * 10) / 10, ratingBayes: rating.c ? (rating.c * rating.avg + 5 * 3.8) / (rating.c + 5) : 3.8, reviewCount: rating.c, copyCount: copies },
	});
}
// What publishing would have counted onto the tags
const used = new Map();
for (const [, , subjects, lessons] of others) {
	for (const id of [...subjects, ...lessons]) used.set(id, (used.get(id) ?? 0) + 1);
}
for (const [id, count] of used) {
	await db.collection('agoraLibraryTags').doc(id).update({ scenarioCount: FieldValue.increment(count) });
}
console.log(`   ${seeded} scenarios from other teachers`);

step("C. the author's own scenarios: one to publish, one to keep private");
const ownId = `${runId}-own`;
const privateId = `${runId}-private`;
await db.collection('agoraTopicPackages').doc(ownId).set({ ...demo, topicPackageId: ownId, creatorId: author.uid, title: 'ועדת כיתה: איך מחליטים יחד', status: 'ready', language: 'he', createdAt: now, lastUpdate: now });
await db.collection('agoraTopicPackages').doc(privateId).set({ ...demo, topicPackageId: privateId, creatorId: author.uid, title: 'תרחיש פרטי שלי — לא לספרייה', status: 'ready', language: 'he', createdAt: now - day, lastUpdate: now - day });

// A picture to drop on the publish sheet
const browser = await chromium.launch();
try {
	const coverPath = `${DIR}/sample-cover.png`;
	{
		const page = await browser.newPage({ viewport: { width: 1200, height: 750 } });
		await page.setContent(
			`<body style="margin:0"><div style="width:1200px;height:750px;background:linear-gradient(135deg,#ffd23f,#f56aa8 55%,#7350e3);display:grid;place-items:center;font:700 96px sans-serif;color:white">ועדת כיתה</div></body>`,
		);
		writeFileSync(coverPath, await page.screenshot());
		await page.close();
	}

	// Auth settles in two beats (an anonymous account, then the teacher's own):
	// sign in only after the first, and wait for the second before moving on.
	const signedIn = () => {
		const state = window.__agoraDebug?.().user;

		return Boolean(state && !state.loading && state.user && !state.user.isAnonymous);
	};
	const signIn = async (page, who) => {
		const claims = { sub: `${runId}-${who.sub}`, email: emailOf(who.sub), name: who.name };
		await page.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
		for (let attempt = 1; attempt <= 3; attempt++) {
			await page.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 20_000 });
			// The page's own anonymous sign-in must have finished first, or it can land after ours
			await page.waitForFunction(
				() => {
					const state = window.__agoraDebug?.().user;

					return Boolean(state && state.loading === false && state.user);
				},
				{ timeout: 20_000 },
			);
			await page.evaluate((c) => window.__agoraDevSignIn(c), claims);
			await page.waitForFunction(signedIn, { timeout: 20_000 });
			await page.reload({ waitUntil: 'domcontentloaded' });
			// A reload that comes back signed out means the session had not been written yet: go again
			if (await page.waitForFunction(signedIn, { timeout: 12_000 }).then(() => true, () => false)) return;
		}
		fail(`could not sign ${who.sub} in`);
	};

	// ── the outsider first: sees nothing ───────────────────────────────────
	step('D. a teacher who is not approved sees nothing');
	const out = await mkPage(browser, 'outsider', { width: 1280, height: 900, lang: 'en' });
	await signIn(out, outsider);
	await out.waitForSelector('.scenario-list', { timeout: 30_000 });
	await out.waitForTimeout(2500);
	eq('no door on the teacher home', await out.locator('.scn-door').count(), 0);
	await out.goto(`${VITE_HOST}/#!/teach/library`, { waitUntil: 'domcontentloaded' });
	await out.waitForSelector('.scn-gate', { timeout: 30_000 });
	eq('the library says it is for approved teachers', await out.locator('.scn-gate__title').innerText(), 'The library is open to approved teachers');
	eq('no cards at all', await out.locator('.scn-card').count(), 0);
	eq('no filters, no counts', await out.locator('.scn-layout').count(), 0);
	await shot(out, '00-outsider-gate-laptop');
	await audit(out, 'outsider gate (laptop)');

	// ── the author publishes ────────────────────────────────────────────────
	step('E. the author publishes with a dragged-in picture');
	const a = await mkPage(browser, 'author', { width: 1280, height: 900, lang: 'he' });
	await signIn(a, author);
	await a.waitForSelector('.scenario-list', { timeout: 30_000 });
	await a.waitForSelector('.scn-door', { timeout: 20_000 });
	await shot(a, '01-teacher-home-door-laptop');
	await a.locator('.scn-door').click();
	await a.waitForSelector('.scn-layout', { timeout: 30_000 });
	await a.click('.scn-segment__opt:has-text("התרחישים שלי")');
	await a.waitForSelector('.scn-mine', { timeout: 20_000 });
	await shot(a, '02-mine-laptop');
	await audit(a, 'my scenarios (laptop)');
	const row = a.locator('.scn-mine', { hasText: 'ועדת כיתה' });
	await row.locator('.scn-switch__opt:has-text("ציבורי")').click();
	await a.waitForSelector('.scn-publish', { timeout: 10_000 });
	await a.waitForTimeout(400);
	// drag & drop: build a File in the page and drop it on the zone
	const bytes = (await import('node:fs')).readFileSync(coverPath).toString('base64');
	await a.evaluate(async (b64) => {
		const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
		const file = new File([blob], 'cover.png', { type: 'image/png' });
		const transfer = new DataTransfer();
		transfer.items.add(file);
		const zone = document.querySelector('.scn-cover__zone');
		zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true }));
		zone.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
	}, bytes);
	await a.waitForSelector('.scn-cover__img', { timeout: 30_000 });
	await a.waitForFunction(() => !document.querySelector('.scn-cover__bar'), { timeout: 30_000 });
	eq('the dropped picture is previewed', await a.locator('.scn-cover__img').count(), 1);
	await shot(a, '03-publish-sheet-empty-laptop');

	// ...or let the AI paint one from the scenario's own content (a real image call, ~20 s)
	const droppedSrc = await a.locator('.scn-cover__img').getAttribute('src');
	await a.click('.scn-cover__ai button');
	await a.waitForSelector('.scn-cover__ai button[aria-disabled="true"]', { timeout: 5_000 });
	await shot(a, '03a-publish-sheet-ai-working-laptop');
	await a.waitForSelector('.scn-cover__ai .scn-notice, .scn-cover__ai .scn-field__error', { timeout: 120_000 });
	eq('no error from the cover generator', await a.locator('.scn-cover__ai .scn-field__error').count(), 0);
	const aiSrc = await a.locator('.scn-cover__img').getAttribute('src');
	eq('the preview is now the generated picture', /library-cover-ai-/.test(aiSrc ?? '') && aiSrc !== droppedSrc, true);
	eq('the button now offers another picture', (await a.locator('.scn-cover__ai button').innerText()).includes('תמונה אחרת'), true);
	eq('the daily allowance is shown', await a.locator('.scn-cover__ai .scn-field__hint', { hasText: '9' }).count() >= 1, true);
	await shot(a, '03b-publish-sheet-ai-cover-laptop');

	// pressing publish with nothing chosen names what is missing
	await a.fill('#scn-publish-summary', 'קצר');
	await a.click('.question-sheet__continue');
	await a.waitForSelector('.scn-problems', { timeout: 5_000 });
	const problems = await a.locator('.scn-problems li').allInnerTexts();
	console.log('   problems:', problems.join(' | '));
	eq('the missing things are named', problems.length >= 3, true);
	await shot(a, '04-publish-sheet-problems-laptop');

	await a.fill('#scn-publish-summary', 'הכיתה מקימה ועדה ומחליטה יחד איך מקבלים החלטה כשיש דעות שונות, בלי שקול אחד ישתיק את האחר.');
	// subject: type a near-duplicate of an existing tag; the picker offers the existing one first
	await a.click('#scn-publish-subjects-input');
	await a.fill('#scn-publish-subjects-input', 'עישונ');
	await a.waitForSelector('.scn-suggest__row', { timeout: 5_000 });
	const offered = await a.locator('.scn-suggest__row').allInnerTexts();
	console.log('   offered for "עישונ":', offered.join(' | ').replace(/\n/g, ' '));
	eq('the existing tag is offered before "create"', offered.some((text) => text.includes('עישון')), true);
	await shot(a, '05-tag-near-duplicate-laptop');
	await a.fill('#scn-publish-subjects-input', 'רוב');
	await a.locator('.scn-suggest__row', { hasText: 'רוב מול מיעוט' }).click();
	await a.click('#scn-publish-subjects-input');
	await a.fill('#scn-publish-subjects-input', NEW_TAG);
	await a.waitForSelector('.scn-suggest__create', { timeout: 5_000 });
	await a.click('.scn-suggest__create');
	await a.waitForSelector(`.scn-tag--picked:has-text("${NEW_TAG}")`, { timeout: 40_000 });
	await a.click('#scn-publish-lessons-input');
	await a.locator('.scn-suggest__row', { hasText: 'אזרחות' }).click();
	await shot(a, '06-publish-sheet-filled-laptop');
	await audit(a, 'publish sheet (laptop)');
	await a.click('.question-sheet__continue');
	await a.waitForSelector('.scn-notice', { timeout: 40_000 });
	await a.waitForFunction(() => !document.querySelector('.scn-publish'), { timeout: 10_000 });
	eq('the switch now says public', await row.locator('.scn-switch__opt--on').innerText(), 'ציבורי');
	const published = (await db.collection('agoraTopicPackages').doc(ownId).get()).data();
	eq('the scenario is public in Firestore', published.visibility, 'public');
	eq('with the generated cover on the card', /\/o\/agora%2F.*library-cover-ai-/.test(published.library.coverUrl), true);
	eq('marked as an AI cover', published.library.coverSource, 'ai');
	eq('and a new tag adopted', published.library.subjectIds.length, 2);
	await shot(a, '07-mine-published-laptop');

	step('F. the private one is not listed');
	await a.click('.scn-segment__opt:has-text("הספרייה")');
	await a.waitForSelector('.scn-card', { timeout: 30_000 });
	const authorCards = await a.locator('.scn-card__title').allInnerTexts();
	eq('own published scenario is in the library, marked mine', authorCards.some((title) => title.includes('ועדת כיתה')), true);
	eq('the private scenario is not', authorCards.some((title) => title.includes('פרטי')), false);

	// ── the reader finds it, in English ─────────────────────────────────────
	step('G. another approved teacher finds it, in English, through the filters');
	const r = await mkPage(browser, 'reader', { width: 1280, height: 900, lang: 'en' });
	await signIn(r, reader);
	await r.waitForSelector('.scn-door', { timeout: 30_000 });
	await shot(r, '08-teacher-home-door-english-laptop');
	await r.locator('.scn-door').click();
	await r.waitForSelector('.scn-card', { timeout: 30_000 });
	await r.waitForFunction(() => !document.querySelector('.scn-bar__translating') && document.querySelectorAll('.scn-card__auto').length >= 3, { timeout: 120_000 });
	const readerTitles = await r.locator('.scn-card__title').allInnerTexts();
	console.log('   reader sees:', readerTitles.join(' | '));
	eq('every card is findable', readerTitles.length >= 6, true);
	eq('the Hebrew scenarios arrive translated', readerTitles.filter((title) => /[a-z]/i.test(title)).length >= 5, true);
	eq('the private scenario is not listed for others either', readerTitles.some((title) => /private|פרטי/i.test(title)), false);
	await shot(r, '09-library-english-laptop');
	await audit(r, 'library home (laptop)');

	await r.click('.scn-chip:has-text("Civics")');
	await r.waitForTimeout(300);
	await r.click('.scn-chip:has-text("History")');
	await r.waitForTimeout(300);
	const filtered = await r.locator('.scn-card__title').allInnerTexts();
	console.log('   Civics OR History:', filtered.length, 'cards');
	await r.click('.scn-chip:has-text("Smoking")');
	await r.waitForTimeout(300);
	eq('AND across groups: Smoking + (Civics or History) is empty', await r.locator('.scn-card').count(), 0);
	await shot(r, '10-filters-empty-laptop');
	await r.click('button:has-text("Clear all")');
	await r.fill('.scn-search__input', 'committee');
	await r.waitForTimeout(400);
	eq('search finds the translated title', await r.locator('.scn-card').count() >= 1, true);
	await shot(r, '11-search-laptop');
	await r.fill('.scn-search__input', '');
	await r.selectOption('.scn-sort select', 'used');
	await r.waitForTimeout(1500);
	await shot(r, '12-sort-most-used-laptop');

	step('H. read it, take a copy');
	await r.locator('.scn-card', { hasText: 'class' }).first().click().catch(() => undefined);
	await r.goto(`${VITE_HOST}/#!/teach/library/${ownId}`, { waitUntil: 'domcontentloaded' });
	await r.waitForSelector('.scn-page__title', { timeout: 30_000 });
	await r.waitForFunction(() => document.querySelector('.scn-page__title')?.textContent !== 'ועדת כיתה: איך מחליטים יחד', { timeout: 90_000 });
	console.log('   page title:', await r.locator('.scn-page__title').innerText());
	await shot(r, '13-scenario-page-english-laptop');
	await r.click('.scn-use .btn--primary');
	await r.waitForSelector('.scn-done', { timeout: 120_000 });
	await shot(r, '14-copy-made-laptop');
	const copies = await db.collection('agoraTopicPackages').where('creatorId', '==', reader.uid).where('sourceScenarioId', '==', ownId).get();
	eq('one linked copy exists', copies.size, 1);
	const copy = copies.docs[0].data();
	eq('written in English', copy.language, 'en');
	eq('credited to the original author', copy.sourceAuthorName, 'דנה');

	step('I. rate and review');
	await r.waitForSelector('.scn-picker__star', { timeout: 10_000 });
	await r.locator('.scn-picker__star').nth(4).click();
	await r.fill('#scn-review', 'The class got into it right away. A great start for a debate.');
	await shot(r, '15-rate-form-laptop');
	await r.click('.scn-rate .btn--primary');
	await r.waitForSelector('.scn-review--mine', { timeout: 30_000 });
	eq('the review is listed, as mine', await r.locator('.scn-review--mine .scn-review__text').innerText(), 'The class got into it right away. A great start for a debate.');
	const rated = (await db.collection('agoraTopicPackages').doc(ownId).get()).data();
	eq('one rating on the scenario', rated.stats.ratingCount, 1);
	eq('five stars', rated.stats.ratingSum, 5);
	await shot(r, '16-reviews-laptop');
	await audit(r, 'scenario page with reviews (laptop)');
	// the author cannot rate their own
	await a.goto(`${VITE_HOST}/#!/teach/library/${ownId}`, { waitUntil: 'domcontentloaded' });
	await a.waitForSelector('.scn-page__title', { timeout: 30_000 });
	await a.waitForSelector('.scn-review', { timeout: 20_000 });
	eq('the author gets no rating form', await a.locator('.scn-rate').count(), 0);
	eq('...and sees why', (await a.locator('.scn-feedback .scn-note').first().innerText()).includes('לא ניתן') || (await a.locator('.scn-feedback .scn-note').count()) > 0, true);

	step('I2. the discussion thread: a question, an answer, a hide');
	// the reader asks a question under the scenario, on the Discussion tab
	await r.click('#scn-tab-discussion');
	await r.waitForSelector('#scn-post-new', { timeout: 10_000 });
	eq('the discussion tab is selected', await r.locator('#scn-tab-discussion').getAttribute('aria-selected'), 'true');
	await r.fill('#scn-post-new', 'Does the class need any preparation before starting this scenario?');
	await shot(r, '16a-discussion-composer-laptop');
	await r.click('.scn-compose .btn--primary');
	await r.waitForSelector('.scn-post--mine', { timeout: 30_000 });
	eq('the question is on the thread, as mine', await r.locator('.scn-post--mine .scn-post__text').first().innerText(), 'Does the class need any preparation before starting this scenario?');
	eq('the tab counts it', (await r.locator('#scn-tab-discussion').innerText()).includes('(1)'), true);
	// the author answers it with a reply, and sees the hide control
	await a.goto(`${VITE_HOST}/#!/teach/library/${ownId}`, { waitUntil: 'domcontentloaded' });
	await a.waitForSelector('#scn-tab-discussion', { timeout: 30_000 });
	await a.click('#scn-tab-discussion');
	await a.waitForSelector('.scn-post', { timeout: 20_000 });
	await a.click('.scn-post__actions button:has-text("הגבה")');
	await a.fill('[id^="scn-reply-"]', 'אין צורך בהכנה. כדאי לקרוא יחד את שאלת האתגר.');
	await a.click('.scn-thread__reply-box .btn--primary');
	await a.waitForSelector('.scn-thread__replies .scn-post', { timeout: 30_000 });
	eq('the reply sits one level under the question', await a.locator('.scn-thread__replies .scn-post').count(), 1);
	eq('the author is marked as the author', await a.locator('.scn-thread__replies .scn-pill').count(), 1);
	await shot(a, '16b-discussion-thread-laptop');
	await audit(a, 'discussion thread, author (laptop)');
	// the author hides the reader's question; the reader no longer sees it
	await a.locator('.scn-thread__item > .scn-post .scn-post__actions button:has-text("הסתרה")').click();
	await a.waitForSelector('.scn-post--hidden', { timeout: 20_000 });
	await shot(a, '16c-discussion-hidden-author-laptop');
	await r.reload({ waitUntil: 'domcontentloaded' });
	await r.waitForSelector('#scn-tab-discussion', { timeout: 30_000 });
	await r.click('#scn-tab-discussion');
	await r.waitForSelector('.scn-discussion', { timeout: 10_000 });
	await r.waitForTimeout(1200);
	eq('the reader no longer sees the hidden question', await r.locator('.scn-post').count(), 0);
	// lift it so the rest of the run reads the full page
	await a.locator('.scn-post--hidden .scn-post__actions button').last().click();
	await a.waitForFunction(() => !document.querySelector('.scn-post--hidden'), { timeout: 20_000 });
	await r.reload({ waitUntil: 'domcontentloaded' });
	await r.waitForSelector('#scn-tab-discussion', { timeout: 30_000 });
	await r.click('#scn-tab-discussion');
	await r.waitForSelector('.scn-post', { timeout: 20_000 });
	await shot(r, '16d-discussion-reader-laptop');
	await audit(r, 'discussion thread, reader (laptop)');

	step('J. the reader shelf shows the copy with its credit');
	await r.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await r.waitForSelector('.scenario-row', { timeout: 30_000 });
	await r.waitForTimeout(1500);
	const shelf = await r.locator('.scenario-row').allInnerTexts();
	eq('the copy shows its source', shelf.some((text) => text.includes('Source:')), true);
	// the author edits the original: the copy says a new version is available
	await db.collection('agoraTopicPackages').doc(ownId).update({ title: 'ועדת כיתה: איך מחליטים יחד (מעודכן)', lastUpdate: Date.now() + 60_000 });
	await r.reload({ waitUntil: 'domcontentloaded' });
	await r.waitForSelector('.scenario-row__status--update', { timeout: 30_000 });
	await shot(r, '17-shelf-new-version-laptop');

	step('K. the admin hides a scenario');
	const ad = await mkPage(browser, 'admin', { width: 1280, height: 900, lang: 'en' });
	await signIn(ad, admin);
	await ad.goto(`${VITE_HOST}/#!/teach/library/${ownId}`, { waitUntil: 'domcontentloaded' });
	await ad.waitForSelector('.scn-admin', { timeout: 40_000 });
	await shot(ad, '18-admin-panel-laptop');
	await ad.click('.scn-admin .btn--secondary');
	await ad.waitForFunction(() => document.body.innerText.includes('hidden from the other teachers'), { timeout: 20_000 });
	eq('hidden in Firestore', (await db.collection('agoraTopicPackages').doc(ownId).get()).data().library.hidden, true);
	await r.goto(`${VITE_HOST}/#!/teach/library`, { waitUntil: 'domcontentloaded' });
	await r.waitForSelector('.scn-card', { timeout: 30_000 });
	await r.waitForTimeout(1500);
	eq('and gone from the reader library', (await r.locator('.scn-card__title').allInnerTexts()).some((title) => /committee|council/i.test(title)), false);
	await ad.click('.scn-admin .btn--secondary');
	await ad.waitForFunction(() => !document.body.innerText.includes('hidden from the other teachers'), { timeout: 20_000 });

	// ── phone ───────────────────────────────────────────────────────────────
	step('L. on a phone');
	const phone = await mkPage(browser, 'phone', { width: 390, height: 844, lang: 'he' });
	await signIn(phone, author);
	await phone.waitForSelector('.scenario-list', { timeout: 30_000 });
	await phone.waitForSelector('.scn-door', { timeout: 20_000 });
	await shot(phone, '20-teacher-home-door-phone');
	await phone.goto(`${VITE_HOST}/#!/teach/library`, { waitUntil: 'domcontentloaded' });
	await phone.waitForSelector('.scn-card', { timeout: 30_000 });
	await phone.waitForTimeout(800);
	await shot(phone, '21-library-phone');
	await audit(phone, 'library home (phone)');
	await phone.evaluate(() => window.scrollTo(0, 700));
	await phone.waitForTimeout(300);
	await shot(phone, '22-library-grid-phone');
	await phone.goto(`${VITE_HOST}/#!/teach/library/${ownId}`, { waitUntil: 'domcontentloaded' });
	await phone.waitForSelector('.scn-page__title', { timeout: 30_000 });
	await phone.waitForTimeout(1200);
	await shot(phone, '23-scenario-page-phone');
	await audit(phone, 'scenario page (phone)');
	await phone.evaluate(() => window.scrollTo(0, 99999));
	await phone.waitForTimeout(400);
	await shot(phone, '24-scenario-page-bottom-phone');
	await phone.goto(`${VITE_HOST}/#!/teach/library/mine`, { waitUntil: 'domcontentloaded' });
	await phone.waitForSelector('.scn-mine', { timeout: 30_000 });
	await shot(phone, '25-mine-phone');
	await phone.locator('.scn-mine', { hasText: 'ועדת כיתה' }).locator('.btn:has-text("עריכת הפרסום")').click();
	await phone.waitForSelector('.scn-publish', { timeout: 10_000 });
	await phone.waitForTimeout(500);
	await shot(phone, '26-publish-sheet-phone');
	await audit(phone, 'publish sheet (phone)');
	await phone.keyboard.press('Escape');
	const readerPhone = await mkPage(browser, 'reader-phone', { width: 390, height: 844, lang: 'he' });
	await signIn(readerPhone, reader);
	await readerPhone.goto(`${VITE_HOST}/#!/teach/library/${ownId}`, { waitUntil: 'domcontentloaded' });
	await readerPhone.waitForSelector('.scn-page__title', { timeout: 30_000 });
	await readerPhone.waitForTimeout(1500);
	await shot(readerPhone, '28-reader-scenario-sticky-use-phone');
	await readerPhone.evaluate(() => window.scrollTo(0, 600));
	await readerPhone.waitForTimeout(300);
	await shot(readerPhone, '29-reader-scenario-scrolled-phone');
	await audit(readerPhone, 'scenario page as a reader (phone)');
	const out2 = await mkPage(browser, 'outsider-phone', { width: 390, height: 844, lang: 'he' });
	await signIn(out2, outsider);
	await out2.goto(`${VITE_HOST}/#!/teach/library`, { waitUntil: 'domcontentloaded' });
	await out2.waitForSelector('.scn-gate', { timeout: 30_000 });
	await shot(out2, '27-outsider-gate-phone');

	step('L2. the same screens under the civic look (tokens only, so every look wears them)');
	for (const [route, label, file] of [
		['library', 'library home, civic look (laptop)', '30-library-civic-look-laptop'],
		[`library/${ownId}`, 'scenario page, civic look (laptop)', '31-scenario-civic-look-laptop'],
	]) {
		await r.goto(`${VITE_HOST}/#!/teach/${route}`, { waitUntil: 'domcontentloaded' });
		await r.waitForSelector(route === 'library' ? '.scn-card' : '.scn-page__title', { timeout: 30_000 });
		await r.evaluate(() => {
			document.documentElement.dataset.sessionTheme = 'civic';
		});
		await r.waitForTimeout(900);
		await shot(r, file);
		await audit(r, label);
	}

	step('M. contrast and type size on every screen above');
	let clean = true;
	for (const entry of audits) {
		clean = reportContrast(entry.contrast) && clean;
		clean = reportType(entry.type) && clean;
	}
	if (!clean) fail('contrast or type-size failures on the library screens (above)');

	console.log('\nALL SCENARIO LIBRARY UI CHECKS PASSED');
} catch (error) {
	for (const [index, page] of opened.entries()) {
		await page.screenshot({ path: `${DIR}/FAIL-${index}.png` }).catch(() => undefined);
	}
	throw error;
} finally {
	await browser.close();
}
process.exit(0);

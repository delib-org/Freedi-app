/* The village, played by three students.
 *
 * A lesson with four booths (story, needs, vision, solutions) runs from the
 * lobby to the recap with three REAL browser students and the teacher moving
 * the room through callables — the same path the console takes. Every point
 * the classic game pays is asserted on the participant documents at the end:
 * the first-draft credit, the rating credit, the round appreciation, the
 * thank-you, the bridging tier. The council's scoreboard is photographed as
 * the class map, narrowed to the goal by the teacher, then as the ballot with
 * its bars.
 *
 * Run: npm run solo -- node apps/agora/scripts/village-sim.mjs   (from the repo root)
 *  or: node scripts/village-sim.mjs                              (default ports)
 * Needs emulators + vite + seed; screenshots land in output/village-sim/.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { clearCelebration, eq, fail, mkPage, passNameDoor, shotter, step } from './lib/e2e.mjs';
import { callable, db, fastlane, positionStudent } from './lib/fastlane.ts';

await preflight();

const OUT = 'output/village-sim';
mkdirSync(OUT, { recursive: true });
const shot = shotter(OUT);
const KEEP = process.argv.includes('--keep');

const runId = `village-${Date.now().toString(36)}`;
const PLAN = [
	{ itemId: 'lobby', stage: 'lobby' },
	{ itemId: 'round-story', stage: 'question', kind: 'story' },
	{ itemId: 'round-needs', stage: 'question', kind: 'needs' },
	{ itemId: 'round-vision', stage: 'question', kind: 'vision' },
	{ itemId: 'deliberation', stage: 'deliberation' },
	{ itemId: 'voting', stage: 'voting' },
	{ itemId: 'results', stage: 'results' },
];
const STUDENTS = [
	{ label: 'S1', name: 'נועה', camp: 12 },
	{ label: 'S2', name: 'אורי', camp: 88 },
	{ label: 'S3', name: 'מיה', camp: 20 },
];
const TEXTS = {
	story: [
		'בשנה שעברה חילקנו את התורנויות בכיתה בלי לשאול אף אחד, וחצי מהכיתה הרגישה שדילגו עליה.',
		'סבא שלי סיפר איך בקיבוץ החליטו הכול יחד באסיפה, גם כשזה לקח שעות.',
		'בקבוצת הכדורסל שלנו המאמן שואל את כולם לפני שהוא קובע את ההרכב, וזה מרגיש הוגן.',
	],
	needs: [
		'שכולם ישמעו לפני שמחליטים, גם מי שמדבר פחות.',
		'שההחלטה תהיה ברורה וכתובה, כדי שלא יתווכחו אחר כך מה סוכם.',
		'שיהיה מקום לשנות החלטה אם רואים שהיא לא עובדת.',
	],
	vision: [
		'כיתה שבה כל החלטה מתחילה בסבב קצר שבו כל אחד אומר משפט.',
		'לוח אחד על הקיר עם כל ההחלטות ומי אחראי על מה.',
		'מפגש קצר פעם בחודש שבו בודקים מה עבד ומה משנים.',
	],
	proposal: [
		'אספה כיתתית שבה לכל תלמיד קול שווה, אבל החלטות על כסף דורשות רוב של שני שלישים.',
		'ועדה של שלושה נציגים שמתחלפת כל חודש ומביאה הצעות לאישור כל הכיתה.',
		'ניסיון של חודש לכל החלטה גדולה, ואחריו הצבעה חוזרת אם משהו לא עבד.',
	],
};

// ---------------------------------------------------------------------------
const FIRESTORE_HOST = process.env.AGORA_FIRESTORE_HOST ?? 'http://localhost:8081';
const REST = `${FIRESTORE_HOST}/v1/projects/${process.env.AGORA_PROJECT_ID ?? 'freedi-test'}/databases/(default)/documents`;
const owner = { Authorization: 'Bearer owner' };

async function sessionDoc(sessionId) {
	const snap = await db.collection('agoraSessions').doc(sessionId).get();

	return snap.data();
}
async function participantDoc(sessionId, uid) {
	const snap = await db.collection('agoraParticipants').doc(`${sessionId}--${uid}`).get();

	return snap.data();
}
async function waitFor(what, read, predicate, timeoutMs = 60_000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await read();
		if (predicate(value)) return value;
		if (Date.now() > deadline) fail(`${what} — timed out`);
		await new Promise((resolve) => setTimeout(resolve, 400));
	}
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Click through the game's cheers. Credits land from the server whenever they
 * land, and every one of them is a modal — a goal scored by a classmate's
 * rating can cover the button this script is about to press.
 */
async function tap(page, locator, label = '') {
	for (let attempt = 0; attempt < 8; attempt++) {
		await clearCelebration(page, label);
		try {
			await locator.click({ timeout: 4000 });

			return;
		} catch (error) {
			if (attempt === 7) throw error;
		}
	}
}

/** The village iframe of a student's page */
const world = (page) => page.frameLocator('iframe.village-shell__world');

/** One of the four doors: village | note | board | results */
async function goTo(page, place, label) {
	await tap(page, page.locator(`.place-bar__item[data-place="${place}"]`).first(), label);
}
async function backToVillage(page) {
	// A class-wide cheer (a goal, a bridge) lands on every page, not only the author's.
	await clearCelebration(page);
	// One door back, and it does not toggle: the village tab always means the
	// world, whatever was open over it.
	await goTo(page, 'village');
	await pause(250);
}

/** In front of the station: the guide's bubble in the world, with the instruction and its button */
async function expectAtStation(page, label, where) {
	const guide = world(page).locator('#desk-bubble');
	const standing = await guide
		.waitFor({ state: 'visible', timeout: 30000 })
		.then(() => true)
		.catch(() => false);
	if (!standing) {
		await shot(page, `debug-${label}-not-at-station`);
		fail(`${label} is not standing in front of ${where} with the guide's bubble`);
	}
	eq(
		`${label}: nothing opened by itself at ${where}`,
		await page.locator('.village-desk textarea').isVisible(),
		false,
	);
}

/** The only way into the paper at a station: the button inside the guide's bubble */
async function pressGuideWrite(page, label) {
	await world(page).locator('#desk-write').waitFor({ state: 'visible', timeout: 30000 });
	await tap(page, world(page).locator('#desk-write'), label);
}

/** Write on the desk of the booth the room is at, then wait for the paper to land on the board */
async function writeAtDesk(page, label, text, textarea) {
	await clearCelebration(page, label);
	const input = page.locator(`.village-desk ${textarea}`);
	if (!(await input.isVisible())) {
		// The village door stands the student at the station; the guide's
		// button is still the only thing that opens the paper.
		await backToVillage(page);
		await pressGuideWrite(page, label);
	}
	await input.waitFor({ timeout: 15000 });
	await input.fill(text);
	if (textarea.includes('write-desk')) {
		// The paper panel is small; the send button must be visible, not below its edge.
		const inView = await page.evaluate(() => {
			const panel = document.querySelector('.village-shell__activity.village-desk');
			const cta = document.querySelector('.village-desk .write-desk__cta');
			if (!panel || !cta) return false;
			const p = panel.getBoundingClientRect();
			const c = cta.getBoundingClientRect();

			return c.top >= p.top - 1 && c.bottom <= p.bottom + 1;
		});
		eq(`${label}: the send button is in view without scrolling`, inView, true);
		eq(
			`${label}: no classic HUD or tabs inside the paper`,
			await page.locator('.village-desk .place-bar, .village-desk .delib-hud').count(),
			0,
		);
	}
	await tap(page, page.locator('.village-desk button.btn--primary').first(), label);
	// The paper flies from the desk to the board, and the board opens.
	await page.locator('.village-community__panel').waitFor({ timeout: 20000 });
	await page.locator('.village-note--own').waitFor({ timeout: 10000 });
	console.log(`   ✓ ${label} wrote at the booth and the paper landed on the board`);
}

/** Open the booth board and rate every classmate's note with `rate(noteLocator, index)` */
async function rateOnBoard(page, label, rate) {
	await clearCelebration(page, label);
	await backToVillage(page);
	await goTo(page, 'board', label);
	await page.locator('.village-community__panel').waitFor({ timeout: 10000 });
	const others = page.locator('.village-note:not(.village-note--own)');
	await others.first().waitFor({ timeout: 15000 });
	const count = await others.count();
	for (let i = 0; i < count; i++) {
		await rate(others.nth(i), i);
		await pause(500);
	}
	console.log(`   ✓ ${label} rated ${count} notes on the board`);
}

/**
 * Led by the teacher: after an advance every student stands in front of the
 * new booth — the guide, the table, the note, the guide's bubble — and the
 * paper stays closed until the student presses the bubble's button.
 */
async function expectLedToDesk(where) {
	for (const s of pages) {
		await clearCelebration(s.page, s.label);
		await expectAtStation(s.page, s.label, where);
		console.log(`   ✓ ${s.label} was walked to ${where} and stands in front of it, the guide asking`);
	}
}

/** Press a button in the teacher's console; if the console never came up, write the same field directly */
async function teacherClick(selector, label, fallback) {
	if (teacherUi) {
		const button = teacher.locator(selector).first();
		const found = await button.waitFor({ timeout: 15000 }).then(
			() => true,
			() => false,
		);
		if (found) {
			await button.click();
			console.log(`   ✓ teacher: ${label}`);

			return;
		}
	}
	await fallback();
	console.log(`   (teacher console unavailable — "${label}" written directly)`);
}

async function coins(page) {
	const text = await page.locator('.village-coins strong').textContent();

	return Number(String(text).replace(/[^\d.]/g, '')) || 0;
}

// ---------------------------------------------------------------------------
step('A lesson with four booths opens in the village');
const run = await fastlane({
	stage: 'lobby',
	students: 0,
	proposals: 0,
	ratings: false,
	stagePlan: PLAN,
	runId,
	quiet: true,
});
// The console's start screen chooses the world; a callable-made session must be told.
await db.collection('agoraSessions').doc(run.sessionId).update({ world: 'village' });
console.log(`   session ${run.sessionId} (code ${run.code}) · world: village`);
const advance = async (toIndex) => {
	await callable('agoraAdvanceStage', { sessionId: run.sessionId, toIndex }, run.teacherToken);
	console.log(`   ✓ teacher → ${PLAN[toIndex].itemId}`);
	await pause(1500);
};

const browser = await chromium.launch({
	headless: !KEEP,
	args: ['--use-angle=metal', '--ignore-gpu-blocklist'],
});
const pages = [];
for (const student of STUDENTS) {
	const page = await mkPage(browser, student.label, { width: 1360, height: 860 });
	await page.goto(`${VITE_HOST}/#!/join/${run.code}`, { waitUntil: 'domcontentloaded' });
	await passNameDoor(page, student.name);
	try {
		await page.locator('.lobby__name').waitFor({ state: 'attached', timeout: 30000 });
	} catch (error) {
		await page.screenshot({ path: `${OUT}/debug-${student.label}-join.png` });
		console.log(
			`   [${student.label} page text] ${(await page.locator('body').innerText()).slice(0, 400).replace(/\n/g, ' | ')}`,
		);
		throw error;
	}
	const uid = await page.evaluate(() => window.__agoraDebug?.()?.user?.user?.uid ?? null);
	if (!uid) fail(`${student.label} has no uid`);
	await positionStudent(run.sessionId, uid, student.camp);
	pages.push({ ...student, page, uid });
	const anon = await page.evaluate(
		() => document.querySelector('.lobby__name strong')?.textContent ?? '?',
	);
	console.log(`   ✓ ${student.label} joined as ${anon} (camp ${student.camp})`);
}
const [s1, s2, s3] = pages;
await s1.page.locator('iframe.village-shell__world').waitFor({ timeout: 20000 });
await pause(6000);
await shot(s1.page, '01-village-lobby');
console.log('   ✓ village rendered with the lobby open');

// The teacher's console, signed in once: who navigates, class calls, the goal switch.
const teacher = await mkPage(browser, 'T', { width: 1360, height: 900 });
await teacher.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
await teacher.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', {
	timeout: 15000,
});
let teacherUi = false;
for (let attempt = 1; attempt <= 4 && !teacherUi; attempt++) {
	await teacher.evaluate(
		(sub) =>
			window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'Fastlane Teacher' }),
		`${runId}-teacher`,
	);
	teacherUi = await teacher
		.waitForFunction(() => window.__agoraDebug?.()?.user?.tier === 2, { timeout: 8000 })
		.then(
			() => true,
			() => false,
		);
}
if (teacherUi) {
	await pause(3000);
	await teacher.goto(`${VITE_HOST}/#!/teach/session/${run.sessionId}`, {
		waitUntil: 'domcontentloaded',
	});
	// A reload can come back as the anonymous user the app signs in on mount.
	// That console renders perfectly and cannot write a single setting.
	for (let attempt = 1; attempt <= 5; attempt++) {
		const who = await teacher
			.waitForFunction(() => window.__agoraDebug?.()?.user?.tier === 2, { timeout: 8000 })
			.then(
				() => teacher.evaluate(() => window.__agoraDebug?.()?.user?.user?.uid ?? null),
				() => null,
			);
		if (who === run.teacherUid) break;
		console.log(
			`   (teacher page is ${who ?? 'not signed in'} after the reload — signing in again, attempt ${attempt})`,
		);
		await teacher.evaluate(
			(sub) =>
				window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'Fastlane Teacher' }),
			`${runId}-teacher`,
		);
		await pause(2000);
	}
	await teacher.locator('.teacher-nav__cog').first().click({ timeout: 20000 });
	teacherUi = await teacher
		.locator('.village-nav')
		.waitFor({ timeout: 20000 })
		.then(
			() => true,
			() => false,
		);
	if (teacherUi) await shot(teacher, '00-teacher-village-navigation');
}
console.log(
	teacherUi
		? '   ✓ teacher console open on "who moves the students"'
		: '   (teacher console unavailable — settings will be written directly)',
);

// ---------------------------------------------------------------------------
step('Booth 1 · the story: everyone writes, everyone likes');
await advance(1);
await expectLedToDesk('the story booth');
await shot(s1.page, '02-story-booth');
for (const [i, s] of pages.entries())
	await writeAtDesk(s.page, s.label, TEXTS.story[i], 'textarea.round__textarea');
await shot(s1.page, '03-story-board');
for (const s of pages) {
	await rateOnBoard(s.page, s.label, async (note) => {
		await tap(s.page, note.locator('.like-button'), s.label);
		await note.locator('.like-button--on').waitFor({ timeout: 8000 });
	});
}

step('Booth 2 · the needs: a board left open when the teacher moves on');
await clearCelebration(s1.page, 'S1');
if ((await s1.page.locator('.village-community__panel').count()) === 0) {
	await goTo(s1.page, 'board', 'S1');
}
await s1.page.locator('.village-community__panel').waitFor({ timeout: 10000 });
console.log('   ✓ S1 is reading the story board');
await advance(2);
await expectLedToDesk('the needs booth');
eq(
	'the story board closed when the room moved on',
	await s1.page.locator('.village-community__panel').count(),
	0,
);
await world(s1.page)
	.locator('button.station[data-place="booth:round-needs"] .station__badge.is-now')
	.waitFor({ state: 'attached', timeout: 10000 });
eq(
	'led: the map stays open, so students can roam',
	await world(s1.page).locator('#station-map').isVisible(),
	true,
);
await shot(s1.page, '03a-led-to-needs-paper-open');
for (const [i, s] of pages.entries())
	await writeAtDesk(s.page, s.label, TEXTS.needs[i], 'textarea.round__textarea');
for (const s of pages) {
	await rateOnBoard(s.page, s.label, async (note) => {
		await tap(s.page, note.locator('.unit-scale__step').last(), s.label);
		await note.locator('.unit-scale__step--on').waitFor({ timeout: 8000 });
	});
}

step('Booth 3 · the vision, with students navigating themselves');
await teacherClick('.village-nav__choice[data-nav="free"]', 'students navigate themselves', () =>
	db.collection('agoraSessions').doc(run.sessionId).update({ villageNavigation: 'free' }),
);
await waitFor(
	'free navigation reached the session',
	() => sessionDoc(run.sessionId),
	(s) => s?.villageNavigation === 'free',
);
for (const s of pages) await backToVillage(s.page);
await pause(1500);
await advance(3);
await world(s1.page).locator('#news-go').waitFor({ state: 'visible', timeout: 20000 });
eq(
	'free: nobody was handed a paper',
	await s1.page.locator('.village-desk textarea').isVisible(),
	false,
);
eq(
	'free: the village map is shown',
	await world(s1.page).locator('#station-map').isVisible(),
	true,
);
eq(
	'free: a station the teacher has not opened is locked',
	await world(s1.page).locator('button.station[data-place="booth:deliberation"]').isDisabled(),
	true,
);
await shot(s1.page, '04a-free-news-and-map');
await world(s1.page).locator('#news-go').click();
await expectAtStation(s1.page, 'S1', 'the vision booth');
console.log('   ✓ S1 pressed "go there", walked to the vision booth and stands in front of it');
await world(s2.page).locator('button.station[data-place="booth:round-vision"]').click();
await expectAtStation(s2.page, 'S2', 'the vision booth');
console.log('   ✓ S2 chose the vision booth on the map, walked there and stands in front of it');
// Phone width: the map folds away and opens on demand.
await s3.page.setViewportSize({ width: 400, height: 860 });
await pause(2500);
await shot(s3.page, '04b-phone-map-closed');
await world(s3.page).locator('#map-toggle').click();
await pause(600);
await shot(s3.page, '04c-phone-map-open');
await world(s3.page).locator('#map-toggle').click();
await s3.page.setViewportSize({ width: 1360, height: 860 });
await pause(1500);
for (const [i, s] of pages.entries())
	await writeAtDesk(s.page, s.label, TEXTS.vision[i], 'textarea.round__textarea');
for (const s of pages) {
	await rateOnBoard(s.page, s.label, async (note) => {
		await tap(s.page, note.locator('.unit-scale__step').nth(2), s.label);
		await note.locator('.unit-scale__step--on').waitFor({ timeout: 8000 });
	});
}
await shot(s2.page, '04-vision-board-rated');

// ---------------------------------------------------------------------------
await teacherClick('.village-nav__choice[data-nav="teacher"]', 'the teacher leads again', () =>
	db.collection('agoraSessions').doc(run.sessionId).update({ villageNavigation: 'teacher' }),
);
await waitFor(
	'teacher navigation reached the session',
	() => sessionDoc(run.sessionId),
	(s) => (s?.villageNavigation ?? 'teacher') === 'teacher',
);

step('Booth 4 · the solutions: proposals, ratings, an improvement and a thank-you');
await advance(4);
await expectLedToDesk('the solutions booth');
await pause(4000);
await backToVillage(s1.page);
await shot(s1.page, '05-solutions-booth');
for (const [i, s] of pages.entries())
	await writeAtDesk(s.page, s.label, TEXTS.proposal[i], 'textarea.write-desk__textarea');
await shot(s3.page, '06-solutions-board');

// Camps: S1 left, S2 right, S3 left. Ratings chosen so that P1 and P3 are
// backed by BOTH camps (in the goal) and P2 by the left camp only (out).
const RATE = {
	S1: { 1: 'strong-for', 2: 'for' }, // S1 rates P2 +1, P3 +0.5
	S2: { 0: 'strong-for', 2: 'strong-for' }, // S2 rates P1 +1, P3 +1
	S3: { 0: 'for', 1: 'for' }, // S3 rates P1 +0.5, P2 +0.5
};
for (const s of pages) {
	await rateOnBoard(s.page, s.label, async (note) => {
		const text = await note.locator('p').first().textContent();
		const index = TEXTS.proposal.findIndex((candidate) => text?.includes(candidate.slice(0, 20)));
		const variant = RATE[s.label][index];
		if (!variant) fail(`${s.label} met an unexpected note: ${text}`);
		await tap(s.page, note.locator(`.rate-scale__option--${variant}`), s.label);
		await note.locator('.rate-scale__option--selected').waitFor({ timeout: 8000 });
	});
}
await shot(s1.page, '07-solutions-rated');

// S2 sends S1 an improvement idea from the board; S1 thanks from their own note.
const s2CoinsBefore = await coins(s2.page);
await backToVillage(s2.page);
await goTo(s2.page, 'board', 'S2');
const s1Note = s2.page.locator('.village-note', { hasText: TEXTS.proposal[0].slice(0, 20) });
await tap(s2.page, s1Note.locator('.village-note__open'), 'S2');
await s2.page.locator('.chat-page__input').waitFor({ timeout: 10000 });
// Same paper as every desk in the village, with its label above it.
eq(
	'the chat box is labelled',
	await s2.page.locator('.village-community__panel .chat-page__label').isVisible(),
	true,
);
const chatInk = await s2.page
	.locator('.village-community__panel .chat-page__input')
	.evaluate((el) => getComputedStyle(el).color);
eq('the chat box writes dark ink on white paper', chatInk, 'rgb(52, 73, 61)');
await s2.page
	.locator('.chat-page__input')
	.fill('אולי להוסיף שמי שנעדר מהאסיפה יכול להצביע בכתב, כדי שאף אחד לא יישאר בחוץ.');
await tap(s2.page, s2.page.locator('.chat-page__send'), 'S2');
await pause(1500);
console.log('   ✓ S2 sent S1 an improvement idea');
await backToVillage(s2.page);

await clearCelebration(s1.page, 'S1');
await backToVillage(s1.page);
await goTo(s1.page, 'board', 'S1');
await tap(s1.page, s1.page.locator('.village-note--own .village-note__open'), 'S1');
await s1.page
	.locator('button.village-note', { hasText: 'שיחה' })
	.first()
	.waitFor({ timeout: 20000 });
await tap(s1.page, s1.page.locator('button.village-note', { hasText: 'שיחה' }).first(), 'S1');
await s1.page.locator('.thread__msg .btn--primary').first().waitFor({ timeout: 10000 });
await shot(s1.page, '08-thread-before-thanks');
await tap(s1.page, s1.page.locator('.thread__msg .btn--primary').first(), 'S1');
await s1.page.locator('.thread__msg .helped__chip--thanked').waitFor({ timeout: 15000 });
console.log('   ✓ S1 thanked S2 from the village board');
await waitFor(
	'S2 was paid for helping',
	() => coins(s2.page),
	(value) => value > s2CoinsBefore,
	30_000,
);
await clearCelebration(s2.page, 'S2');
await shot(s2.page, '09-helper-coins');
eq('S2 coins grew after the thank-you', (await coins(s2.page)) > s2CoinsBefore, true);
await backToVillage(s1.page);

// ---------------------------------------------------------------------------
step('The council: the scoreboard, then only the goal');
// The score trigger runs behind every rating; let it finish before reading the board.
await waitFor(
	'the score trigger settled every proposal',
	async () => {
		const snap = await db.collection('agoraScores').where('sessionId', '==', run.sessionId).get();

		return snap.docs.filter((d) => d.data().classConsensus?.n > 0).length;
	},
	(n) => n >= 3,
	120_000,
);
// The teacher calls everyone to the council: the class walks there and the scoreboard opens.
for (const s of pages) await clearCelebration(s.page, s.label);
await teacherClick('.village-nav__call--council', 'everyone to the village council', () =>
	db
		.collection('agoraSessions')
		.doc(run.sessionId)
		.update({ villageCall: { place: 'council', at: Date.now() } }),
);
for (const s of [s1, s3]) {
	await clearCelebration(s.page, s.label);
	await s.page.locator('.village-scoreboard .board').waitFor({ timeout: 30000 });
	console.log(`   ✓ ${s.label} was walked to the council and the scoreboard opened`);
}
// The class map fills as the score trigger lands each rating — wait for all three.
const scoredBefore = await waitFor(
	'every rated proposal reached the class map',
	() => s3.page.locator('.village-scoreboard .board__point').count(),
	(n) => n === 3,
	90_000,
).catch(async (error) => {
	await shot(s3.page, 'debug-class-map');
	throw error;
});
eq('every rated proposal is on the class map', scoredBefore, 3);
await shot(s3.page, '11-council-scoreboard-panel');
await backToVillage(s1.page);
await pause(1500);
await shot(s1.page, '10-council-3d-scoreboard');

// The teacher narrows the board to the goal from the same console sheet.
let goalFromUi = false;
if (teacherUi) {
	const toggle = teacher.locator('.voting-settings__row--goal input');
	goalFromUi = await toggle.waitFor({ timeout: 20000 }).then(
		() => true,
		() => false,
	);
	if (goalFromUi) {
		await teacher.locator('.voting-settings__row--goal').scrollIntoViewIfNeeded();
		await shot(teacher, '12-teacher-goal-toggle');
		// click, not check(): the box re-renders from the stored value until the save lands
		await toggle.click();
		console.log('   ✓ teacher switched the board to the goal from the console');
	}
}
if (!goalFromUi) {
	await db
		.collection('agoraSessions')
		.doc(run.sessionId)
		.update({ 'votingSettings.goalZoneOnly': true });
	console.log('   (teacher console unavailable in this run — the setting was written directly)');
}
await waitFor(
	'goalZoneOnly reached the session',
	() => sessionDoc(run.sessionId),
	(s) => s?.votingSettings?.goalZoneOnly === true,
);
await s3.page
	.locator('.village-scoreboard .board__goal-only, .village-scoreboard .board--goal-only')
	.waitFor({ timeout: 15000 });
await pause(800);
const scoredOnly = await waitFor(
	'the goal-only board settled',
	() => s3.page.locator('.village-scoreboard .board__point').count(),
	(n) => n >= 1 && n <= 2,
	60_000,
);
console.log(`   goal-only board shows ${scoredOnly} of 3 proposals`);
await shot(s3.page, '13-scoreboard-goal-only');
await backToVillage(s3.page);
await pause(1500);
await shot(s3.page, '14-council-3d-goal-only');

// ---------------------------------------------------------------------------
step('The vote: the ballot is exactly the goal, and the bars appear when revealed');
await advance(5);
const voting = await waitFor(
	'the ballot was drawn',
	() => sessionDoc(run.sessionId),
	(s) => Array.isArray(s?.voting?.candidates),
);
const ballot = voting.voting.candidates.map((c) => c.statementId);
console.log(`   ballot: ${ballot.length} candidates`);
eq('the ballot is the goal', ballot.length, scoredOnly);
await pause(3000);
for (const s of pages) {
	await clearCelebration(s.page, s.label);
	const options = s.page.locator('.village-shell__activity button.voting__option');
	const led = await options
		.first()
		.waitFor({ state: 'visible', timeout: 30000 })
		.then(
			() => true,
			() => false,
		);
	if (!led) fail(`${s.label} was not walked to the council ballot`);
	console.log(`   ✓ ${s.label} was walked to the council and the ballot opened`);
	await tap(s.page, options.nth(s.label === 'S2' ? Math.min(1, ballot.length - 1) : 0), s.label);
	await s.page.locator('.voting__option--mine').waitFor({ timeout: 10000 });
}
console.log('   ✓ three votes cast from the council');

// The teacher's goal switch WHILE the vote runs: off puts every leading
// proposal back on the ballot; on redraws it from the goal and withdraws any
// vote for a proposal that left it.
const countedVotes = async () => {
	const question = await db
		.collection('statements')
		.doc((await sessionDoc(run.sessionId)).challengeQuestionId)
		.get();

	return Object.entries(question.data()?.selections ?? {})
		.filter(([id]) => id !== 'none')
		.reduce((sum, [, count]) => sum + Number(count), 0);
};
const setGoalLive = async (on) => {
	await teacherClick(
		'.voting-settings__row--goal-live input',
		`ballot goal switch ${on ? 'on' : 'off'}`,
		() =>
			callable(
				'agoraSetBallotGoalOnly',
				{ sessionId: run.sessionId, goalZoneOnly: on },
				run.teacherToken,
			),
	);
	return waitFor(
		`the ballot was redrawn with the goal switch ${on ? 'on' : 'off'}`,
		() => sessionDoc(run.sessionId),
		(sess) => (sess?.votingSettings?.goalZoneOnly === true) === on,
	);
};
await setGoalLive(false);
const widened = await waitFor(
	'the ballot widened to the leading proposals',
	() => sessionDoc(run.sessionId),
	(sess) => (sess?.voting?.candidates?.length ?? 0) > ballot.length,
);
const outsideGoal = widened.voting.candidates.find((c) => !ballot.includes(c.statementId));
console.log(`   ✓ goal switch off: ${widened.voting.candidates.length} proposals on the ballot`);
const s2Options = s2.page.locator('.village-shell__activity button.voting__option');
await waitFor(
	'S2 sees the wider ballot',
	() => s2Options.count(),
	(n) => n === widened.voting.candidates.length,
	30_000,
);
await tap(s2.page, s2Options.filter({ hasText: outsideGoal.statement.slice(0, 20) }).first(), 'S2');
await waitFor(
	'S2 moved their vote outside the goal',
	async () =>
		(
			await db
				.collection('votes')
				.doc(`${s2.uid}--${(await sessionDoc(run.sessionId)).challengeQuestionId}`)
				.get()
		).data()?.statementId,
	(id) => id === outsideGoal.statementId,
	30_000,
);
console.log('   ✓ S2 moved their vote to the proposal outside the goal');
await setGoalLive(true);
const narrowed = await waitFor(
	'the ballot narrowed back to the goal',
	() => sessionDoc(run.sessionId),
	(sess) => sess?.voting?.candidates?.length === ballot.length,
);
eq(
	'goal switch on: only the goal is on the ballot',
	narrowed.voting.candidates.length,
	ballot.length,
);
await waitFor("S2's orphaned vote was withdrawn", countedVotes, (n) => n === 2, 60_000);
console.log('   ✓ the vote for the removed proposal was withdrawn (2 counted)');
await s2Options.first().waitFor({ state: 'visible', timeout: 30000 });
await tap(s2.page, s2Options.nth(Math.min(1, ballot.length - 1)), 'S2');
await s2.page.locator('.voting__option--mine').waitFor({ timeout: 15000 });
console.log('   ✓ S2 voted again on the redrawn ballot');
await shot(s1.page, '15-ballot-hidden');
// The counting trigger lands a few seconds after the votes; reveal only once it has.
const questionId = (await sessionDoc(run.sessionId)).challengeQuestionId;
await waitFor(
	'the server counted all three votes',
	async () => {
		const question = await db.collection('statements').doc(questionId).get();

		return Object.entries(question.data()?.selections ?? {})
			.filter(([id]) => id !== 'none')
			.reduce((sum, [, count]) => sum + Number(count), 0);
	},
	(total) => total >= 3,
	90_000,
);
await db
	.collection('agoraSessions')
	.doc(run.sessionId)
	.update({ 'votingSettings.showResults': true });
await s1.page.locator('.voting__bar').first().waitFor({ timeout: 45000 });
await shot(s1.page, '16-ballot-bars');
console.log('   ✓ the bars appeared once the teacher revealed the tallies');
for (const s of pages) await backToVillage(s.page);
await clearCelebration(s2.page, 'S2');
await pause(1500);
await shot(s2.page, '17-council-3d-ballot-bars');

// ---------------------------------------------------------------------------
step('The recap');
await advance(6);
await waitFor(
	'the recap landed',
	() => sessionDoc(run.sessionId),
	(s) => !!s?.classScore,
	120_000,
);
await pause(2000);
await clearCelebration(s1.page, 'S1');
const recap = s1.page.locator('.village-shell__activity .board').first();
const recapLed = await recap.waitFor({ state: 'visible', timeout: 30000 }).then(
	() => true,
	() => false,
);
if (recapLed) {
	console.log('   ✓ the recap opened at the council by itself');
} else {
	await backToVillage(s1.page);
	await goTo(s1.page, 'results', 'S1');
}
await s1.page.locator('.village-shell__activity .board').first().waitFor({ timeout: 20000 });
await shot(s1.page, '18-recap');

// ---------------------------------------------------------------------------
step('Every point of the classic game was paid in the village');
for (const s of pages) {
	const doc = await waitFor(
		`${s.label} points settled`,
		() => participantDoc(run.sessionId, s.uid),
		(d) => (d?.points?.proposals ?? 0) >= 3 && (d?.points?.rating ?? 0) > 0,
		60_000,
	);
	const p = doc.points;
	console.log(
		`   ${s.label}: total ${p.total} · proposals ${p.proposals} · rating ${p.rating ?? 0} · helping ${p.helping} · appreciation ${p.appreciation ?? p.roundAppreciation ?? 0}`,
	);
	eq(`${s.label} first draft paid`, p.proposals >= 3, true);
	eq(`${s.label} rating credit paid`, (p.rating ?? 0) >= 1, true);
	eq(`${s.label} has points`, p.total > 0, true);
}
const helper = await participantDoc(run.sessionId, s2.uid);
eq('S2 helping (thank-you) paid', helper.points.helping >= 1, true);

console.log(`\n✓ village simulation complete — screenshots in ${OUT}/`);
if (!KEEP) await browser.close();

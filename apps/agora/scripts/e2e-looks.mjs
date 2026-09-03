/* Looks, end to end — a student picks, builds and borrows a look; the teacher
 * dresses the room.
 *
 * The lobby opens in candy. The student opens the style sheet, builds
 * "Grape Soda" from the swatches and wears it; a classmate builds "Lemonade"
 * and it appears on the student's class list, who borrows it; the student
 * tries solid purple, then hands the choice back to the room; the teacher
 * crowns solid purple for the class and the student's phone follows. Every
 * write goes through the real rules in the emulator, and a malformed look is
 * refused at the door.
 *
 * Asserts Firestore state; the screenshots in looks-shots/ are for eyes.
 *
 * Run: npx tsx scripts/e2e-looks.mjs
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { preflight, FIRESTORE_REST, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, mkPage, shotter, step } from './lib/e2e.mjs';
import { db, fastlane, teacherUrl } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, Collections, createAgoraParticipantId } = require('@freedi/shared-types');

await preflight();
const DIR = 'looks-shots';
mkdirSync(DIR, { recursive: true });
const shot = shotter(DIR);
const runId = `looks-${Date.now().toString(36)}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(label, probe, { timeoutMs = 20_000, every = 400 } = {}) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await probe();
		if (value) return value;
		if (Date.now() > deadline) fail(`${label}: timed out`);
		await wait(every);
	}
}

const participant = async (sessionId, uid) =>
	(await db.collection(Collections.agoraParticipants).doc(createAgoraParticipantId(sessionId, uid)).get()).data();
const session = async (sessionId) =>
	(await db.collection(Collections.agoraSessions).doc(sessionId).get()).data();

/** A participant PATCH as a signed-in client sends it — the rules apply */
async function patchParticipant(sessionId, uid, idToken, fields) {
	const id = createAgoraParticipantId(sessionId, uid);
	const mask = Object.keys(fields).map((f) => `updateMask.fieldPaths=${f}`).join('&');
	const response = await fetch(`${FIRESTORE_REST}/agoraParticipants/${id}?${mask}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
		body: JSON.stringify({ fields }),
	});

	return response.status;
}
const str = (value) => ({ stringValue: value });
const num = (value) => ({ integerValue: String(value) });
const map = (fields) => ({ mapValue: { fields } });
const lookFields = (name, authorId, seeds) =>
	map({
		name: str(name),
		authorId: str(authorId),
		createdAt: num(Date.now()),
		seeds: map(Object.fromEntries(Object.entries(seeds).map(([k, v]) => [k, str(v)]))),
	});

const game = await fastlane({ stage: AgoraStage.lobby, students: 2, proposals: 0, quiet: true, runId });
const { sessionId } = game;
const [mate] = game.bots;

const browser = await chromium.launch();
try {
	step('student: the lobby opens in candy');
	const student = await mkPage(browser, 'student', { width: 430, height: 900 });
	await student.goto(game.joinUrl, { waitUntil: 'domcontentloaded' });
	await student.waitForSelector('.lobby__look button', { timeout: 30_000 });
	await student.waitForTimeout(800);
	eq('document wears candy', await student.evaluate(() => document.documentElement.dataset.sessionTheme), 'candy');
	await shot(student, '1-lobby-candy');
	const myUid = await student.evaluate(() => window.__agoraDebug().user.user.uid);

	step('student: the sheet, then the builder');
	await student.click('.lobby__look button');
	await student.waitForSelector('.look-sheet .look-card', { timeout: 10_000 });
	await shot(student, '2-sheet-picker');
	await student.click('.look-card--build');
	await student.waitForSelector('.look-builder', { timeout: 10_000 });
	await shot(student, '3-builder-default');
	// Paper: light sky. Mine: grape. Classmates: green apple. Go: lemon.
	const pick = async (seedIndex, hex) =>
		student.locator('.look-builder__seed').nth(seedIndex).locator(`.look-swatch[style*="${hex}"]`).click();
	await pick(0, 'rgb(238, 247, 255)');
	await pick(1, 'rgb(123, 47, 242)');
	await pick(2, 'rgb(18, 128, 63)');
	await pick(3, 'rgb(255, 212, 0)');
	await student.fill('.look-builder input.text-input', 'Grape Soda');
	await student.waitForTimeout(300); // Mithril redraws on the next frame
	await shot(student, '4-builder-grape-soda');
	await student.click('.look-builder__actions .btn--primary');
	await student.waitForSelector('.look-sheet', { state: 'detached', timeout: 10_000 });
	await student.waitForTimeout(600);
	eq('document wears the built look', await student.evaluate(() => document.documentElement.dataset.sessionTheme), 'custom');
	eq('the mine seed reached the page', await student.evaluate(() => document.documentElement.style.getPropertyValue('--seed-mine')), '#7b2ff2');
	await shot(student, '5-lobby-grape-soda');
	const built = await until('built look written', async () => (await participant(sessionId, myUid))?.builtTheme);
	eq('builtTheme.name', built.name, 'Grape Soda');
	eq('builtTheme.authorId', built.authorId, myUid);
	eq('wearing it', (await participant(sessionId, myUid)).theme.preset, 'custom');

	step('classmate: builds Lemonade through the rules; the student borrows it');
	const lemonade = { page: '#fffbe3', mine: '#c24a08', peer: '#1668d8', go: '#ffd400' };
	const status = await patchParticipant(sessionId, mate.uid, mate.idToken, {
		builtTheme: lookFields('Lemonade', mate.uid, lemonade),
		theme: map({ preset: str('custom'), custom: lookFields('Lemonade', mate.uid, lemonade) }),
	});
	eq('classmate may build a look', status, 200);
	await student.click('.stage-nav__look');
	await student.waitForSelector('.look-sheet .look-card', { timeout: 10_000 });
	const lemonadeCard = student.locator('.look-card', { hasText: 'Lemonade' });
	await lemonadeCard.waitFor({ timeout: 10_000 });
	eq('the maker is named', (await lemonadeCard.locator('.look-card__by').textContent()).includes(mate.anonName), true);
	await shot(student, '6-sheet-with-class-look');
	await lemonadeCard.click();
	await student.waitForTimeout(600);
	eq('the tangerine seed reached the page', await student.evaluate(() => document.documentElement.style.getPropertyValue('--seed-mine')), '#c24a08');
	await shot(student, '7-lobby-lemonade');
	const borrowed = await until('borrowed look written', async () => {
		const doc = await participant(sessionId, myUid);

		return doc?.theme?.custom?.authorId === mate.uid ? doc : null;
	});
	eq('my built look survives borrowing', borrowed.builtTheme.name, 'Grape Soda');

	step('student: solid purple, then back to the room');
	await student.click('.stage-nav__look');
	await student.locator('.look-card', { hasText: /Solid purple|סגול מלא/ }).click();
	await student.waitForTimeout(600);
	eq('document wears purple', await student.evaluate(() => document.documentElement.dataset.sessionTheme), 'purple');
	await shot(student, '8-lobby-purple');
	await student.click('.stage-nav__look');
	await student.locator('.look-sheet button', { hasText: /class look|הכיתה/ }).click();
	await student.waitForTimeout(600);
	eq('back to candy', await student.evaluate(() => document.documentElement.dataset.sessionTheme), 'candy');
	await until('pick cleared', async () => (await participant(sessionId, myUid)).theme === null);

	step('rules: a malformed look is refused');
	eq(
		'unknown preset refused',
		await patchParticipant(sessionId, mate.uid, mate.idToken, { theme: map({ preset: str('neon') }) }),
		403,
	);
	eq(
		'bad colour refused',
		await patchParticipant(sessionId, mate.uid, mate.idToken, {
			builtTheme: lookFields('Bad', mate.uid, { ...lemonade, mine: 'purple' }),
		}),
		403,
	);
	eq(
		'a novel for a name refused',
		await patchParticipant(sessionId, mate.uid, mate.idToken, {
			builtTheme: lookFields('x'.repeat(25), mate.uid, lemonade),
		}),
		403,
	);

	step('teacher: dresses the room in purple; the student follows');
	const teacher = await mkPage(browser, 'teacher', { width: 1280, height: 1000 });
	await teacher.goto(`${VITE_HOST}/#!/teach`, { waitUntil: 'domcontentloaded' });
	await teacher.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 15_000 });
	await teacher.evaluate(
		(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'Fastlane Teacher' }),
		`${runId}-teacher`,
	);
	await teacher.waitForTimeout(1500);
	await teacher.goto(teacherUrl(sessionId), { waitUntil: 'domcontentloaded' });
	await teacher.waitForSelector('.teacher-look .look-card', { timeout: 30_000 });
	await shot(teacher, '9-teacher-look-card');
	const cards = await teacher.locator('.teacher-look .look-card').count();
	eq('teacher sees presets + two class looks', cards, 4);
	await teacher.locator('.teacher-look .look-card', { hasText: /Solid purple|סגול/ }).click();
	await until('room theme written', async () => (await session(sessionId)).theme?.preset === 'purple');
	await student.waitForFunction(() => document.documentElement.dataset.sessionTheme === 'purple', null, { timeout: 10_000 });
	await shot(student, '10-lobby-follows-room-purple');
	await teacher.waitForTimeout(600);
	eq('teacher console wears the room look', await teacher.evaluate(() => document.documentElement.dataset.sessionTheme), 'purple');
	await shot(teacher, '11-teacher-purple');

	console.log('\n✓ looks e2e passed');
} finally {
	await browser.close();
}

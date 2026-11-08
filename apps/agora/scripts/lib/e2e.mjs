/**
 * The bits every browser-driving script needs, said once.
 *
 * `step`, `fail`, `eq`, `mkPage`, `shot` and a clearer for the celebration
 * overlay were copy-pasted across seven scripts — byte-identical in most, and
 * subtly different in the rest, which is the worse half of that trade: a fix
 * to the console-error plumbing in one script left the other six blind.
 *
 * Deliberately thin. These are reporting and setup conveniences, not a
 * framework: each script still says what it is testing in its own voice, and
 * nothing here knows anything about Agora's rules.
 */
import { FIRESTORE_REST } from './preflight.mjs';

/** Announce a phase. The scripts read as a narrative; keep it that way. */
export const step = (msg) => console.log(`\n=== ${msg}`);

export const fail = (msg) => {
	throw new Error(msg);
};

/** Assert and SAY the value — a passing line that prints the number it checked. */
export const eq = (label, actual, expected) => {
	if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual}`);
	console.log(`   ✓ ${label} = ${actual}`);
};

/**
 * A student's browser.
 *
 * The console wiring is the point: a Mithril render that throws surfaces as a
 * console error rather than a pageerror, and a blank screen with no output is
 * the worst possible failure report. Language is pinned before first paint so
 * selectors that match Hebrew copy are not racing i18n.
 */
export async function mkPage(browser, label, options = {}) {
	const { width = 1280, height = 800, lang = process.env.AGORA_LANG ?? 'he' } = options;
	const context = await browser.newContext({ viewport: { width, height } });
	const page = await context.newPage();
	await page.addInitScript(
		(chosen) => window.localStorage.setItem('agora_lang', chosen),
		lang,
	);
	page.on('pageerror', (error) =>
		console.log(`[${label} PAGEERROR]`, error.message.slice(0, 160)),
	);
	page.on('console', (message) => {
		if (message.type() === 'error') console.log(`[${label} CONSOLE]`, message.text().slice(0, 160));
	});

	return page;
}

/** Screenshot into a run's own directory. */
export const shotter = (dir) => (page, name) => page.screenshot({ path: `${dir}/${name}.png` });

/**
 * Celebrations are modal by design — they are the reward moments — so one left
 * open blocks the next click. Every script that drives past a credit needs this.
 */
export async function clearCelebration(page, label = '') {
	for (let attempt = 0; attempt < 5; attempt++) {
		if ((await page.locator('.celebration').count()) === 0) return;
		const message = await page
			.locator('.celebration__message')
			.first()
			.textContent()
			.catch(() => '');
		await page
			.locator('.celebration button.btn')
			.last()
			.click({ timeout: 5000 })
			.catch(() => {});
		await page.waitForTimeout(400);
		if (label && message) console.log(`   (${label} celebration: ${message.trim()})`);
	}
}

/**
 * Read a document straight from the emulator's REST API.
 *
 * Three scripts hardcoded this host despite preflight exporting it, so a port
 * change fixed the check and broke the assertions.
 */
export async function restDoc(path) {
	const response = await fetch(`${FIRESTORE_REST}/${path}`);
	if (!response.ok) return null;

	return response.json();
}

export { FIRESTORE_REST };

/**
 * The door now asks for a real name (for the teacher alone) before the
 * lobby. A script driving the join UI meets it on every classroom session;
 * this answers it — with a name when one is given, otherwise by skipping —
 * and returns at once when the door is not there (civic squares, opted-out
 * lessons, a returning student).
 */
export async function passNameDoor(page, name = '') {
	const input = page.locator('input.join__name-input');
	const appeared = await input
		.waitFor({ state: 'visible', timeout: 4000 })
		.then(() => true, () => false);
	if (!appeared) return;
	if (name) {
		await input.fill(name);
		await page.locator('button.btn--primary').first().click();
	} else {
		await page.locator('button.btn--ghost').first().click();
	}
}

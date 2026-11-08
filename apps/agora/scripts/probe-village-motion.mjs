/* Probe: what happens, frame by frame, when a student is sent to a station
 * and when they press the guide's "write" button.
 *
 * Records every shell ↔ world message and samples, every 100 ms, the world's
 * walker (distance to the guide and the approach point, walking / turning,
 * the guide's bubble) and the shell's paper (open, bubble, waiting, and its
 * on-screen opacity). Prints only the moments something changed.
 *
 * What healthy looks like: one `ready` for the whole lesson (a second one is
 * the 3D world reloading); each walk only closes in on its approach point;
 * pressing the guide's button turns `paperSeen` 0 → 1 once, never 1 → 0 → 1.
 * It found both glitches Tal saw on 2026-09-14 that pass/fail scripts miss.
 *
 * Run (solo suite): bash ../../scripts/solo.sh npx tsx scripts/probe-village-motion.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { clearCelebration, mkPage, passNameDoor } from './lib/e2e.mjs';
import { callable, db, fastlane } from './lib/fastlane.ts';

await preflight();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PLAN = [
	{ itemId: 'lobby', stage: 'lobby' },
	{ itemId: 'round-story', stage: 'question', kind: 'story' },
	{ itemId: 'deliberation', stage: 'deliberation' },
	{ itemId: 'results', stage: 'results' },
];
const run = await fastlane({
	stage: 'lobby',
	students: 0,
	proposals: 0,
	ratings: false,
	stagePlan: PLAN,
	runId: `probe-${Date.now().toString(36)}`,
	quiet: true,
});
await db.collection('agoraSessions').doc(run.sessionId).update({ world: 'village' });
console.log(`session ${run.sessionId} (code ${run.code})`);

const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await mkPage(browser, 'P', { width: 1360, height: 860 });
const t0 = Date.now();
const events = [];
const note = (kind, data) => events.push({ t: Date.now() - t0, kind, ...data });
page.on('console', (message) => {
	const text = message.text();
	if (text.startsWith('[probe]')) note('msg', JSON.parse(text.slice(7)));
});
await page.addInitScript(() => {
	let lastState = '';
	addEventListener('message', (event) => {
		const d = event.data;
		if (!d || typeof d !== 'object' || typeof d.type !== 'string' || !d.type.startsWith('agora-village'))
			return;
		if (d.type === 'agora-village-state') {
			const key = `${d.itemId}|${d.place}|${d.paused}`;
			if (key === lastState) return;
			lastState = key;
		}
		const where = window === window.top ? 'shell←world' : 'world←shell';
		console.log(
			'[probe]' +
				JSON.stringify({
					where,
					type: d.type.replace('agora-village-', ''),
					place: d.place,
					view: d.view,
					paused: d.paused,
					itemId: d.itemId,
					reason: d.reason,
				}),
		);
	});
});

let phase = 'join';
let sampling = true;
async function sampler() {
	while (sampling) {
		try {
			const shell = await page.evaluate(() => {
				const a = document.querySelector('.village-shell__activity');

				return {
					paperOpen: a ? getComputedStyle(a).display !== 'none' : false,
					// What the eye sees: 0 / 0.5 / 1 — catches a paper that shows, hides and shows again.
					paperSeen: a && getComputedStyle(a).display !== 'none' ? Math.round(Number(getComputedStyle(a).opacity) * 2) / 2 : 0,
					paperBubble: !!document.querySelector('.village-bubble'),
					paperWaiting: !!document.querySelector('.village-bubble--waiting'),
					board: !!document.querySelector('.village-community__panel'),
				};
			});
			const frame = page.frames().find((f) => f.url().includes('village.html'));
			const world = frame ? await frame.evaluate(() => window.__villageDebug?.() ?? null) : null;
			note('sample', { phase, ...shell, ...(world ?? {}) });
		} catch {
			// a navigation in progress
		}
		await pause(100);
	}
}
const sampling$ = sampler();

await page.goto(`${VITE_HOST}/#!/join/${run.code}`, { waitUntil: 'domcontentloaded' });
await passNameDoor(page, 'בדיקה');
await page.locator('iframe.village-shell__world').waitFor({ timeout: 30000 });
await pause(8000);

phase = 'advance→story';
await callable('agoraAdvanceStage', { sessionId: run.sessionId, toIndex: 1 }, run.teacherToken);
await pause(16000);

phase = 'press-write(story)';
const world = page.frameLocator('iframe.village-shell__world');
await clearCelebration(page);
await world.locator('#desk-write').click({ timeout: 20000 });
await pause(6000);

phase = 'close-paper';
await page.locator('.place-bar__item[data-place="village"]').first().click();
await pause(3000);

phase = 'advance→deliberation';
await callable('agoraAdvanceStage', { sessionId: run.sessionId, toIndex: 2 }, run.teacherToken);
await pause(16000);

phase = 'press-write(deliberation)';
await clearCelebration(page);
await world.locator('#desk-write').click({ timeout: 20000 });
await pause(6000);

sampling = false;
await sampling$;
await browser.close();

mkdirSync('output/probe', { recursive: true });
writeFileSync('output/probe/village-motion.json', JSON.stringify(events, null, 1));

// Only what changed: messages, and sample fields whose value moved.
const WATCH = [
	'paperOpen',
	'paperSeen',
	'paperBubble',
	'paperWaiting',
	'board',
	'moving',
	'turning',
	'viewKind',
	'selected',
	'activePlace',
	'uiPaused',
	'flight',
	'guideBubble',
];
let prev = {};
let trend = '';
let lastD = null;
for (const e of events) {
	if (e.kind === 'msg') {
		const { t, kind, ...m } = e;
		console.log(`${String(t).padStart(6)}ms  ✉ ${JSON.stringify(m)}`);
		continue;
	}
	const changed = WATCH.filter((k) => JSON.stringify(e[k]) !== JSON.stringify(prev[k])).map(
		(k) => `${k}=${JSON.stringify(e[k])}`,
	);
	// The walker's distance to the guide: report each turn from closing in to backing off.
	if (typeof e.dGuide === 'number' && lastD !== null && Math.abs(e.dGuide - lastD) > 0.05) {
		const next = e.dGuide < lastD ? 'closer' : 'farther';
		if (next !== trend) changed.push(`→ ${next} (dGuide ${lastD}→${e.dGuide}, dApproach ${e.dApproach})`);
		trend = next;
	}
	if (typeof e.dGuide === 'number') lastD = e.dGuide;
	if (changed.length) console.log(`${String(e.t).padStart(6)}ms  [${e.phase}] ${changed.join('  ')}`);
	prev = e;
}
process.exit(0);

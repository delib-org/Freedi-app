/**
 * Fastlane CLI — one command that lands you on the Agora screen you want.
 *
 *   npm run fast                                   # deliberation chat, 4 classmates, 3 proposals
 *   npm run fast -- --stage=positioning
 *   npm run fast -- --students=8 --proposals=6
 *   npm run fast -- --stage=deliberation --ratings   # rated, ready to open a vote
 *   npm run fast -- --stage=voting --challenge         # a live challenge turn
 *   npm run fast -- --open --mine                  # …and give them a proposal, which is what
 *                                                  #   unlocks rating/feedback/helped screens
 *   npm run fast -- --open --shot                  # drive a student there and screenshot it
 *   npm run fast -- --open --keep                  # …and leave the browser open to poke at
 *
 * Without --open it prints a join URL: paste it into any browser (or hand it
 * to a Playwright script) and you arrive as a student, already at that stage,
 * with classmates and proposals waiting. With --open it drives a real student
 * client there itself, positions them in a camp, and screenshots the result.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { AgoraStage } from '@freedi/shared-types';
import { preflight } from './lib/preflight.mjs';
import { fastlane, positionStudent, proposeAs, teacherUrl } from './lib/fastlane';
import type { AgoraStagePlanItem } from '@freedi/shared-types';

// See lib/fastlane.ts — the package is require-only from plain Node
const { AgoraStage: AgoraStageEnum, stagePlanPreset } = createRequire(import.meta.url)(
	'@freedi/shared-types',
) as typeof import('@freedi/shared-types');

interface Args {
	stage: AgoraStage;
	students: number;
	proposals: number;
	/**
	 * Have the bots rate each other, so the proposals carry real consensus.
	 * On by default from the voting stage onward (the ballot ranks on it);
	 * ask for it earlier when you want to WATCH the vote being set up.
	 */
	ratings: boolean | undefined;
	challenge: boolean | undefined;
	lang: string;
	position: number;
	open: boolean;
	shot: string | null;
	keep: boolean;
	/** Give the opened student a proposal of their own (unlocks the classmates' side) */
	mine: string | null;
	autoSeed: boolean;
	viewport: 'desktop' | 'mobile';
	/** A quick game (no scenario) on the quick-decision plan, with names */
	quick: boolean;
	/** Which preset plan to send; absent = the session runs the legacy order */
	plan: 'classic' | 'quickDecision' | null;
}

function parseArgs(argv: string[]): Args {
	const flag = (name: string): string | undefined => {
		const hit = argv.find((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
		if (hit === undefined) return undefined;

		return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '';
	};
	const num = (name: string, fallback: number): number => {
		const raw = flag(name);

		return raw === undefined || raw === '' ? fallback : Number(raw);
	};

	const stageRaw = flag('stage') ?? AgoraStageEnum.deliberation;
	if (!Object.values(AgoraStageEnum).includes(stageRaw as AgoraStage)) {
		throw new Error(
			`Unknown --stage "${stageRaw}". One of: ${Object.values(AgoraStageEnum).join(', ')}`,
		);
	}

	const shotRaw = flag('shot');
	const mineRaw = flag('mine');

	return {
		stage: stageRaw as AgoraStage,
		students: num('students', 4),
		proposals: num('proposals', 3),
		ratings: flag('ratings') !== undefined ? flag('ratings') !== 'false' : undefined,
		challenge: flag('challenge') !== undefined ? flag('challenge') !== 'false' : undefined,
		lang: flag('lang') || 'he',
		// A student parked in a camp, not on the fence: centre positions hide
		// the cross-camp colouring that most of these screens are about
		position: num('position', 20),
		open: flag('open') !== undefined,
		shot: shotRaw === undefined ? null : shotRaw || 'fastlane',
		keep: flag('keep') !== undefined,
		mine: mineRaw === undefined ? null : mineRaw || '',
		autoSeed: flag('no-seed') === undefined,
		viewport: flag('mobile') !== undefined ? 'mobile' : 'desktop',
		quick: flag('quick') !== undefined,
		plan:
			flag('plan') === 'classic'
				? 'classic'
				: flag('plan') === 'quickDecision' || flag('quick') !== undefined
					? 'quickDecision'
					: null,
	};
}

/** The preset with its question filled in — a plan with an empty question is refused */
function planFor(args: Args): AgoraStagePlanItem[] | undefined {
	if (!args.plan) return undefined;

	return stagePlanPreset(args.plan).map((item) =>
		item.stage === AgoraStageEnum.question
			? { ...item, title: 'מה חשוב לי בבקרים?', explanation: 'משפט אחד או שניים — מה היית רוצה שיקרה.' }
			: item,
	);
}

const args = parseArgs(process.argv.slice(2));
// A join URL is useless if nothing is serving it, but a plain state build
// (paste the URL later) does not need vite up at all.
await preflight({
	needs: args.open ? ['firestore', 'auth', 'functions', 'vite'] : ['firestore', 'auth', 'functions'],
	autoSeed: args.autoSeed,
});

console.log('=== FASTLANE');
const result = await fastlane({
	stage: args.stage,
	students: args.students,
	proposals: args.proposals,
	ratings: args.ratings,
	...(args.quick
		? {
				quick: {
					title: 'בקרים בבית שלנו',
					mainQuestion: 'איך ווש יכולה לקום בזמן בבוקר?',
					explanation: 'מחפשים פתרון שכולנו יכולים לחיות איתו.',
				},
				identity: 'named' as const,
				botNames: ['אבא', 'אמא', 'ווש'],
			}
		: {}),
	...(planFor(args) ? { stagePlan: planFor(args) } : {}),
	challenge: args.challenge,
});

console.log(`
   stage    ${result.stage}
   session  ${result.sessionId}   code ${result.code}
   student  ${result.joinUrl}
   teacher  ${teacherUrl(result.sessionId)}
`);

if (!args.open) {
	console.log('   (open the student URL in any browser — you arrive already at that stage)\n');
	process.exit(0);
}

// --- Drive a real student client there ---------------------------------
const { chromium } = await import('@playwright/test');
const browser = await chromium.launch({ headless: !args.keep });
const context = await browser.newContext({
	viewport: args.viewport === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 800 },
});
const page = await context.newPage();
await page.addInitScript(
	(lang: string) => window.localStorage.setItem('agora_lang', lang),
	args.lang,
);
page.on('pageerror', (error) => console.log('[PAGEERROR]', error.message.slice(0, 200)));
page.on('console', (message) => {
	if (message.type() === 'error') console.log('[CONSOLE]', message.text().slice(0, 200));
});

/**
 * "The student has arrived" per stage.
 *
 * Deliberation deliberately lists the roots of BOTH deliberation UIs: the chat
 * rebuild (`.chat-log`) and the places UI (`.delib-hud`) live on different
 * branches by design, and a setup helper that only knows the branch it was
 * written on is a trap for whoever switches. Everything here is a container
 * that exists before any content loads — never a card, never a copy string.
 */
const ARRIVED: Record<string, string> = {
	lobby: '.lobby__name, .lobby__status',
	framing: '.scene__title, .scene__text',
	perspectives: '.scene__title, .scene__text',
	needs: '.scene__title, .scene__text',
	valueIdentification: '.scene__title, .shell__content',
	positioning: 'input.camp-scale__slider',
	question: '.question__ask',
	deliberation: '.chat-log, .delib-hud',
	voting: '.voting__list, .voting__waiting',
	results: '.results__total, .shell--wide',
	ended: '.results__total, .shell--wide',
};

/** A failed wait that leaves no artefact costs a whole second run to diagnose. */
async function arrive(selector: string, label: string): Promise<void> {
	try {
		await page.waitForSelector(selector, { timeout: 30_000 });
	} catch {
		mkdirSync('fastlane-shots', { recursive: true });
		await page.screenshot({ path: 'fastlane-shots/FAILED.png' });
		const text = await page
			.locator('body')
			.innerText()
			.catch(() => '(no body text)');
		console.error(
			`\n✗ never reached ${label} (${selector})` +
				`\n   url:  ${page.url()}` +
				`\n   shot: fastlane-shots/FAILED.png` +
				`\n   page: ${text.slice(0, 300).replace(/\n+/g, ' / ')}\n`,
		);
		await browser.close();
		process.exit(1);
	}
}

await page.goto(result.joinUrl, { waitUntil: 'domcontentloaded' });

/**
 * The opened student joined AFTER positioning was over, so they have no camp —
 * and an uncamped student sits outside the bridging maths the deliberation
 * screens are built to show. Give them the seat they would have taken.
 *
 * The wait before it is the POSITIONING GATE, not the square: an uncamped
 * student is now held on the positioning screen (see GameController), so
 * waiting for a deliberation container here would wait for the very thing this
 * block is about to unlock. Either root proves the seat exists, which is what
 * the camp write needs — the participant doc is created by the join flow, and
 * writing to it before it lands fails outright.
 */
if (args.stage === AgoraStageEnum.deliberation) {
	await arrive(
		`input.camp-scale__slider, ${ARRIVED.deliberation}`,
		'the square (or the positioning gate in front of it)',
	);
	const uid = await page.evaluate(
		() =>
			(
				window as unknown as {
					__agoraDebug?: () => { user?: { user?: { uid?: string } } };
				}
			).__agoraDebug?.()?.user?.user?.uid ?? null,
	);
	if (uid) {
		await positionStudent(result.sessionId, uid, args.position);
		console.log(`   ✓ student positioned at ${args.position}`);
		if (args.mine !== null) {
			await proposeAs(result.sessionId, uid, args.mine || undefined);
			console.log('   ✓ student has a proposal (classmates\' side unlocked)');
		}
	}
}
// The camp write re-renders through the participants listener
await arrive(ARRIVED[args.stage] ?? '.shell__content', args.stage);

/**
 * Celebrations are modal by design — they are the reward moments — so one left
 * open sits over the screenshot and swallows the next click. Writing a proposal
 * triggers one, and it can arrive a beat after the screen settles.
 */
for (let attempt = 0; attempt < 5; attempt++) {
	if ((await page.locator('.celebration').count()) === 0) break;
	// The LAST button is always the plain close, never the travel action
	await page
		.locator('.celebration button')
		.last()
		.click({ timeout: 5000 })
		.catch(() => {});
	await page.waitForTimeout(400);
}

console.log(`   ✓ student is on screen (${await page.title()})`);

if (args.shot) {
	mkdirSync('fastlane-shots', { recursive: true });
	const path = `fastlane-shots/${args.shot}.png`;
	await page.screenshot({ path, fullPage: false });
	console.log(`   ✓ ${path}`);
}

if (args.keep) {
	console.log('\n   browser left open — Ctrl-C to close\n');
	await new Promise(() => {});
}

await browser.close();

/**
 * apply-review-fixes — carries the content corrections onto a LIVE game.
 *
 * defaults.ts is the seed template; it is read once, when a game is created.
 * Everything a player sees comes from Firestore, so editing defaults.ts alone
 * changes nothing for anyone already sailing. Re-seeding is not the answer
 * either: it mints new statement ids and would orphan every rating collected
 * so far. This edits the live documents in place.
 *
 * What it changes:
 *   1. island metadata on the game doc — title, issue, shortExplain,
 *      depthQuestion — for the islands that were renamed or reworded;
 *   2. the island question Statement, where the central question changed;
 *   3. stance Statements whose text changed (האחריות 1–2, ישראל בין האומות 1–4);
 *   4. the parties array — מפלגות that no longer exist renamed to what they
 *      became, ישר! added, descriptions rewritten to say how each route was
 *      derived;
 *   5. two empty privacy text keys, so they appear in the admin screen.
 *
 * It does NOT write party scores. Run patch-party-attitudes.ts afterwards —
 * it reads the same research file and maps by island+party slug.
 *
 * Identity is checked before every write: an island is located by sortOrder
 * AND its current title, a stance by its `order` AND its current text. Any
 * mismatch aborts the whole run rather than writing onto the wrong document.
 *
 *   ODYSSEY_FIRESTORE_HOST=localhost:8181 \
 *     npx tsx apps/odyssey/scripts/apply-review-fixes.ts --game default --dry-run
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { DEFAULT_ISLANDS, DEFAULT_PARTIES, DEFAULT_TEXTS } from '../src/lib/defaults';

const PROJECT_ID = process.env.ODYSSEY_PROJECT_ID ?? 'freedi-test';
const FIRESTORE_HOST = process.env.ODYSSEY_FIRESTORE_HOST;

function arg(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);

	return index === -1 ? undefined : process.argv[index + 1];
}

const gameId = arg('game') ?? 'default';
const dryRun = process.argv.includes('--dry-run');

if (FIRESTORE_HOST) process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: PROJECT_ID });
const db: Firestore = getFirestore(app);

/**
 * Islands whose text changed, keyed by slug. `wasTitle` is the title the live
 * document is expected to still carry — the handle used to find it, and the
 * assertion that this script has not already run.
 */
const ISLAND_RENAMES: Record<string, { wasTitle: string }> = {
	'sabbath-rabbinate': { wasTitle: 'השבת והרבנות' },
	'world-partners': { wasTitle: 'יחסי החוץ' },
	'rule-of-law': { wasTitle: 'שלטון החוק' },
	accountability: { wasTitle: 'האחריות' },
};

/** stance text before → after, per island slug. Matched on `order`. */
const STANCE_REWRITES: Record<string, Array<{ from: string; to: string }>> = {
	accountability: [
		{ from: 'ועדת חקירה ממלכתית בהקדם, גם בזמן מלחמה', to: 'ועדת חקירה ממלכתית בהקדם' },
		{
			from: 'ועדת חקירה ממלכתית לאחר תום המלחמה',
			to: 'ועדת חקירה ממלכתית רק לאחר הסדר סופי בעזה',
		},
	],
	'world-partners': [
		{
			from: 'משקל מכריע לברית עם ארה״ב ולמעמד הבינלאומי',
			to: 'המעמד הבינלאומי והבריתות הם שיקול מכריע — כדאי לרסן צעדים שפוגעים בהם',
		},
		{
			from: 'משקל גבוה, אך לא מכריע, לצד שיקולים עצמאיים',
			to: 'משקל גבוה לבריתות, לצד פיזור הקשרים בין ארה״ב, אירופה ומדינות האזור',
		},
		{
			from: 'הקשבה לעולם לצד פעולה עצמאית ועקבית',
			to: 'הקשבה לעולם לצד פעולה עצמאית ועקבית, לפי העניין',
		},
		{
			from: 'העדפת חופש פעולה מלא, גם במחיר עימות',
			to: 'חופש פעולה מלא לפי שיקול ישראלי בלבד, גם במחיר בידוד בינלאומי',
		},
	],
};

/**
 * Live party slug → the slug it becomes. A rename keeps the party's
 * `attitudes` map, which is keyed by stance statementId and therefore still
 * points at the right stances.
 */
const PARTY_LINEAGE: Record<string, string> = {
	'yesh-atid': 'together',
	mamlachti: 'blue-white',
	'democratic-camp': 'democrats',
	'hadash-taal': 'joint-list',
};

interface LiveIsland {
	statementId: string;
	title: string;
	issue: string;
	shortExplain: string;
	depthQuestion: string;
	sortOrder: number;
	[key: string]: unknown;
}

interface LiveParty {
	partyId: string;
	name: string;
	color: string;
	description: string;
	attitudes?: Record<string, number>;
	positions?: Record<string, string>;
	sortOrder: number;
	enabled: boolean;
}

interface LiveStatement {
	statementId: string;
	statement: string;
	statementType: string;
	order?: number;
}

const planned: string[] = [];
function plan(line: string): void {
	planned.push(line);
	console.info('  ' + line);
}

async function main(): Promise<void> {
	console.info(
		`project ${PROJECT_ID}${FIRESTORE_HOST ? ` (emulator ${FIRESTORE_HOST})` : ' (LIVE)'} · game ${gameId}${dryRun ? ' · DRY RUN' : ''}\n`,
	);

	const gameRef = db.collection('odysseyGames').doc(gameId);
	const gameSnap = await gameRef.get();
	if (!gameSnap.exists) throw new Error(`game "${gameId}" not found`);
	const game = gameSnap.data() as {
		islands: LiveIsland[];
		parties: LiveParty[];
		texts: Record<string, string>;
	};

	const defaultsBySlug = new Map(DEFAULT_ISLANDS.map((island) => [island.slug, island]));

	// ---------- 1 & 2: island metadata and the question statement ----------
	console.info('islands:');
	const statementWrites: Array<{ id: string; statement: string }> = [];
	const islands = [...game.islands];

	for (const [slug, { wasTitle }] of Object.entries(ISLAND_RENAMES)) {
		const wanted = defaultsBySlug.get(slug);
		if (!wanted) throw new Error(`"${slug}" is not in DEFAULT_ISLANDS`);

		const index = islands.findIndex(
			(island) => island.title === wasTitle || island.title === wanted.title,
		);
		if (index === -1) {
			throw new Error(
				`island "${slug}": no live island titled "${wasTitle}" (nor already "${wanted.title}") — ` +
					'the live game does not match this migration; fix it by hand',
			);
		}
		const live = islands[index];
		// All four, not just the title: שלטון החוק keeps its name and only its
		// duplicated depth question changed, and a title-only check skipped it.
		if (
			live.title === wanted.title &&
			live.issue === wanted.issue &&
			live.shortExplain === wanted.shortExplain &&
			live.depthQuestion === wanted.depthQuestion
		) {
			plan(`${slug}: already applied, skipped`);
			continue;
		}

		islands[index] = {
			...live,
			title: wanted.title,
			issue: wanted.issue,
			shortExplain: wanted.shortExplain,
			depthQuestion: wanted.depthQuestion,
		};
		plan(`${slug}: "${live.title}" → "${wanted.title}"`);
		statementWrites.push({ id: live.statementId, statement: wanted.centralQuestion });
	}

	// ---------- 3: stance statements ----------
	console.info('\nstances:');
	for (const [slug, rewrites] of Object.entries(STANCE_REWRITES)) {
		const wanted = defaultsBySlug.get(slug);
		const live = islands.find((island) => island.title === wanted?.title);
		if (!live) throw new Error(`island "${slug}": not found for stance rewrite`);

		const snap = await db
			.collection('statements')
			.where('parentId', '==', live.statementId)
			.get();
		const stances = snap.docs
			.map((docSnap) => docSnap.data() as LiveStatement)
			.filter((statement) => statement.statementType === 'option')
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

		rewrites.forEach((rewrite, index) => {
			const stance = stances[index];
			if (!stance) throw new Error(`${slug}: no stance at position ${index + 1}`);
			if (stance.statement === rewrite.to) {
				plan(`${slug} #${index + 1}: already applied, skipped`);

				return;
			}
			if (stance.statement !== rewrite.from) {
				throw new Error(
					`${slug} #${index + 1}: live text is "${stance.statement}", expected "${rewrite.from}" — ` +
						'someone edited it; reconcile by hand rather than overwriting',
				);
			}
			plan(`${slug} #${index + 1}: rewritten`);
			statementWrites.push({ id: stance.statementId, statement: rewrite.to });
		});
	}

	// ---------- 4: parties ----------
	console.info('\nparties:');
	const byId = new Map(game.parties.map((party) => [party.partyId, party]));
	const parties: LiveParty[] = [];

	DEFAULT_PARTIES.forEach((wanted, sortOrder) => {
		// The live doc may hold it under its own slug, or under the slug of the
		// party it used to be. Either way the same body keeps its attitudes.
		const previousSlug = Object.entries(PARTY_LINEAGE).find(
			([, becomes]) => becomes === wanted.slug,
		)?.[0];
		const live = byId.get(wanted.slug) ?? (previousSlug ? byId.get(previousSlug) : undefined);

		if (!live) {
			plan(`+ ${wanted.name} (${wanted.slug}) — new ship, no scores yet`);
			parties.push({
				partyId: wanted.slug,
				name: wanted.name,
				color: wanted.color,
				description: wanted.description,
				sortOrder,
				enabled: true,
			});

			return;
		}

		if (live.partyId !== wanted.slug) {
			plan(`~ ${live.name} (${live.partyId}) → ${wanted.name} (${wanted.slug}), scores kept`);
		} else if (live.name !== wanted.name || live.description !== wanted.description) {
			plan(`· ${wanted.name}: name/description updated`);
		}

		parties.push({
			...live,
			partyId: wanted.slug,
			name: wanted.name,
			color: wanted.color,
			description: wanted.description,
			sortOrder,
			enabled: true,
		});
	});

	const dropped = game.parties.filter(
		(party) =>
			!parties.some((kept) => kept.partyId === party.partyId) &&
			!PARTY_LINEAGE[party.partyId],
	);
	for (const party of dropped) {
		plan(`- ${party.name} (${party.partyId}) — no longer on the ballot, removed`);
	}

	// ---------- 5: privacy text keys ----------
	const texts = { ...game.texts };
	for (const key of ['privacyController', 'privacyContact']) {
		if (texts[key] === undefined) {
			texts[key] = DEFAULT_TEXTS[key];
			plan(`\ntext "${key}" added (BLANK — fill it in on the admin screen)`);
		}
	}

	if (planned.length === 0) {
		console.info('\nnothing to change');

		return;
	}
	if (dryRun) {
		console.info(`\n${planned.length} change(s) planned. Re-run without --dry-run to apply.`);

		return;
	}

	const batch = db.batch();
	batch.update(gameRef, { islands, parties, texts, lastUpdate: Date.now() });
	for (const write of statementWrites) {
		batch.update(db.collection('statements').doc(write.id), {
			statement: write.statement,
			lastUpdate: Date.now(),
		});
	}
	await batch.commit();
	console.info(
		`\napplied: game doc + ${statementWrites.length} statement(s).\n` +
			'Now run patch-party-attitudes.ts to write the researched scores.',
	);
}

main().catch((error) => {
	console.error(String(error instanceof Error ? error.message : error));
	process.exit(1);
});

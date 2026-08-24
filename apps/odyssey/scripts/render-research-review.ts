/**
 * render-research-review — regenerates the human review sheets from the
 * canonical research JSON. The Markdown is GENERATED, never hand-edited:
 * corrections go into src/data/party-stance-research.json and this script
 * re-renders, so sheet and data cannot drift.
 *
 *   npx tsx apps/odyssey/scripts/render-research-review.ts
 *
 * Output: apps/odyssey/docs/review/<island-slug>.md
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ISLANDS, DEFAULT_PARTIES } from '../src/lib/defaults';
import { partyStanceResearch, ResearchEntry } from '../src/lib/research';

const HERE = dirname(fileURLToPath(import.meta.url));
const REVIEW_DIR = resolve(HERE, '../docs/review');

const CONFIDENCE_BADGE: Record<string, string> = { high: '🟢', medium: '🟡', low: '🔴' };

function cell(entry: ResearchEntry): string {
	const sign = entry.score > 0 ? `+${entry.score}` : `${entry.score}`;
	const badge = CONFIDENCE_BADGE[entry.confidence] ?? '';

	return `**${sign}** ${badge}${entry.inferred ? ' (משוער)' : ''}`;
}

const research = partyStanceResearch();
const islandsBySlug = new Map(DEFAULT_ISLANDS.map((island) => [island.slug, island]));
const partiesBySlug = new Map(DEFAULT_PARTIES.map((party) => [party.slug, party]));

mkdirSync(REVIEW_DIR, { recursive: true });

for (const [islandSlug, parties] of Object.entries(research.islands)) {
	const island = islandsBySlug.get(islandSlug);
	if (!island) {
		console.error(`skipping unknown island "${islandSlug}"`);
		continue;
	}

	const lines: string[] = [];
	lines.push(`# גיליון סקירה — ${island.title} (${islandSlug})`);
	lines.push('');
	lines.push(`> נוצר אוטומטית מ-\`src/data/party-stance-research.json\` (עדכון: ${research.updated}).`);
	lines.push('> תיקונים נעשים בקובץ ה-JSON בלבד; הגיליון מתרענן בהרצת render-research-review.');
	lines.push('');
	lines.push(`**השאלה:** ${island.centralQuestion ?? island.issue}`);
	lines.push('');
	island.stances.forEach((stance, index) => {
		lines.push(`- **חוף ${index + 1}:** ${stance}`);
	});
	lines.push('');
	lines.push('ציון: ‎−1 מתנגדת … ‎+1 תומכת · ביטחון: 🟢 גבוה · 🟡 בינוני · 🔴 נמוך · (משוער) = הערכה מהאידאולוגיה הכללית, ללא עמדה מפורסמת');
	lines.push('');

	const header = ['מפלגה', ...island.stances.map((_, index) => `חוף ${index + 1}`)];
	lines.push(`| ${header.join(' | ')} |`);
	lines.push(`| ${header.map(() => '---').join(' | ')} |`);
	for (const party of DEFAULT_PARTIES) {
		const entries = parties[party.slug];
		if (!entries) continue;
		lines.push(`| **${party.name}** | ${entries.map(cell).join(' | ')} |`);
	}
	lines.push('');
	lines.push('## נימוקים ומקורות');
	lines.push('');
	for (const [partySlug, entries] of Object.entries(parties)) {
		const party = partiesBySlug.get(partySlug);
		lines.push(`### ${party?.name ?? partySlug}`);
		lines.push('');
		entries.forEach((entry, index) => {
			lines.push(`**חוף ${index + 1}** (${cell(entry)}): ${entry.rationale}`);
			entry.sources.forEach((source, sourceIndex) => {
				const date = source.date ? `, ${source.date}` : '';
				const quote = source.quote ? ` — „${source.quote}"` : '';
				lines.push(`${sourceIndex + 1}. [${source.title}](${source.url})${date}${quote}`);
			});
			lines.push('');
		});
	}

	const outPath = resolve(REVIEW_DIR, `${islandSlug}.md`);
	writeFileSync(outPath, lines.join('\n'));
	console.info(`✓ rendered ${outPath}`);
}

if (Object.keys(research.islands).length === 0) {
	console.info('research file has no islands yet — nothing to render');
}

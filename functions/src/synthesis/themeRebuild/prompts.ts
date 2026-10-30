import { MIN_PROPOSALS_PER_THEME } from './constants';
import type { DiscoveredTheme } from './types';

const HEBREW_SCRIPT = /[֐-׿]/;
const ARABIC_SCRIPT = /[؀-ۿ]/;

/**
 * Theme names are written in the question's language. Same script detection
 * as the synthesis writer (`integration-ai-service`): Hebrew and Arabic by
 * script, anything else "same language as the question".
 */
export function themeLanguageInstruction(question: string): string {
	if (HEBREW_SCRIPT.test(question)) return 'Write every theme name and rule in Hebrew.';
	if (ARABIC_SCRIPT.test(question)) return 'Write every theme name and rule in Arabic.';

	return 'Write every theme name and rule in the same language as the QUESTION.';
}

/**
 * Question-relative grouping rules, the ones the live filing judge
 * (`assignToTheme`) was measured with: relating to the question is never a
 * reason to group, group by the lever / actor the answers differ on, no
 * catch-all.
 */
const GROUPING_RULES = `Every proposal answers the same QUESTION, so relating to the question, or to its
subject, is never what makes a theme. A theme groups proposals that share a
specific sub-area: the domain, lever, mechanism or actor they have in common and
that other answers to the question do not (for example funding, partnerships,
education, data access). Proposals that suggest different actions in the same
sub-area belong together.
Do not restate the question as a theme. Do not create a catch-all theme
("general ideas", "other", "miscellaneous", "community improvement"): a proposal
that fits no theme is left out on purpose and shown as "Other ideas".`;

export const DISCOVERY_SYSTEM = `You organize the answers a community gave to one question into themes.
${GROUPING_RULES}
Return only JSON.`;

/** Smallest theme to ask for: MIN_PROPOSALS_PER_THEME, relaxed when the question is too small. */
export function minProposalsPerTheme(atomCount: number, minThemes: number): number {
	return Math.max(
		2,
		Math.min(MIN_PROPOSALS_PER_THEME, Math.floor(atomCount / Math.max(1, minThemes))),
	);
}

export function discoveryUserPrompt(
	question: string,
	atomTexts: string[],
	bounds: { min: number; max: number },
): string {
	const list = atomTexts.map((t, i) => `${i + 1}. ${t}`).join('\n');
	const minPerTheme = minProposalsPerTheme(atomTexts.length, bounds.min);

	return `QUESTION: "${question}"

PROPOSALS (${atomTexts.length}):
${list}

TASK: Propose between ${bounds.min} and ${bounds.max} themes that together cover most
of these proposals. Each theme has:
- "name": a short heading (2-6 words), specific to the sub-area, never the question itself;
- "rule": one line saying which proposals belong in it, precise enough that a
  reader could sort a new proposal by it.
Themes must not overlap: a proposal should fit at most one rule.
Each theme should cover at least ${minPerTheme} of the proposals above. Do not give one or
two proposals a theme of their own when they share a domain with a larger theme:
widen that theme's rule to include them instead. Fewer, well-separated themes are
better than many thin ones.
${themeLanguageInstruction(question)}

Return JSON:
{ "themes": [ { "name": "...", "rule": "..." } ] }`;
}

export const ASSIGN_SYSTEM = `You file community proposals under a fixed list of themes.
${GROUPING_RULES}
Return only JSON.`;

export function assignUserPrompt(
	question: string,
	themes: DiscoveredTheme[],
	atoms: Array<{ localId: string; text: string }>,
	noneKey: string,
): string {
	const themeLines = themes.map((t) => `[${t.key}] ${t.name} — ${t.rule}`).join('\n');
	const atomLines = atoms.map((a) => `[${a.localId}] ${a.text}`).join('\n');

	return `QUESTION: "${question}"

THEMES:
${themeLines}

PROPOSALS:
${atomLines}

TASK: For EVERY proposal, give the key in [brackets] of the one theme whose rule it
fits, or "${noneKey}" when it fits no rule. Judge by the rule, not by how broad a
theme name sounds. When unsure, answer "${noneKey}".

Return JSON with one entry per proposal id:
{ "assignments": { "<proposal id>": "<theme key or ${noneKey}>" } }`;
}

import type { EngineAffordance } from './types';

/**
 * What each engine is good at, in consultant vocabulary. Rendered into the
 * system prompt and reusable by the Studio UI for tooltips.
 */
export const ENGINE_AFFORDANCES: readonly EngineAffordance[] = [
	{
		engine: 'document',
		label: 'Document',
		icon: '✍',
		bestFor:
			'Public comment on a forming agreement: a draft exists and the community comments on and evaluates it paragraph by paragraph, so the gaps become visible.',
		audience: 'The whole community, each person in their own time.',
		cadence:
			'Asynchronous, 5 to 14 days; created hidden while the draft is written and reviewed, then opened for comment.',
		measures: 'Agreement per paragraph, and the gaps (paragraphs with split or low agreement).',
		notFor: 'Generating material from nothing — a document needs a text, written or drafted from earlier results.',
	},
	{
		engine: 'crowdSurvey',
		label: 'Crowd survey',
		icon: '⚡',
		bestFor:
			"Ask a question of hundreds: many people suggest ideas and rate each other's suggestions; no facilitation needed.",
		audience: 'Hundreds to thousands of participants, each joining on their own time.',
		cadence: 'Runs over days or weeks; open, close and reminder nudges can be scheduled.',
		measures:
			'Agreement per idea with a bridging (variance-penalized) consensus score, plus the participation funnel (entered → suggested → evaluated).',
		notFor: 'A room of 10 people, or a decision that needs a real conversation.',
	},
	{
		engine: 'liveSession',
		label: 'Live session',
		icon: '🤝',
		bestFor:
			'Face-to-face convergence: a room of a few dozen forms agreed solutions around gaps that are already known, while a facilitator steers.',
		audience: '20 to 300 people, together, in person or on a call; one session per audience segment.',
		cadence: 'Live, 45 to 120 minutes; starts frozen and is opened at the session.',
		measures: 'Convergence toward a few proposals in real time.',
		notFor: 'Asynchronous public input; a blank page (comment first, then converge); anything without a facilitator.',
	},
	{
		engine: 'discussion',
		label: 'Discussion',
		icon: '❓',
		bestFor:
			'A focused question with chat, options and voting — and the formal decision at the end of a process (a vote in Main / the assembly).',
		audience: 'A committee, team or working group; everyone at the final vote.',
		cadence: 'Over days; typically 5 to 10 days per question.',
		measures: 'Options, votes and consensus per option.',
		notFor: 'Broad public participation at scale.',
	},
];

/**
 * The Draft step is not an engine the admin sees; it is a scheduled `draft`
 * action on a document. Rendered into the prompt next to the engine cards.
 */
export const DRAFT_STEP_DESCRIPTION =
	'A strong model writes the document from the top suggestions of the source activities (the cutoff — top-N, above a consensus threshold, or the chosen answers — is the admin\'s choice, default top 20 with at least 3 evaluators), with provenance for every paragraph and an explicit open-gaps section. The admin reviews and edits freely in the document, then opens it for comment. Nothing reaches the public un-reviewed. In a plan it is a scheduled action {"action": "draft"} on a document activity whose "draftFrom" names the source activities.';

/** An assembly-style asynchronous engine exists but is experimental; never in a default plan. */
export const EXPERIMENTAL_ENGINES_NOTE =
	'An experimental large-group asynchronous deliberation engine exists for advanced users who opt in; never propose it.';

export function getAffordance(engine: EngineAffordance['engine']): EngineAffordance {
	const found = ENGINE_AFFORDANCES.find((card) => card.engine === engine);
	if (!found) throw new Error(`Unknown engine: ${engine}`);

	return found;
}

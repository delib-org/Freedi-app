import type { EngineAffordance } from './types';

/**
 * What each engine is good at, in consultant vocabulary. Rendered into the
 * system prompt and reusable by the Studio UI for tooltips.
 */
export const ENGINE_AFFORDANCES: readonly EngineAffordance[] = [
	{
		engine: 'crowdSurvey',
		label: 'Crowd survey',
		icon: '⚡',
		bestFor:
			"Many people suggest ideas and rate each other's suggestions; no facilitation needed.",
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
			'People in one room join the proposals they support while a facilitator steers the conversation.',
		audience: '20 to 300 people, together, in person or on a call.',
		cadence: 'Live, 45 to 120 minutes; starts frozen and is opened at the session.',
		measures: 'Convergence toward a few proposals in real time.',
		notFor: 'Asynchronous public input; anything without a facilitator.',
	},
	{
		engine: 'discussion',
		label: 'Discussion',
		icon: '❓',
		bestFor:
			'A focused question with chat, options and voting for a committee, team or working group.',
		audience: 'A small group that needs a deeper conversation.',
		cadence: 'Over days; typically 5 to 10 days per question.',
		measures: 'Options, votes and consensus per option.',
		notFor: 'Broad public participation at scale.',
	},
];

export function getAffordance(engine: EngineAffordance['engine']): EngineAffordance {
	const found = ENGINE_AFFORDANCES.find((card) => card.engine === engine);
	if (!found) throw new Error(`Unknown engine: ${engine}`);

	return found;
}

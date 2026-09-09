import { calcAgreement } from '@freedi/shared-types';

export interface Concern {
	id: string;
	author: string;
	text: string;
	resolved: boolean;
}
export interface Proposal {
	id: string;
	text: string;
	theme: string;
	author: string;
	votes: Record<string, number>;
	concerns: Concern[];
	sources?: string[];
	previousId?: string;
}
export interface Clause {
	id: string;
	text: string;
	sourceId: string;
	comments: string[];
}
export type Position = 'endorse' | 'no-objection' | 'object';
export interface CovenantVersion {
	number: number;
	adopted?: boolean;
	clauses: Clause[];
	positions: Record<string, Position>;
}
export interface Workflow {
	proposals: Proposal[];
	clauses: Clause[];
	versions: CovenantVersion[];
	phase: 'draft' | 'review' | 'adopted';
	endorsementTarget: number;
}
export function evidence(votes: Record<string, number>) {
	const values = Object.values(votes);
	const n = values.length;
	const sum = values.reduce((a, b) => a + b, 0);

	return {
		n,
		mean: n ? sum / n : undefined,
		score: n
			? calcAgreement(
					sum,
					values.reduce((a, b) => a + b * b, 0),
					n,
				)
			: undefined,
		support: values.filter((v) => v > 0).length,
		oppose: values.filter((v) => v < 0).length,
		neutral: values.filter((v) => v === 0).length,
	};
}
export function rankProposals(proposals: Proposal[]): Proposal[] {
	return [...proposals].sort(
		(a, b) => (evidence(b.votes).score ?? -2) - (evidence(a.votes).score ?? -2),
	);
}
export type WorkflowAction =
	| { type: 'rate'; id: string; value: number }
	| { type: 'add'; proposal: Proposal }
	| { type: 'concern'; id: string; concern: Concern }
	| { type: 'resolve'; id: string; concernId: string }
	| { type: 'clause'; id: string; clauseId: string }
	| { type: 'amend'; id: string; text: string; reason: string }
	| { type: 'comment'; id: string; text: string }
	| { type: 'remove'; id: string }
	| { type: 'review' }
	| { type: 'example-responses' }
	| { type: 'adopt' }
	| { type: 'reopen' }
	| { type: 'position'; position: Position }
	| { type: 'target'; value: number };
export function reviewReadiness(state: Workflow): boolean {
	const positions = Object.values(state.versions.at(-1)?.positions ?? {});

	return (
		positions.length === 24 &&
		!positions.includes('object') &&
		(positions.filter((p) => p === 'endorse').length / 24) * 100 >= state.endorsementTarget
	);
}
export function workflowReducer(state: Workflow, action: WorkflowAction): Workflow {
	switch (action.type) {
		case 'rate':
			if (![-1, -0.5, 0, 0.5, 1].includes(action.value)) return state;

			return {
				...state,
				proposals: state.proposals.map((p) =>
					p.id === action.id ? { ...p, votes: { ...p.votes, you: action.value } } : p,
				),
			};
		case 'add':
			return { ...state, proposals: [...state.proposals, { ...action.proposal, votes: {} }] };
		case 'concern':
			return {
				...state,
				proposals: state.proposals.map((p) =>
					p.id === action.id ? { ...p, concerns: [...p.concerns, action.concern] } : p,
				),
			};
		case 'resolve':
			return {
				...state,
				proposals: state.proposals.map((p) =>
					p.id === action.id
						? {
								...p,
								concerns: p.concerns.map((c) =>
									c.id === action.concernId && c.author === 'You'
										? { ...c, resolved: !c.resolved }
										: c,
								),
							}
						: p,
				),
			};
		case 'clause': {
			const p = state.proposals.find((p) => p.id === action.id);
			if (!p || state.phase !== 'draft' || state.clauses.some((c) => c.sourceId === p.id))
				return state;

			return {
				...state,
				clauses: [
					...state.clauses,
					{ id: action.clauseId, text: p.text, sourceId: p.id, comments: [] },
				],
			};
		}
		case 'amend':
			if (state.phase !== 'draft' || !action.text.trim() || !action.reason.trim()) return state;

			return {
				...state,
				clauses: state.clauses.map((c) =>
					c.id === action.id
						? {
								...c,
								text: action.text.trim(),
								comments: [
									...c.comments,
									`Wording changed: ${action.reason.trim()}\nPrevious wording: ${c.text}`,
								],
							}
						: c,
				),
			};
		case 'comment':
			if (state.phase !== 'draft' || !action.text.trim()) return state;

			return {
				...state,
				clauses: state.clauses.map((c) =>
					c.id === action.id ? { ...c, comments: [...c.comments, action.text.trim()] } : c,
				),
			};
		case 'remove':
			return state.phase === 'draft'
				? { ...state, clauses: state.clauses.filter((c) => c.id !== action.id) }
				: state;
		case 'review':
			if (state.phase !== 'draft' || !state.clauses.length) return state;

			return {
				...state,
				phase: 'review',
				versions: [
					...state.versions,
					{
						number: state.versions.length + 1,
						clauses: state.clauses.map((c) => ({ ...c, comments: [...c.comments] })),
						positions: {},
					},
				],
			};
		case 'reopen':
			return { ...state, phase: 'draft' };
		case 'position':
			if (state.phase !== 'review') return state;

			return {
				...state,
				versions: state.versions.map((v, i) =>
					i === state.versions.length - 1
						? { ...v, positions: { ...v.positions, you: action.position } }
						: v,
				),
			};
		case 'example-responses':
			if (state.phase !== 'review') return state;

			return {
				...state,
				versions: state.versions.map((v, i) =>
					i === state.versions.length - 1
						? {
								...v,
								positions: {
									...Object.fromEntries(
										Array.from({ length: 23 }, (_, j) => [
											`neighbor-${j + 1}`,
											j < 20 ? ('endorse' as const) : ('no-objection' as const),
										]),
									),
									...v.positions,
								},
							}
						: v,
				),
			};
		case 'adopt':
			if (state.phase !== 'review' || !reviewReadiness(state)) return state;

			return {
				...state,
				phase: 'adopted',
				versions: state.versions.map((v, i) =>
					i === state.versions.length - 1 ? { ...v, adopted: true } : v,
				),
			};
		case 'target':
			return state.versions.length || action.value < 1 || action.value > 100
				? state
				: { ...state, endorsementTarget: action.value };
	}
}
function votes(values: number[]): Record<string, number> {
	return Object.fromEntries(values.map((v, i) => [`neighbor-${i + 1}`, v]));
}
export const initialWorkflow: Workflow = {
	phase: 'draft',
	endorsementTarget: 80,
	clauses: [],
	versions: [],
	proposals: [
		{
			id: 'trial',
			text: 'Try two movable planters for one month, with a volunteer care rota and a shared spending cap of ₪600.',
			theme: 'A greener courtyard',
			author: 'Noa',
			votes: votes([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0.5, 0.5, 0]),
			concerns: [],
			previousId: 'garden',
		},
		{
			id: 'garden',
			text: 'Create a shared garden with a place for neighbors to sit.',
			theme: 'A greener courtyard',
			author: 'Community synthesis',
			votes: votes([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, 0, 0]),
			concerns: [
				{
					id: 'care',
					author: 'Amir',
					text: 'Who will care for it when people are away? I cannot commit to regular maintenance.',
					resolved: false,
				},
			],
			sources: [
				'Create a shared garden with seating for neighbors.',
				'Add communal garden beds and a shared seating area.',
				'Make a garden and seating area for everyone in the courtyard.',
			],
		},
		{
			id: 'quiet',
			text: 'Keep a clear, step-free path through the courtyard at all times.',
			theme: 'Room for everyone',
			author: 'Maya',
			votes: votes([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0.5]),
			concerns: [],
		},
		{
			id: 'dinner',
			text: 'Hold a monthly bring-a-dish evening, ending by 9 pm.',
			theme: 'Time together',
			author: 'Daniel',
			votes: votes([1, 1, 0.5, 0.5, 0.5, 0, 0, -0.5, -1]),
			concerns: [
				{
					id: 'noise',
					author: 'Roni',
					text: 'My children sleep early. Could we agree where people gather and how to keep the noise down?',
					resolved: false,
				},
			],
		},
		{
			id: 'bench',
			text: 'Add a movable bench in the shade before changing the rest of the courtyard.',
			theme: 'Room for everyone',
			author: 'Leah',
			votes: votes([1, 1]),
			concerns: [],
		},
	],
};
export function exportCovenant(
	state: Workflow,
	questionTitle = 'What could our courtyard become?',
): string {
	const latest = state.versions.at(-1);
	const clauses = state.phase !== 'draft' && latest ? latest.clauses : state.clauses;

	return [
		`# Our covenant / אמנה\n\nQuestion: ${questionTitle}`,
		'',
		'**LOCAL DESIGN EXAMPLE — not a community-approved agreement**',
		'',
		state.phase !== 'draft'
			? `Version ${latest?.number} — ${state.phase === 'adopted' ? 'adopted in this local example only' : 'under review'}`
			: 'Working draft — not open for adoption',
		`Illustrative rule: ${state.endorsementTarget}% endorse; all remaining participants explicitly do not object. No response is not consent.`,
		'',
		...clauses.flatMap((c, i) => [
			`## ${i + 1}. Clause`,
			c.text,
			`Source option: ${c.sourceId}`,
			...c.comments.map((x) => `Review note: ${x}`),
			'',
		]),
		'## Review history',
		...state.versions.map(
			(v) => `Version ${v.number}: ${JSON.stringify(v.positions)} (local example positions only)`,
		),
	].join('\n');
}

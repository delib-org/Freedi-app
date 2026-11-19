import { describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { Decision } from '@/lib/classroom/decision';
import { textOf } from '../../__tests__/vnodeText';

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/styles/console-decision.scss', () => ({}));

import { DecisionPanel } from '../DecisionPanel';

const DECIDED: Decision = {
	kind: 'decided',
	text: 'Phones stay in the bag',
	percent: 58,
	votes: 14,
	top: [
		{ id: 'a', text: 'Phones stay in the bag', percent: 58, count: 14, winner: true },
		{ id: 'b', text: 'A phone box in class', percent: 25, count: 6, winner: false },
	],
	voted: 24,
	present: 26,
	tie: false,
	mostAgreed: false,
	sharedWithClass: false,
};

function draw(decision: Decision): string {
	const vnode = (
		DecisionPanel.view as unknown as (v: { attrs: { decision: Decision } }) => m.Vnode
	)({
		attrs: { decision },
	});

	return textOf(vnode);
}

describe('DecisionPanel', () => {
	it('shows the decision, the winner, its share, the top rows and who voted', () => {
		const text = draw(DECIDED);
		expect(text).toContain('console.decision');
		expect(text).toContain('Phones stay in the bag');
		expect(text).toContain('voting.result_votes');
		expect(text).toContain('A phone box in class');
		expect(text).toContain('summary.turnout');
	});

	it('says whose screen it is: only the teacher, or the class too', () => {
		expect(draw(DECIDED)).toContain('console.support_panel_private');
		expect(draw({ ...DECIDED, sharedWithClass: true })).toContain('console.support_panel_shared');
	});

	it('a skipped vote says so and shows the most agreed proposal', () => {
		const text = draw({
			...DECIDED,
			kind: 'none',
			percent: null,
			votes: null,
			top: [],
			mostAgreed: true,
		});
		expect(text).toContain('summary.no_vote');
		expect(text).toContain('summary.most_agreed');
		expect(text).toContain('Phones stay in the bag');
		expect(text).not.toContain('summary.turnout');
	});

	it('an open vote is not a decision yet', () => {
		const text = draw({ ...DECIDED, kind: 'open', text: null, percent: null, votes: null });
		expect(text).toContain('summary.vote_open');
		expect(text).not.toContain('summary.turnout');
	});

	it('a tie says the ratings decided', () => {
		expect(draw({ ...DECIDED, tie: true })).toContain('summary.tie_by_ratings');
	});

	it('one vote is spoken in the singular', () => {
		expect(draw({ ...DECIDED, votes: 1 })).toContain('voting.result_one_vote');
	});
});

import { describe, expect, it, vi } from 'vitest';
import type { Statement } from '@freedi/shared-types';

const challenge = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/lib/store', () => ({ getSubQuestions: () => [] }));
vi.mock('@/lib/lesson', () => ({
	getChallengeQuestion: () => challenge.current,
	getGuidingQuestions: () => [],
	stepLabel: (key: string) => key,
}));
vi.mock('@/components/StudentFrame', () => ({ StudentFrame: { view: () => null } }));
vi.mock('@/components/SideSlider', () => ({ SideSlider: { view: () => null } }));
vi.mock('@/views/student/c2/c2Helpers', () => ({ SIDE_CENTER: 0, campMark: () => '' }));
vi.mock('@/views/student/c3/QuestionPick', () => ({ QuestionPick: { view: () => null } }));
vi.mock('@/views/student/c3/WriteBox', () => ({ WriteBox: { view: () => null } }));
vi.mock('@/views/student/c3/TextCard', () => ({ TextCard: { view: () => null } }));
vi.mock('@/views/student/c3/RateFaces', () => ({ RateFaces: { view: () => null } }));
vi.mock('@/views/student/c3/VoteList', () => ({ VoteList: { view: () => null } }));
vi.mock('@/views/student/c3/DecisionCard', () => ({ DecisionCard: { view: () => null } }));
vi.mock('@/views/student/c3/SupportBySide', () => ({ SupportBySide: { view: () => null } }));

const { voteSample, summarySample, endedSample } = await import('../screens');

/** The parts of a mithril vnode these tests read. */
interface Node {
	tag: unknown;
	attrs: Record<string, unknown> | null;
	children: Node[] | null;
	text?: unknown;
}

const MAIN = { statementId: 'main', statement: 'Lesson' } as unknown as Statement;

function withBallot(liveResults: boolean | undefined): void {
	challenge.current = {
		statementSettings: { ballot: { candidateIds: ['a'] }, voteDisplay: { liveResults } },
	};
}

/** Every tag name, component name, attribute value and text in the tree. */
function flatten(node: unknown, out: string[] = []): string[] {
	if (node === null || node === undefined || typeof node === 'boolean') return out;
	if (typeof node === 'string' || typeof node === 'number') {
		out.push(String(node));

		return out;
	}
	if (Array.isArray(node)) {
		node.forEach((child) => flatten(child, out));

		return out;
	}
	const vnode = node as Node;
	if (typeof vnode.tag === 'string') {
		if (vnode.tag === '#') out.push(String(vnode.children));
		else out.push(vnode.tag);
	}
	if (vnode.attrs) {
		for (const [key, value] of Object.entries(vnode.attrs)) {
			if (typeof value === 'string' || typeof value === 'boolean' || value === null) {
				out.push(`${key}=${String(value)}`);
			} else if (key === 'results') out.push('results=present');
		}
	}
	if (vnode.tag !== '#' && Array.isArray(vnode.children)) flatten(vnode.children, out);
	if (vnode.text !== undefined) flatten(vnode.text, out);

	return out;
}

/** The text of a screen, with the StudentFrame's own attributes opened up. */
function seen(screen: unknown): string {
	return flatten(screen).join('|');
}

describe('the Vote sample follows the results switch', () => {
	it('closed vote, results closed: no shares, no winner, "shown soon" line', () => {
		withBallot(undefined);
		const out = seen(voteSample('closed', false));
		expect(out).toContain('voting.closed_hidden');
		expect(out).toContain('voting.closed');
		expect(out).toContain('results=null');
		expect(out).toContain('winnerId=null');
		expect(out).not.toContain('results=present');
	});

	it('closed vote, results open: shares and the winner', () => {
		withBallot(true);
		const out = seen(voteSample('closed', true));
		expect(out).toContain('voting.closed_hint');
		expect(out).toContain('results=present');
		expect(out).not.toContain('winnerId=null');
	});

	it('open and paused votes with results closed add the "results later" note and no shares', () => {
		withBallot(false);
		for (const ballot of ['open', 'paused'] as const) {
			const out = seen(voteSample(ballot, false));
			expect(out, ballot).toContain('voting.results_later');
			expect(out, ballot).not.toContain('results=present');
		}
	});

	it('an open vote with results open has no note', () => {
		withBallot(true);
		expect(seen(voteSample('open', true))).not.toContain('voting.results_later');
	});
});

describe('the Summary and Ended samples follow the results switch', () => {
	it('closed: names only, no decision, no support question, same note as the phones', () => {
		withBallot(undefined);
		const summary = seen(summarySample(MAIN, false));
		expect(summary).toContain('voting.results_later');
		expect(summary).not.toContain('summary.how_much');
		expect(summary).not.toContain('text=student_screen.proposal_1');
		expect(summary).not.toContain('summary.most_agreed');
		expect(seen(endedSample(MAIN, false))).not.toContain('text=student_screen.proposal_1');
	});

	it('open: the decision and the support question', () => {
		withBallot(true);
		const summary = seen(summarySample(MAIN, true));
		expect(summary).toContain('text=student_screen.proposal_1');
		expect(summary).toContain('summary.how_much');
		expect(seen(endedSample(MAIN, true))).toContain('text=student_screen.proposal_1');
	});

	it('with no vote at all the most agreed proposal still shows, as on the phones', () => {
		challenge.current = null;
		expect(seen(summarySample(MAIN, false))).toContain('text=student_screen.proposal_1');
	});
});

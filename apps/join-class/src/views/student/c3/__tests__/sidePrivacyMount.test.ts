// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { ShownCampSupport, ShownSupportBySide, Statement } from '@freedi/shared-types';

const fake = vi.hoisted(() => ({
	support: null as ShownSupportBySide | null,
	challenge: null as Statement | null,
}));

vi.mock('@/lib/firebase', () => ({}));
vi.mock('@/lib/classroom/studentWrites', () => ({
	setMySide: vi.fn(() => Promise.resolve()),
	setMyDecisionSupport: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/classroom/listeners', () => ({ listenRoster: () => () => undefined }));
vi.mock('@/lib/classroom/registrationSupport', () => ({
	supportForScreen: () =>
		fake.support ? { kind: 'ready', result: fake.support, names: null } : { kind: 'loading' },
	retrySupport: vi.fn(),
}));
vi.mock('../FlowFeed', () => ({
	FlowFeed: class {
		options: Statement[] = [];
		sync(): void {}
		stop(): void {}
	},
}));
vi.mock('@/lib/lesson', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/lib/lesson')>()),
	getChallengeQuestion: () => fake.challenge,
}));
vi.mock('@/lib/classroom/projectorData', () => ({
	projectorData: {
		get main() {
			return MAIN;
		},
		get challenge() {
			return fake.challenge;
		},
		proposals: [],
	},
}));

import { classState } from '@/lib/classroom/classState';
import { smoke } from '@/views/__tests__/mountSmoke';
import { findMixedKeys } from '@/views/__tests__/keyedLint';
import { SideView } from '../../c2/SideView';
import { SupportBySide } from '../SupportBySide';
import { SummaryScreen } from '../SummaryScreen';
import { SupportPanel } from '@/views/teacher/SupportPanel';
import { summaryStage } from '@/views/teacher/projector/VoteStage';

/**
 * Trello btMVQMM5, MOUNTED in a real DOM and redrawn with changed state (the
 * bar the Proposals hotfix set): the Side step unlocked and locked, and every
 * support-by-side surface with 0, 1, 2 and 3 camps hidden by the server.
 * Each tree also goes through the keyed lint.
 */

const STEPS = ['waiting', 'opening', 'side', 'tables', 'vote', 'summary'];
const MAIN = {
	statementId: 'm',
	statement: 'Lesson',
	creatorId: 't',
	statementSettings: { lessonPlan: { steps: STEPS, stepIndex: 2 } },
} as unknown as Statement;
const CHALLENGE = {
	statementId: 'ch',
	selections: { p1: 3 },
	statementSettings: {
		ballot: { candidateIds: ['p1'], frozenAt: 1, closedAt: 2, decisionId: 'p1' },
		voteDisplay: { liveResults: true, supportShown: true },
	},
} as unknown as Statement;

// The server sends counts only when no camp is hidden for size (rule in classSupportShown.ts).
const shownCamp = (n: number, withCounts: boolean): ShownCampSupport => ({
	hidden: false,
	mean: 0.5,
	counts: withCounts ? { n, m: n } : null,
});
const hiddenCamp = (): ShownCampSupport => ({ hidden: true });

function supportWith(hiddenCount: number): ShownSupportBySide {
	const camps = ['a', 'center', 'b'].map((_, i) =>
		i < hiddenCount ? hiddenCamp() : shownCamp(4, hiddenCount === 0),
	);

	return {
		a: camps[0],
		center: camps[1],
		b: camps[2],
		verdict: hiddenCount > 0 ? 'insufficient' : 'closer',
	};
}

const HIDDEN_COUNTS = [0, 1, 2, 3];

function countIn(html: string, needle: string): number {
	return html.split(needle).length - 1;
}

function component<A>(comp: m.Component<A>, attrs: A): () => m.Children {
	return () => m(comp as m.ComponentTypes<A>, attrs as A & m.CommonAttributes<A, object>);
}

function lint(tree: m.Children): void {
	expect(findMixedKeys(tree)).toEqual([]);
}

afterEach(() => {
	fake.support = null;
	fake.challenge = null;
	classState.mySide = null;
	classState.sideLock = null;
});

describe('the Side step, mounted', () => {
	const side = component(SideView, { main: MAIN } as never);

	it('unlocked, then locked, then unlocked again: draws, redraws, no mixed keys', () => {
		classState.mySide = { userId: 'me', mainId: 'm', side: 80, camp: 'b', lastUpdate: 1 };
		const lockedView = (): m.Children => {
			classState.sideLock = { mainId: 'm', lockedAt: 1 };

			return side();
		};
		const html = smoke(side, [lockedView]);
		expect(html).toContain('side-slider__input');
		expect(html).not.toContain('side-step__locked');
		lint(side());
	});

	it('locked: the slider is disabled and the locked line replaces the button', () => {
		classState.sideLock = { mainId: 'm', lockedAt: 1 };
		const html = smoke(side);
		expect(html).toContain('side-step__locked');
		expect(html).toMatch(/<input[^>]*disabled/);
		expect(html).not.toContain('data-testid="side-confirm"');
		lint(side());
	});
});

describe('support by side with hidden camps, mounted', () => {
	it.each(HIDDEN_COUNTS)('SupportBySide with %i hidden', (hiddenCount) => {
		const view = component(SupportBySide, {
			result: supportWith(hiddenCount),
			gate: 0.6,
			names: { a: 'A', b: 'B' },
		});
		const html = smoke(view, [
			component(SupportBySide, {
				result: supportWith(3 - hiddenCount),
				gate: 0.6,
				names: { a: 'A', b: 'B' },
			}),
		]);
		expect(countIn(html, 'support__too-few')).toBe(hiddenCount);
		expect(countIn(html, 'class="support__track"')).toBe(3 - hiddenCount);
		// numbers only when no camp is hidden; never in a hidden row
		expect(countIn(html, 'support__count')).toBe(hiddenCount === 0 ? 3 : 0);
		lint(view());
	});

	it.each(HIDDEN_COUNTS)('the teacher SupportPanel with %i hidden', (hiddenCount) => {
		fake.support = supportWith(hiddenCount);
		const view = component(SupportPanel, { main: MAIN, challenge: CHALLENGE, shownToClass: true });
		const html = smoke(view, [
			() => {
				fake.support = supportWith((hiddenCount + 1) % 4);

				return view();
			},
		]);
		expect(countIn(html, 'support__too-few')).toBe(hiddenCount);
		lint(view());
	});

	it.each(HIDDEN_COUNTS)('the student SummaryScreen with %i hidden', (hiddenCount) => {
		fake.challenge = CHALLENGE;
		fake.support = supportWith(hiddenCount);
		const view = component(SummaryScreen, { main: MAIN });
		const html = smoke(view, [
			() => {
				fake.support = supportWith(3);

				return view();
			},
		]);
		expect(countIn(html, 'support__too-few')).toBe(hiddenCount);
		lint(view());
	});

	it.each(HIDDEN_COUNTS)('the projector summary with %i hidden', (hiddenCount) => {
		fake.challenge = CHALLENGE;
		fake.support = supportWith(hiddenCount);
		const html = smoke(summaryStage, [
			() => {
				fake.support = supportWith(0);

				return summaryStage();
			},
		]);
		expect(countIn(html, 'projector-support__too-few')).toBe(hiddenCount);
		expect(countIn(html, 'class="projector-support__track"')).toBe(3 - hiddenCount);
		expect(countIn(html, 'projector.rated')).toBe(hiddenCount === 0 ? 3 : 0);
		lint(summaryStage());
	});
});

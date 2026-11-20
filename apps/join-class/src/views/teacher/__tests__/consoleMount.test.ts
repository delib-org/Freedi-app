// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import { LESSON_STEPS } from '@freedi/shared-types';
import type { ClassTable, LessonStatus, LessonStepKey, Statement } from '@freedi/shared-types';

vi.mock('@/lib/firebase', () => ({}));

import type { ClassStatusInput } from '@/lib/classroom/classStatus';
import type { RosterStudent } from '@/lib/classroom/consoleHelpers';
import type { Decision } from '@/lib/classroom/decision';
import { mountSmoke, smoke } from '@/views/__tests__/mountSmoke';
import { findMixedKeys } from '@/views/__tests__/keyedLint';
import { ActionBand, type ActionBandAttrs } from '../ActionBand';
import { ClassStatusLine } from '../ClassStatusLine';
import { ActForEntry } from '../actFor/ActForEntry';
import { DecisionPanel } from '../DecisionPanel';
import { openDisclosure } from '../Disclosure';
import { consoleState } from '../consoleState';
import { LESSON_MORE_ID, LessonMore } from '../LessonMore';
import { NextAction } from '../NextAction';
import { STEP_MORE_ID, StepMore } from '../StepMore';
import { StepLine } from '../StepLine';
import { StepList, closeStepList, toggleStepList } from '../StepList';
import { TableCard } from '../TableCard';
import { TablesBoard } from '../TablesBoard';
import { nextActionFor } from '@/lib/classroom/nextAction';

/**
 * The teacher console's pieces, MOUNTED in a real DOM (the console redesign was
 * merged without ever being drawn). Each piece is drawn at every step of the
 * lesson and in each lesson status, redrawn with changed attrs, then unmounted.
 */

const STATUSES: LessonStatus[] = ['live', 'open', 'paused', 'ended'];
const STEPS: readonly LessonStepKey[] = LESSON_STEPS;

const challenge = {
	statementId: 'q1',
	statement: 'What should we do?',
	statementSettings: {},
} as unknown as Statement;

const STATUS_INPUT: ClassStatusInput = {
	status: 'live',
	stepKey: 'proposals',
	joined: 6,
	classSize: 6,
	projectorWhat: '',
	chose: 6,
	sideTotal: 6,
	tableCount: 2,
	unseated: 0,
	tablesDone: 0,
	tablesRating: 0,
	allRated: null,
	ballotFrozen: false,
	ballotPaused: false,
	ballotClosed: false,
	voted: 0,
	present: 6,
	resultsShown: false,
	stuckTables: [],
};

function band(status: LessonStatus, stepIndex: number): ActionBandAttrs {
	const stepKey = STEPS[stepIndex];

	return {
		mid: 'm',
		status,
		stepKey,
		stepIndex,
		steps: STEPS,
		challenge,
		ballotFrozen: false,
		ballotClosed: false,
		votedCount: 0,
		presentCount: 6,
		proposalCount: 3,
		tableCount: 2,
		studentCount: 6,
		copyOffer: { kind: 'ordinary' },
		resultsShown: false,
		statusInput: { ...STATUS_INPUT, status, stepKey },
		main: null,
		plenum: false,
		connected: false,
	};
}

const students = new Map<string, RosterStudent>([
	['a', { uid: 'a', name: 'Noa', camp: null, tableId: 'm--1' }],
	['b', { uid: 'b', name: 'Avi', camp: null, tableId: 'm--1' }],
]);

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['a', 'b'],
		noDeviceMembers: [],
		step: 'talk',
		askerUid: null,
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: 0,
		...overrides,
	};
}

afterEach(() => {
	closeStepList();
	document.body.innerHTML = '';
});

describe('the action band, mounted at every step and status', () => {
	for (const status of STATUSES) {
		it(`draws ${status} at all nine steps and redraws between them`, () => {
			const mounted = mountSmoke(() => m(ActionBand, band(status, 0)));
			STEPS.forEach((_, index) => mounted.update(() => m(ActionBand, band(status, index))));
			mounted.update(() => m(ActionBand, band(status, 0)));
			mounted.unmount();
		});
	}

	it('opens the step panel toward the start: the toggle is the last control of the band', () => {
		const mounted = mountSmoke(() => m(ActionBand, band('live', 5)));
		expect(mounted.root.querySelector('.disclosure--end #step-more')).not.toBeNull();
		mounted.unmount();
	});

	it('keeps one primary button element across label changes', () => {
		const mounted = mountSmoke(() => m(ActionBand, band('live', 5)));
		const before = mounted.root.querySelector('.next-action__button');
		mounted.update(() => m(ActionBand, band('live', 6)));
		expect(mounted.root.querySelector('.next-action__button')).toBe(before);
		mounted.unmount();
	});
});

describe('the primary button while its write runs', () => {
	it('keeps the keyboard focus on the same element through the busy label', () => {
		const spec = nextActionFor({
			status: 'live',
			stepKey: 'proposals',
			stepIndex: 5,
			steps: STEPS,
			hasChallenge: true,
			ballotFrozen: false,
			ballotClosed: false,
			votedCount: 0,
			presentCount: 6,
			proposalCount: 3,
			tableCount: 2,
			studentCount: 6,
			connected: false,
			copyPending: false,
			resultsShown: false,
		});
		const mounted = mountSmoke(() => m(NextAction, { mid: 'm', spec, challengeId: 'q1' }));
		const button = mounted.root.querySelector<HTMLElement>('.next-action__button') as HTMLElement;
		button.focus();
		expect(document.activeElement).toBe(button);
		if (spec.busyKey) consoleState.busy.add(spec.busyKey);
		mounted.redraw();
		expect(document.activeElement).toBe(button);
		expect(button.getAttribute('aria-disabled')).toBe('true');
		expect(button.hasAttribute('disabled')).toBe(false);
		consoleState.busy.clear();
		mounted.redraw();
		expect(document.activeElement).toBe(button);
		mounted.unmount();
	});
});

describe('the pieces on their own', () => {
	it('NextAction, ClassStatusLine and StepMore draw and redraw', () => {
		for (const status of STATUSES) {
			for (const [index, stepKey] of STEPS.entries()) {
				const attrs = band(status, index);
				const spec = nextActionFor({
					status,
					stepKey,
					stepIndex: index,
					steps: STEPS,
					hasChallenge: true,
					ballotFrozen: false,
					ballotClosed: false,
					votedCount: 0,
					presentCount: 6,
					proposalCount: 3,
					tableCount: 2,
					studentCount: 6,
					connected: false,
					copyPending: false,
					resultsShown: false,
				});
				smoke(
					() => m(NextAction, { mid: 'm', spec, challengeId: 'q1' }),
					[() => m(NextAction, { mid: 'm', spec, challengeId: null })],
				);
				smoke(() =>
					m(ClassStatusLine, {
						input: attrs.statusInput,
						words: { stepName: 's', primaryLabel: 'p' },
					}),
				);
				openDisclosure(STEP_MORE_ID);
				smoke(() =>
					m(StepMore, {
						mid: 'm',
						status,
						stepKey,
						steps: STEPS,
						challenge,
						main: null,
						hasTables: true,
						plenum: false,
						connected: false,
						copyOffer: { kind: 'ordinary' },
					}),
				);
			}
		}
	});

	it('StepLine with the step list open, and the list on its own', () => {
		toggleStepList();
		const line = (index: number, held: boolean) => () =>
			m(StepLine, {
				keys: STEPS,
				currentIndex: index,
				elapsedMs: 12 * 60_000,
				held,
				onBack: vi.fn(),
			});
		smoke(line(5, false), [line(6, false), line(2, true)]);
		smoke(() =>
			m(StepList, { keys: STEPS, currentIndex: 4, held: false, toggleId: 't', onBack: vi.fn() }),
		);
	});

	it('LessonMore draws open at each step', () => {
		openDisclosure(LESSON_MORE_ID);
		for (const stepKey of STEPS) {
			smoke(() =>
				m(LessonMore, {
					mid: 'm',
					status: 'live',
					stepKey,
					connected: stepKey === 'waiting',
					qr: { shown: false, toggle: vi.fn() },
				}),
			);
		}
	});

	it('DecisionPanel draws each kind of decision', () => {
		const base: Decision = {
			kind: 'none',
			text: null,
			percent: null,
			votes: null,
			top: [],
			voted: 0,
			present: 6,
			tie: false,
			mostAgreed: false,
			sharedWithClass: false,
		};
		const decided: Decision = {
			...base,
			kind: 'decided',
			text: 'Plant trees',
			percent: 60,
			votes: 3,
			top: [
				{ id: 'a', text: 'Plant trees', percent: 60, count: 3, winner: true },
				{ id: 'b', text: 'Clean up', percent: 40, count: 2, winner: false },
			],
		};
		smoke(
			() => m(DecisionPanel, { decision: base }),
			[
				() => m(DecisionPanel, { decision: { ...base, kind: 'open' } }),
				() => m(DecisionPanel, { decision: { ...base, kind: 'paused' } }),
				() => m(DecisionPanel, { decision: decided }),
				() => m(DecisionPanel, { decision: { ...decided, tie: true, sharedWithClass: true } }),
			],
		);
	});
});

describe('the no-device entry', () => {
	it('is not drawn when nobody at the tables is without a device', () => {
		const mounted = mountSmoke(() => m(ActForEntry, { tables: [table()], proposals: [] }));
		expect(mounted.root.querySelector('[data-testid="console-act-for"]')).toBeNull();
		mounted.unmount();
	});

	it('is drawn, with its count, when someone is', () => {
		const withGuest = table({ noDeviceMembers: [{ id: 'nd-1', name: 'Dan' }] });
		const mounted = mountSmoke(() => m(ActForEntry, { tables: [withGuest], proposals: [] }));
		expect(mounted.root.querySelector('[data-testid="console-act-for"]')?.textContent).toContain(
			'(0/1)',
		);
		mounted.unmount();
	});
});

describe('the tables, mounted', () => {
	const modes = [
		{ plenum: false, tableTalk: true },
		{ plenum: false, tableTalk: false },
		{ plenum: true, tableTalk: false },
		{ plenum: false, tableTalk: false, namesOnly: true },
		{ plenum: false, tableTalk: false, done: true },
	];

	it('draws a table card in each mode, at each table step, with and without sides', () => {
		for (const mode of modes) {
			for (const step of ['talk', 'write', 'rate'] as const) {
				for (const showSides of [false, true]) {
					smoke(
						() =>
							m(TableCard, {
								table: table({ step }),
								students,
								mainId: 'm',
								tableNumbers: [1, 2],
								showSides,
								...mode,
							}),
						[
							() =>
								m(TableCard, {
									table: table({ step: 'rate', speakerUid: 'a', speakerEndsAt: Date.now() + 5000 }),
									students,
									mainId: 'm',
									tableNumbers: [1, 2],
									showSides,
									...mode,
								}),
						],
					);
				}
			}
		}
	});

	it('draws the board unseated, seated, and with unplaced students', () => {
		const board =
			(tables: ClassTable[], extra: Record<string, unknown> = {}) =>
			() =>
				m(TablesBoard, {
					mainId: 'm',
					tables,
					students: [...students.values()],
					plenum: false,
					tableTalk: false,
					showSides: false,
					...extra,
				});
		const unplaced = [{ uid: 'c', name: 'Dan', camp: null, tableId: null }];

		smoke(board([]), [
			board([table(), table({ tableId: 'm--2', n: 2 })]),
			board([table()], { tableTalk: true, questions: [challenge] }),
			board([table()], { students: [...students.values(), ...unplaced] }),
			board([table()], { done: true }),
			board([]),
		]);
	});
});

describe('the keyed-fragment lint on the console views', () => {
	it('finds no children array that mixes keyed and unkeyed vnodes', () => {
		const found: string[] = [];
		for (const status of STATUSES) {
			STEPS.forEach((_, i) => found.push(...findMixedKeys(m(ActionBand, band(status, i)))));
		}
		for (const step of ['talk', 'write', 'rate'] as const) {
			found.push(
				...findMixedKeys(
					m(TableCard, {
						table: table({ step }),
						students,
						mainId: 'm',
						tableNumbers: [1],
						plenum: false,
						tableTalk: false,
					}),
				),
			);
		}
		expect(found).toEqual([]);
	});
});

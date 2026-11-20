// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { ClassTable, Statement } from '@freedi/shared-types';

vi.mock('@/lib/firebase', () => ({}));
vi.mock('@/lib/classroom/c3Data', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/lib/classroom/c3Data')>()),
	currentUid: () => 'me',
	listenClassOptions: () => () => undefined,
	listenMates: () => () => undefined,
	listenMyRatings: () => () => undefined,
}));

import { classState } from '@/lib/classroom/classState';
import { StudentFrame } from '@/components/StudentFrame';
import { mountSmoke, smoke } from '@/views/__tests__/mountSmoke';
import { findMixedKeys } from '@/views/__tests__/keyedLint';
import { TableFlow } from '../TableFlow';

/**
 * The student Proposals screen and the Table talk screen, MOUNTED in a real DOM
 * in every state of the spec (IA join-class-proposals-flow: T1-T6, W1-W4, R1-R2).
 * The vnode-tree tests could not see the mixed keyed/unkeyed fragment that blanked
 * every phone: only a mounted redraw throws on it.
 */

const NOW = Date.now();

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['me', 'noa', 'avi'],
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

const main = {
	statementId: 'm',
	statement: 'Lesson',
	statementSettings: { proposalsTurns: 2 },
} as unknown as Statement;

const STATES: Record<string, Partial<ClassTable>> = {
	'T1 may speak': {},
	'T2 my minute': { speakerUid: 'me', speakerEndsAt: NOW + 60_000 },
	'T3 a tablemate speaks': { speakerUid: 'noa', speakerEndsAt: NOW + 60_000 },
	'T4 I spoke': { spokenUids: ['me'] },
	'T5 round over': { spokenUids: ['me', 'noa', 'avi'] },
	'T6 all spoke, last round': { spokenUids: ['me', 'noa', 'avi'], proposalsTurn: 2 },
	'W1 pen free': { step: 'write' },
	'W2 I hold the pen': { step: 'write', writerUid: 'me' },
	'W3 a tablemate holds it': { step: 'write', writerUid: 'noa' },
	'W4 I wrote': { step: 'write', writtenUids: ['me'] },
	'R1 rate': { step: 'rate' },
	'R2 rate, others wrote': { step: 'rate', writtenUids: ['me', 'noa'] },
};

function flow(kind: 'proposals' | 'tableTalk'): () => m.Children {
	return () => m(TableFlow, { main, kind });
}

afterEach(() => {
	classState.table = null;
	document.body.innerHTML = '';
});

describe('TableFlow at Proposals, mounted', () => {
	for (const [name, overrides] of Object.entries(STATES)) {
		it(`draws ${name} and survives redraws with a changed table`, () => {
			classState.table = table(overrides);
			const mounted = mountSmoke(flow('proposals'));
			expect(mounted.root.querySelector('[data-testid="state-status"]')).not.toBeNull();
			expect(mounted.root.querySelector('.substeps')).not.toBeNull();
			mounted.redraw();
			// The table moves on while the screen is open: the same screen is diffed against the next state.
			for (const next of Object.values(STATES)) {
				classState.table = table(next);
				mounted.redraw();
			}
			classState.table = null;
			mounted.redraw();
			mounted.unmount();
		});
	}
});

describe('TableFlow at Table talk, mounted', () => {
	const talkStates: Array<Partial<ClassTable>> = [
		{},
		{ step: 'talk', askerUid: 'me' },
		{ step: 'talk', speakerUid: 'noa', speakerEndsAt: NOW + 60_000 },
		{ step: 'write', askerUid: 'noa', writerUid: 'me' },
		{ step: 'rate' },
	];

	it('draws every state and redraws between them', () => {
		classState.table = table(talkStates[0]);
		const mounted = mountSmoke(flow('tableTalk'));
		for (const next of talkStates) {
			classState.table = table(next);
			mounted.redraw();
		}
		mounted.unmount();
	});
});

describe('the keyed-fragment lint on the student frames', () => {
	it('finds no frame that mixes keyed and unkeyed siblings', () => {
		for (const kind of ['proposals', 'tableTalk'] as const) {
			for (const overrides of Object.values(STATES)) {
				classState.table = table(overrides);
				const flowComponent = TableFlow as unknown as {
					oninit: (v: unknown) => void;
					view: (v: unknown) => m.Children;
					onremove: (v: unknown) => void;
				};
				const vnode = { attrs: { main, kind }, state: {} };
				flowComponent.oninit(vnode);
				expect(findMixedKeys(flowComponent.view(vnode))).toEqual([]);
				flowComponent.onremove(vnode);
			}
		}
	});
});

describe('StudentFrame, mounted', () => {
	it('draws with and without an action, a question heading and the down look', () => {
		const frame = (extra: Record<string, unknown>) => () =>
			m(StudentFrame, { headerLine: 'Table 1', ...extra }, m('p', 'body'));

		const html = smoke(frame({ instruction: 'Do it' }), [
			frame({ ask: 'Question?', down: true }),
			frame({ instruction: 'Q', questionHeading: true, action: m('button.btn', 'Go') }),
		]);
		expect(html).toContain('Table 1');
	});
});

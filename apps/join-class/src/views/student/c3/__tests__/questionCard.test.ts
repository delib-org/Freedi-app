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
vi.mock('@/lib/liveDrafts', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/lib/liveDrafts')>()),
	initLiveDrafts: () => undefined,
}));
vi.mock('@/lib/classroom/questionText', () => ({
	getFetchedQuestionTexts: () => new Map([['q1', 'What makes a rule fair?']]),
	requestQuestionText: () => undefined,
}));

import { classState } from '@/lib/classroom/classState';
import { mountSmoke } from '@/views/__tests__/mountSmoke';
import { TableFlow } from '../TableFlow';

/**
 * Table talk: the question on the table is a card in the middle of every Q&A screen
 * (who answers, my minute, a tablemate answers, others first, answered), and a table at
 * talk with NO question is the pick screen, never "who answers".
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
		askerUid: 'noa',
		questionId: 'q1',
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: ['q1'],
		askedUids: ['noa'],
		updatedAt: 0,
		...overrides,
	};
}

const main = {
	statementId: 'm',
	statement: 'Lesson',
	statementSettings: {},
} as unknown as Statement;

const QA_STATES: Record<string, Partial<ClassTable>> = {
	'A who answers': {},
	'S my minute': { speakerUid: 'me', speakerEndsAt: NOW + 60_000 },
	'L a tablemate answers': { speakerUid: 'avi', speakerEndsAt: NOW + 60_000 },
	'W asker waits': { askerUid: 'me', askedUids: ['me'] },
	'H I answered': { spokenUids: ['me'] },
};

afterEach(() => {
	classState.table = null;
	document.body.innerHTML = '';
});

describe('the question card at Table talk', () => {
	for (const [name, overrides] of Object.entries(QA_STATES)) {
		it(`shows the question text in ${name}`, () => {
			classState.table = table(overrides);
			const mounted = mountSmoke(() => m(TableFlow, { main, kind: 'tableTalk' }));
			const card = mounted.root.querySelector('[data-testid="question-card"]');
			expect(card).not.toBeNull();
			expect(card?.textContent).toContain('What makes a rule fair?');
			expect(mounted.root.querySelector('h1')?.textContent).toBe('turn.question_label');
			mounted.unmount();
		});
	}

	it('a table at talk with no question is the pick screen, with no card and no "who answers"', () => {
		classState.table = table({ questionId: undefined, usedQuestionIds: [], askedUids: [] });
		const mounted = mountSmoke(() => m(TableFlow, { main, kind: 'tableTalk' }));
		expect(mounted.root.querySelector('[data-testid="question-card"]')).toBeNull();
		expect(mounted.root.querySelector('[data-testid="table-claim"]')).not.toBeNull();
		expect(mounted.root.querySelector('[data-testid="table-answer"]')).toBeNull();
		mounted.unmount();
	});
});

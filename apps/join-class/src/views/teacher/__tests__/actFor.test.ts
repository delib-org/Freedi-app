import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import m from 'mithril';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassBallot, ClassTable, Statement } from '@freedi/shared-types';

const castVote = vi.hoisted(() => vi.fn());
const postProposal = vi.hoisted(() => vi.fn());
const listeners = vi.hoisted(() => new Map<string, (optionId: string | null) => void>());
const stops = vi.hoisted(() => vi.fn());

vi.mock('@/lib/classroom/api', () => ({
	classCastVoteFor: castVote,
	classPostProposal: postProposal,
	classEditProposal: vi.fn(),
	classAddNoDevice: vi.fn(),
}));
vi.mock('@/lib/classroom/c3Data', () => ({
	listenStudentVote: (
		_challengeId: string,
		studentId: string,
		onData: (optionId: string | null) => void,
	) => {
		listeners.set(studentId, onData);

		return stops;
	},
}));
vi.mock('@/views/student/c3/VoteList', () => ({ VoteList: { view: () => null } }));
vi.mock('@/views/teacher/consoleState', () => ({ consoleState: { mainId: 'm' } }));
vi.mock('@/lib/i18n', () => ({
	t: (key: string, params?: Record<string, string | number>) =>
		params ? `${key}|${Object.values(params).join(',')}` : key,
}));

import { ActForSheet } from '../actFor/ActForSheet';
import { actForAddForm } from '../actFor/actForAdd';
import { actForProposal, type ActForProposalInput } from '../actFor/actForProposal';
import { actForVote } from '../actFor/actForVote';
import {
	actForMode,
	actForRowLabel,
	actForView,
	closeActFor,
	openActFor,
	slotOf,
	stopActFor,
	syncActFor,
} from '../actFor/actForState';

const DANA = 'nd_dana';
const NOA = 'nd_noa';
const STUDENT_DANA = { id: DANA, name: 'Dana', n: 3 };
const tables = [
	{
		n: 3,
		tableId: 'm--3',
		noDeviceMembers: [
			{ id: DANA, name: 'Dana' },
			{ id: NOA, name: 'Noa' },
		],
	},
] as ClassTable[];
const ballot: ClassBallot = { candidateIds: ['p1', 'p2'], frozenAt: 1 };

const sync = (stepKey: 'proposals' | 'vote' | 'summary', b?: ClassBallot, held = false): void =>
	syncActFor({ mainId: 'm', challengeId: 'ch', ballot: b, held, stepKey, tables });

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function flatten(node: unknown, out: m.Vnode[] = []): m.Vnode[] {
	if (Array.isArray(node)) node.forEach((child) => flatten(child, out));
	else if (node && typeof node === 'object') {
		const vnode = node as m.Vnode;
		out.push(vnode);
		flatten(vnode.children, out);
	}

	return out;
}

const attrOf = (nodes: m.Vnode[], testId: string): m.Vnode | undefined =>
	nodes.find((n) => (n.attrs as { 'data-testid'?: string } | null)?.['data-testid'] === testId);

const textOf = (node: m.Vnode | undefined): string =>
	flatten(node)
		.map((n) => (n.tag === '#' ? String(n.children) : ''))
		.join('');

function drawSheet(extra: Partial<Parameters<typeof sheetAttrs>[0]> = {}): m.Vnode[] {
	const outer = (ActForSheet as { view: (v: { attrs: unknown }) => m.Vnode | null }).view({
		attrs: sheetAttrs(extra),
	});
	if (!outer) return [];
	const panel = outer.tag as { view: (v: { attrs: unknown }) => m.Vnode };

	return flatten(panel.view({ attrs: outer.attrs }));
}

function sheetAttrs(extra: {
	challenge?: Statement | null;
	proposals?: Statement[];
	held?: boolean;
}) {
	return {
		mainId: 'm',
		tables,
		challenge: null,
		proposals: [],
		held: false,
		limit: 'one' as const,
		...extra,
	};
}

beforeEach(() => {
	stopActFor();
	listeners.clear();
	castVote.mockReset().mockResolvedValue({ ok: true, statementId: 'p1' });
	postProposal.mockReset().mockResolvedValue({ ok: true, proposalId: 'x' });
	stops.mockReset();
	const stored = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => stored.get(key) ?? null,
		setItem: (key: string, value: string) => stored.set(key, value),
		removeItem: (key: string) => stored.delete(key),
	});
	m.redraw = vi.fn() as unknown as typeof m.redraw;
});

describe('a vote never lands on the wrong student', () => {
	it('each student has their own slot, and a pick goes out under that id', async () => {
		sync('vote', ballot);
		const dana = slotOf('m', DANA);
		const noa = slotOf('m', NOA);
		expect(dana).not.toBe(noa);
		expect(dana.caster).not.toBe(noa.caster);
		dana.caster.pick('p1');
		noa.caster.pick('p2');
		await flush();
		expect(castVote).toHaveBeenCalledWith({ mainId: 'm', forStudentId: DANA, optionId: 'p1' });
		expect(castVote).toHaveBeenCalledWith({ mainId: 'm', forStudentId: NOA, optionId: 'p2' });
		expect(castVote).toHaveBeenCalledTimes(2);
	});

	it("moving to the next student leaves that student's selection empty", () => {
		sync('vote', ballot);
		slotOf('m', DANA).caster.pick('p1');
		expect(slotOf('m', NOA).caster.wanted).toBeNull();
		expect(slotOf('m', NOA).votedId).toBeNull();
	});

	it('each listens to their own vote, and an answer reaches only them', () => {
		sync('vote', ballot);
		expect([...listeners.keys()].sort()).toEqual([DANA, NOA]);
		listeners.get(NOA)?.('p2');
		expect(slotOf('m', NOA).votedId).toBe('p2');
		expect(slotOf('m', DANA).votedId).toBeNull();
	});

	it('listens only at the vote, and stops when the step moves on', () => {
		sync('proposals');
		expect(listeners.size).toBe(0);
		sync('vote', ballot);
		expect(listeners.size).toBe(2);
		sync('summary', ballot);
		expect(stops).toHaveBeenCalledTimes(2);
	});

	it('a stale pick is not sent once the ballot is not open any more', async () => {
		sync('vote', ballot);
		const dana = slotOf('m', DANA);
		dana.caster.wanted = 'p1';
		sync('vote', { ...ballot, pausedAt: 2 });
		listeners.get(DANA)?.(null);
		await flush();
		expect(castVote).not.toHaveBeenCalled();
	});

	it('no ghost vote: a pick is forgotten when the listener stops, and never re-sent', async () => {
		sync('vote', ballot);
		const dana = slotOf('m', DANA);
		dana.caster.pick('p1');
		await flush();
		expect(castVote).toHaveBeenCalledTimes(1);
		// The console leaves the vote; another console resets it meanwhile.
		sync('proposals');
		expect(dana.caster.wanted).toBeNull();
		expect(dana.votedId).toBeNull();
		// Back at the vote, the new listener answers "no vote" while the ballot is open.
		sync('vote', ballot);
		listeners.get(DANA)?.(null);
		await flush();
		expect(castVote).toHaveBeenCalledTimes(1);
		expect(slotOf('m', DANA).votedId).toBeNull();
	});

	it('the sheet never moves on by itself: a draw with a counted vote stays on the student', () => {
		sync('vote', ballot);
		openActFor(DANA);
		listeners.get(DANA)?.('p1');
		drawSheet();
		expect(actForView.studentId).toBe(DANA);
	});
});

describe('the header and the labels say whose it is', () => {
	it('shows the name and the table, and offers next by name', () => {
		sync('vote', ballot);
		openActFor(DANA);
		const nodes = drawSheet();
		const title = textOf(attrOf(nodes, 'act-for-title'));
		expect(title).toContain('Dana');
		expect(title).toContain('console.table_n|3');
		expect(textOf(attrOf(nodes, 'act-for-next'))).toContain('Noa');
	});

	it('names the student on the vote action and its confirmation', () => {
		sync('vote', ballot);
		const slot = slotOf('m', DANA);
		slot.votedId = 'p1';
		const nodes = flatten(
			actForVote({
				student: STUDENT_DANA,
				slot,
				ballot,
				proposals: [
					{ statementId: 'p1', statement: 'One' },
					{ statementId: 'p2', statement: 'Two' },
				] as Statement[],
				held: false,
			}),
		);
		const words = nodes.map((n) => textOf(n)).join(' ');
		expect(words).toContain('console.vote_for|Dana');
		expect(textOf(attrOf(nodes, 'act-for-confirm'))).toBe('console.vote_counted_for|Dana');
	});

	it('the row label in the table sheet follows the step', () => {
		sync('proposals');
		expect(actForRowLabel('Dana')).toBe('console.propose_for|Dana');
		sync('vote', ballot);
		expect(actForRowLabel('Dana')).toBe('console.vote_for|Dana');
		sync('summary');
		expect(actForRowLabel('Dana')).toBeNull();
	});
});

describe('availability', () => {
	it('opens only at a step with something to do', () => {
		sync('summary');
		openActFor(DANA);
		expect(actForView.open).toBe(false);
		expect(actForMode()).toBe('none');
		sync('proposals');
		openActFor(DANA);
		expect(actForView.open).toBe(true);
		closeActFor();
		expect(actForView.open).toBe(false);
	});

	it.each([
		['paused', { ...ballot, pausedAt: 2 }, false],
		['closed', { ...ballot, closedAt: 2 }, false],
		['held', ballot, true],
	] as const)('read-only when %s: the note shows and a vote cannot be cast', (_, b, held) => {
		sync('vote', b, held);
		const slot = slotOf('m', DANA);
		const nodes = flatten(
			actForVote({ student: STUDENT_DANA, slot, ballot: b, proposals: [], held }),
		);
		expect(attrOf(nodes, 'act-for-readonly')).toBeDefined();
		expect(slot.castable('p1')).toBe(false);
	});

	const base = (extra: Partial<ActForProposalInput>): ActForProposalInput => ({
		mainId: 'm',
		student: STUDENT_DANA,
		slot: slotOf('m', DANA),
		proposals: [],
		ballot: undefined,
		held: false,
		limit: 'one',
		...extra,
	});

	it('frozen ballot: no box, the proposals stay listed', () => {
		const nodes = flatten(
			actForProposal(
				base({
					ballot,
					proposals: [{ statementId: 'p1', statement: 'One', creatorId: DANA }] as Statement[],
				}),
			),
		);
		expect(attrOf(nodes, 'act-for-text')).toBeUndefined();
		expect(attrOf(nodes, 'act-for-readonly')).toBeDefined();
		expect(attrOf(nodes, 'act-for-own')).toBeDefined();
	});

	it('the add form is offered when nobody is there yet', () => {
		const nodes = flatten(actForAddForm('m', tables, false));
		expect(attrOf(nodes, 'act-for-add-name')).toBeDefined();
		expect(attrOf(nodes, 'act-for-add-table')).toBeDefined();
	});
});

describe('the proposal part', () => {
	const base = (extra: Partial<ActForProposalInput>): ActForProposalInput => ({
		mainId: 'm',
		student: STUDENT_DANA,
		slot: slotOf('m', DANA),
		proposals: [],
		ballot: undefined,
		held: false,
		limit: 'one',
		...extra,
	});
	const submit = (nodes: m.Vnode[]): void => {
		const form = nodes.find((n) => n.tag === 'form');
		(form?.attrs as { onsubmit: (e: Event) => void }).onsubmit({
			preventDefault: () => undefined,
		} as Event);
	};

	it('sends under the student id, names them, and clears only their draft', async () => {
		const dana = slotOf('m', DANA);
		const noa = slotOf('m', NOA);
		dana.newText = 'Plant trees';
		noa.newText = 'Noa words';
		submit(flatten(actForProposal(base({ slot: dana }))));
		await flush();
		expect(postProposal).toHaveBeenCalledWith(
			expect.objectContaining({ mainId: 'm', text: 'Plant trees', forStudentId: DANA }),
		);
		expect(dana.newText).toBe('');
		expect(noa.newText).toBe('Noa words');
		const nodes = flatten(actForProposal(base({ slot: dana })));
		expect(textOf(attrOf(nodes, 'act-for-confirm'))).toBe('console.proposal_sent_for|Dana');
	});

	it('a failure keeps the draft and offers a retry with the same id', async () => {
		const dana = slotOf('m', DANA);
		dana.newText = 'Plant trees';
		postProposal.mockRejectedValueOnce(new Error('offline'));
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		submit(flatten(actForProposal(base({ slot: dana }))));
		await flush();
		expect(dana.newText).toBe('Plant trees');
		const firstId = (postProposal.mock.calls[0][0] as { proposalId: string }).proposalId;
		const nodes = flatten(actForProposal(base({ slot: dana })));
		const retry = attrOf(nodes, 'act-for-retry');
		(retry?.attrs as { onclick: () => void }).onclick();
		await flush();
		expect((postProposal.mock.calls[1][0] as { proposalId: string }).proposalId).toBe(firstId);
		expect(dana.newText).toBe('');
		errorSpy.mockRestore();
	});

	it('words changed after a failure go out under a new id, so they are not dropped', async () => {
		const dana = slotOf('m', DANA);
		dana.newText = 'First words';
		postProposal.mockRejectedValueOnce(new Error('answer lost'));
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		submit(flatten(actForProposal(base({ slot: dana }))));
		await flush();
		const firstId = (postProposal.mock.calls[0][0] as { proposalId: string }).proposalId;
		const area = attrOf(flatten(actForProposal(base({ slot: dana }))), 'act-for-text');
		(area?.attrs as { oninput: (e: Event) => void }).oninput({
			target: { value: 'Better words' },
		} as unknown as Event);
		submit(flatten(actForProposal(base({ slot: dana }))));
		await flush();
		const second = postProposal.mock.calls[1][0] as { proposalId: string; text: string };
		expect(second.text).toBe('Better words');
		expect(second.proposalId).not.toBe(firstId);
		errorSpy.mockRestore();
	});

	it('under the one limit, holding one: the box edits it and says save', () => {
		const nodes = flatten(
			actForProposal(
				base({
					proposals: [{ statementId: 'p1', statement: 'One', creatorId: DANA }] as Statement[],
				}),
			),
		);
		expect(textOf(attrOf(nodes, 'act-for-propose'))).toBe('console.save_for|Dana');
	});

	it('limit lowered mid-draft: the text stays, it cannot be sent, the note names the student', () => {
		const dana = slotOf('m', DANA);
		dana.newText = 'Another idea';
		const nodes = flatten(
			actForProposal(
				base({
					slot: dana,
					proposals: [{ statementId: 'p1', statement: 'One', creatorId: DANA }] as Statement[],
				}),
			),
		);
		expect((attrOf(nodes, 'act-for-text')?.attrs as { value: string }).value).toBe('Another idea');
		expect(textOf(attrOf(nodes, 'act-for-limit'))).toBe('console.act_for_limit|Dana');
		expect((attrOf(nodes, 'act-for-propose')?.attrs as { disabled: boolean }).disabled).toBe(true);
	});

	it('unlimited: the box stays new, and what was sent is listed', () => {
		const nodes = flatten(
			actForProposal(
				base({
					limit: 'unlimited',
					proposals: [{ statementId: 'p1', statement: 'One', creatorId: DANA }] as Statement[],
				}),
			),
		);
		expect(textOf(attrOf(nodes, 'act-for-propose'))).toBe('console.propose_for|Dana');
		expect(attrOf(nodes, 'act-for-own')).toBeDefined();
	});
});

/** Every source file under a folder. */
function sourcesIn(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourcesIn(path);

		return path.endsWith('.ts') ? [path] : [];
	});
}

describe('"Entered by teacher" is for the teacher only', () => {
	const MARK = /entered_by_teacher|enteredByTeacher|enteredByUid/;
	const src = join(__dirname, '..', '..', '..');

	it('no student screen and no projector screen mentions it', () => {
		const looking = [
			...sourcesIn(join(src, 'views', 'student')),
			...sourcesIn(join(src, 'views', 'teacher', 'projector')),
			...sourcesIn(join(src, 'components')),
		];
		expect(looking.length).toBeGreaterThan(0);
		for (const path of looking) {
			expect(MARK.test(readFileSync(path, 'utf8')), path).toBe(false);
		}
	});

	it('the teacher sees it in the two places agreed', () => {
		const teacher = sourcesIn(join(src, 'views', 'teacher')).filter((path) =>
			MARK.test(readFileSync(path, 'utf8')),
		);
		expect(teacher.map((path) => path.split('/').pop()).sort()).toEqual([
			'ProposalBlock.ts',
			'WhatTheyWrote.ts',
		]);
	});
});

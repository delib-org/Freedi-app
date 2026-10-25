import { describe, it, expect } from 'vitest';
import {
	IDLE_FLOW,
	back,
	chooseNew,
	choosePrevious,
	clearInvalid,
	copyFromRow,
	failSubmit,
	failureOf,
	isPicking,
	openCreate,
	pickSource,
	startSubmit,
	type CreateFlow,
} from '../homeCreateFlow';

describe('homeCreateFlow: forward moves', () => {
	it('with lessons, "+ שיעור חדש" asks the question and focuses the first answer', () => {
		const move = openCreate(IDLE_FLOW, 3);
		expect(move.flow.step).toEqual({ kind: 'choose' });
		expect(move.focus).toEqual({ kind: 'choiceNew' });
	});

	it('with no lessons the choice is skipped', () => {
		const move = openCreate(IDLE_FLOW, 0);
		expect(move.flow.step).toEqual({ kind: 'nameNew' });
		expect(move.focus).toEqual({ kind: 'input' });
	});

	it('new questions opens the name form; previous lessons opens pick mode', () => {
		const choose = openCreate(IDLE_FLOW, 2).flow;
		expect(chooseNew(choose).flow.step).toEqual({ kind: 'nameNew' });
		const pick = choosePrevious(choose);
		expect(pick.flow.step).toEqual({ kind: 'pick' });
		expect(pick.focus).toEqual({ kind: 'pickLead' });
		expect(isPicking(pick.flow)).toBe(true);
		expect(isPicking(choose)).toBe(false);
	});

	it('choosing a row in pick mode opens the copy form with its own lesson id', () => {
		const pick = choosePrevious(openCreate(IDLE_FLOW, 2).flow).flow;
		const move = pickSource(pick, 'L1', 'new-a');
		expect(move.flow.step).toEqual({ kind: 'nameCopy', sourceId: 'L1', via: 'pick' });
		expect(move.flow.copyId).toBe('new-a');
		expect(isPicking(move.flow)).toBe(false);
	});

	it('a row action goes straight to the copy form; another row replaces it and its id', () => {
		const first = copyFromRow(IDLE_FLOW, 'L1', 'id-1').flow;
		expect(first.step).toEqual({ kind: 'nameCopy', sourceId: 'L1', via: 'row' });
		const second = copyFromRow(first, 'L2', 'id-2').flow;
		expect(second.step).toEqual({ kind: 'nameCopy', sourceId: 'L2', via: 'row' });
		expect(second.copyId).toBe('id-2');
	});

	it('pickSource outside pick mode does nothing', () => {
		const flow = openCreate(IDLE_FLOW, 2).flow;
		expect(pickSource(flow, 'L1', 'x').flow).toBe(flow);
	});
});

describe('homeCreateFlow: back (Escape / cancel)', () => {
	it('choose -> idle, focus on the new-lesson button', () => {
		const move = back(openCreate(IDLE_FLOW, 2).flow, 2);
		expect(move.flow.step).toEqual({ kind: 'idle' });
		expect(move.focus).toEqual({ kind: 'newButton' });
	});

	it('nameNew -> choose, focus on "new questions"', () => {
		const flow = chooseNew(openCreate(IDLE_FLOW, 2).flow).flow;
		const move = back(flow, 2);
		expect(move.flow.step).toEqual({ kind: 'choose' });
		expect(move.focus).toEqual({ kind: 'choiceNew' });
	});

	it('the empty state form has no back step', () => {
		const flow = openCreate(IDLE_FLOW, 0).flow;
		expect(back(flow, 0).flow).toBe(flow);
	});

	it('pick -> choose, focus on "questions from a previous lesson"', () => {
		const flow = choosePrevious(openCreate(IDLE_FLOW, 2).flow).flow;
		const move = back(flow, 2);
		expect(move.flow.step).toEqual({ kind: 'choose' });
		expect(move.focus).toEqual({ kind: 'choicePrevious' });
	});

	it('copy via pick -> pick, focus on the chosen row; the lesson id is dropped', () => {
		const flow = pickSource(choosePrevious(openCreate(IDLE_FLOW, 2).flow).flow, 'L1', 'n1').flow;
		const move = back(flow, 2);
		expect(move.flow.step).toEqual({ kind: 'pick' });
		expect(move.flow.copyId).toBeNull();
		expect(move.focus).toEqual({ kind: 'pickRow', id: 'L1' });
	});

	it("copy via a row -> idle, focus on that row's copy action", () => {
		const move = back(copyFromRow(IDLE_FLOW, 'L9', 'n9').flow, 2);
		expect(move.flow.step).toEqual({ kind: 'idle' });
		expect(move.flow.copyId).toBeNull();
		expect(move.focus).toEqual({ kind: 'rowCopy', id: 'L9' });
	});

	it('idle stays idle', () => {
		expect(back(IDLE_FLOW, 2).flow.step).toEqual({ kind: 'idle' });
	});
});

describe('homeCreateFlow: submit, busy, errors', () => {
	const copyForm: CreateFlow = copyFromRow(IDLE_FLOW, 'L1', 'n1').flow;

	it('busy blocks a second submit and Escape', () => {
		const busy = startSubmit(copyForm) as CreateFlow;
		expect(busy.busy).toBe(true);
		expect(startSubmit(busy)).toBeNull();
		expect(back(busy, 2).flow).toBe(busy);
		expect(copyFromRow(busy, 'L2', 'x').flow).toBe(busy);
	});

	it('only a name form can submit', () => {
		expect(startSubmit(IDLE_FLOW)).toBeNull();
		expect(startSubmit(openCreate(IDLE_FLOW, 2).flow)).toBeNull();
		expect(startSubmit(choosePrevious(openCreate(IDLE_FLOW, 2).flow).flow)).toBeNull();
	});

	it('a failure keeps the form and the lesson id, so a retry reuses it', () => {
		const busy = startSubmit(copyForm) as CreateFlow;
		const failed = failSubmit(busy, 'failed');
		expect(failed).toMatchObject({ busy: false, error: 'failed', copyId: 'n1' });
		expect(failed.step).toEqual(copyForm.step);
		expect(startSubmit(failed)).toMatchObject({ busy: true, error: null, copyId: 'n1' });
	});

	it('typing clears "invalid" but not a server failure', () => {
		expect(clearInvalid(failSubmit(copyForm, 'invalid')).error).toBeNull();
		expect(clearInvalid(failSubmit(copyForm, 'failed')).error).toBe('failed');
	});

	it('maps a permission refusal to "not yours" and anything else to "failed"', () => {
		expect(failureOf({ code: 'functions/permission-denied' })).toBe('not_yours');
		expect(failureOf({ code: 'functions/internal' })).toBe('failed');
		expect(failureOf(new Error('x'))).toBe('failed');
		expect(failureOf(null)).toBe('failed');
	});
});

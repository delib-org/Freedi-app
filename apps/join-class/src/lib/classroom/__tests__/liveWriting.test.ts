import { describe, expect, it } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import type { LiveDraft } from '@/lib/liveDrafts';
import {
	LINE_HOLD_MS,
	LINE_LEAVE_MS,
	LineHold,
	focusReturnTarget,
	liveLineLabel,
	pickerUids,
	resolveEnd,
	tablemateWriters,
	writerName,
	type Writer,
} from '../liveWriting';

function draft(userId: string, text: string, lastUpdate = 1000, displayName = userId): LiveDraft {
	return { userId, displayName, color: '', text, lastUpdate, reactions: [] };
}

function writer(uid: string, name = uid): Writer {
	return { uid, name, text: 'x', lastUpdate: 1 };
}

const SEATS = ['dan', 'noa', 'yossi', 'me'];
const same = (_uid: string, displayName: string): string => displayName;

describe('tablemateWriters', () => {
	it('keeps tablemates only: not me, not another table, not an empty box', () => {
		const drafts = [
			draft('noa', 'hello'),
			draft('me', 'mine'),
			draft('stranger', 'other table'),
			draft('dan', '   '),
		];
		expect(tablemateWriters(drafts, SEATS, 'me', same).map((w) => w.uid)).toEqual(['noa']);
	});

	it('orders by seating, not by uid or by activity', () => {
		const drafts = [draft('yossi', 'a'), draft('dan', 'b'), draft('noa', 'c')];
		expect(tablemateWriters(drafts, SEATS, 'me', same).map((w) => w.uid)).toEqual([
			'dan',
			'noa',
			'yossi',
		]);
	});

	it('keeps an empty box when asked (the watch view holds its writer through a pause)', () => {
		const drafts = [draft('dan', '')];
		expect(tablemateWriters(drafts, SEATS, 'me', same, true)).toHaveLength(1);
	});

	it('names the writer through the callback', () => {
		const [first] = tablemateWriters([draft('dan', 'a', 1, 'Anonymous')], SEATS, 'me', () => 'דן');
		expect(first.name).toBe('דן');
	});
});

describe('writerName', () => {
	const roster = [
		{ uid: 'dan', name: 'דן' },
		{ uid: 'noa', name: 'מישהו' },
	];

	it('uses the roster name, as the chips do', () => {
		expect(writerName('dan', 'Anonymous', roster, 'מישהו')).toBe('דן');
	});

	it('falls back to the broadcast name when the roster only has the placeholder', () => {
		expect(writerName('noa', 'נועה', roster, 'מישהו')).toBe('נועה');
		expect(writerName('zed', 'זד', roster, 'מישהו')).toBe('זד');
	});
});

describe('liveLineLabel', () => {
	it('names one writer and counts several', () => {
		expect(liveLineLabel([writer('dan', 'דן')])).toEqual({
			key: 'answer.live_one',
			params: { name: 'דן' },
		});
		expect(liveLineLabel([writer('dan'), writer('noa')])).toEqual({
			key: 'answer.live_many',
			params: { count: 2 },
		});
	});
});

describe('resolveEnd', () => {
	const proposal = (creatorId: string, lastUpdate: number): Statement =>
		({ creatorId, lastUpdate }) as Statement;

	it('is sent when the writer has a proposal updated at or after the last draft update', () => {
		expect(resolveEnd('dan', 1000, [proposal('dan', 1000)])).toBe('sent');
		expect(resolveEnd('dan', 1000, [proposal('dan', 2500)])).toBe('sent');
	});

	it('is stopped without a proposal, with an older one, or with someone else’s', () => {
		expect(resolveEnd('dan', 1000, [])).toBe('stopped');
		expect(resolveEnd('dan', 1000, [proposal('dan', 999)])).toBe('stopped');
		expect(resolveEnd('dan', 1000, [proposal('noa', 5000)])).toBe('stopped');
	});
});

describe('pickerUids', () => {
	it('lists live writers in seating order', () => {
		expect(pickerUids([writer('yossi'), writer('dan')], null, SEATS)).toEqual(['dan', 'yossi']);
	});

	it('keeps the watched writer after they end, at their seat', () => {
		expect(pickerUids([writer('yossi')], 'dan', SEATS)).toEqual(['dan', 'yossi']);
	});

	it('drops to one entry (no picker) when the watched writer is the only one left', () => {
		expect(pickerUids([], 'dan', SEATS)).toEqual(['dan']);
	});
});

describe('focusReturnTarget', () => {
	it('is the line while it exists, else the current pill of the strip', () => {
		expect(focusReturnTarget(true)).toBe('line');
		expect(focusReturnTarget(false)).toBe('pill');
	});
});

describe('LineHold (the 1.5 s leave timer)', () => {
	it('shows writers at once and has nothing scheduled while they write', () => {
		const hold = new LineHold();
		const shown = hold.view([writer('dan')], 0);
		expect(shown).toEqual({ writers: [writer('dan')], leaving: false });
		expect(hold.nextCheckAt(0)).toBeNull();
	});

	it('is absent when nobody ever wrote', () => {
		expect(new LineHold().view([], 0)).toBeNull();
	});

	it('keeps the last writers for 1.5 s, then collapses, then is gone', () => {
		const hold = new LineHold();
		hold.view([writer('dan')], 0);
		expect(hold.view([], 100)?.leaving).toBe(false);
		expect(hold.nextCheckAt(100)).toBe(100 + LINE_HOLD_MS);
		expect(hold.view([], 100 + LINE_HOLD_MS - 1)?.leaving).toBe(false);
		expect(hold.view([], 100 + LINE_HOLD_MS)).toEqual({ writers: [writer('dan')], leaving: true });
		expect(hold.nextCheckAt(100 + LINE_HOLD_MS)).toBe(100 + LINE_HOLD_MS + LINE_LEAVE_MS);
		expect(hold.view([], 100 + LINE_HOLD_MS + LINE_LEAVE_MS)).toBeNull();
		expect(hold.view([], 100 + LINE_HOLD_MS + LINE_LEAVE_MS + 10)).toBeNull();
	});

	it('does not flash when the writer retypes inside the wait', () => {
		const hold = new LineHold();
		hold.view([writer('dan')], 0);
		hold.view([], 200);
		expect(hold.view([writer('dan')], 900)?.leaving).toBe(false);
		// the wait starts over after the next end
		hold.view([], 1000);
		expect(hold.view([], 1000 + LINE_HOLD_MS - 1)?.leaving).toBe(false);
	});
});

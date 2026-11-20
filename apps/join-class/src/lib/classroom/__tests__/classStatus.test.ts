import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LessonStepKey } from '@freedi/shared-types';
import { announcementFor, classStatusFor, isOccupiedTable, tableIsRating } from '../classStatus';
import type { ClassStatusInput, StatusSnapshot } from '../classStatus';

function at(stepKey: LessonStepKey, patch: Partial<ClassStatusInput> = {}): ClassStatusInput {
	return {
		status: 'live',
		stepKey,
		joined: 20,
		classSize: 26,
		projectorWhat: 'הטקסט',
		chose: 10,
		sideTotal: 26,
		tableCount: 6,
		unseated: 0,
		tablesDone: 5,
		tablesRating: 4,
		allRated: { n: 10, m: 26, k: 3, complete: false },
		ballotFrozen: false,
		ballotPaused: false,
		ballotClosed: false,
		voted: 23,
		present: 26,
		resultsShown: false,
		stuckTables: [],
		...patch,
	};
}

describe('classStatusFor: Students are joining', () => {
	it('counts joined of the class size, ready when the class is full', () => {
		const partial = classStatusFor(at('waiting'));
		expect(partial.textKey).toBe('console.status.joined');
		expect(partial.params).toEqual({ n: 20, total: 26 });
		expect(partial.ready).toBe(false);
		expect(classStatusFor(at('waiting', { joined: 26 })).ready).toBe(true);
		expect(classStatusFor(at('waiting', { joined: 30 })).ready).toBe(true);
	});

	it('without a class size it only counts, and is never ready', () => {
		const status = classStatusFor(at('waiting', { classSize: null, joined: 12 }));
		expect(status.textKey).toBe('console.status.joined_open');
		expect(status.ready).toBe(false);
	});

	it('nobody yet is not ready, even with a class size of zero', () => {
		expect(classStatusFor(at('waiting', { joined: 0, classSize: 0 })).ready).toBe(false);
	});
});

describe('classStatusFor: Opening, Side', () => {
	it('Opening names what the projector shows and is never ready (her judgement)', () => {
		const status = classStatusFor(at('opening'));
		expect(status.textKey).toBe('console.status.on_projector');
		expect(status.params).toEqual({ what: 'הטקסט' });
		expect(status.ready).toBe(false);
	});

	it('Side is ready when every student chose a side', () => {
		expect(classStatusFor(at('side')).ready).toBe(false);
		const done = classStatusFor(at('side', { chose: 26 }));
		expect(done.ready).toBe(true);
		expect(done.textKey).toBe('console.sides_count');
		expect(done.params).toEqual({ chose: 26, total: 26 });
	});

	it('Side with nobody is not ready', () => {
		expect(classStatusFor(at('side', { chose: 0, sideTotal: 0 })).ready).toBe(false);
	});
});

describe('classStatusFor: Dividing into tables', () => {
	it('no tables yet', () => {
		const status = classStatusFor(at('tables', { tableCount: 0 }));
		expect(status.textKey).toBe('console.status.no_tables');
		expect(status.ready).toBe(false);
	});

	it('students without a table are the attention item', () => {
		const status = classStatusFor(at('tables', { unseated: 3 }));
		expect(status.textKey).toBe('console.unplaced_live');
		expect(status.params).toEqual({ count: 3 });
		expect(status.unseated).toBe(3);
		expect(status.ready).toBe(false);
	});

	it('everyone seated is ready', () => {
		const status = classStatusFor(at('tables'));
		expect(status.textKey).toBe('console.status.seated');
		expect(status.params).toEqual({ t: 6 });
		expect(status.ready).toBe(true);
	});
});

describe('classStatusFor: Investigation questions and Proposals', () => {
	it('counts tables that are done, ready when all are', () => {
		const status = classStatusFor(at('tableTalk'));
		expect(status.textKey).toBe('console.status.tables_done');
		expect(status.params).toEqual({ n: 5, m: 6 });
		expect(status.ready).toBe(false);
		expect(classStatusFor(at('tableTalk', { tablesDone: 6 })).ready).toBe(true);
	});

	it('Proposals counts tables rating or done', () => {
		const status = classStatusFor(at('proposals'));
		expect(status.textKey).toBe('console.status.tables_rating');
		expect(status.params).toEqual({ n: 4, m: 6 });
		expect(classStatusFor(at('proposals', { tablesRating: 6 })).ready).toBe(true);
	});

	it('no tables is never ready', () => {
		expect(classStatusFor(at('tableTalk', { tableCount: 0, tablesDone: 0 })).ready).toBe(false);
	});

	it('one stuck table is named, several are counted, the first one is where "Show" goes', () => {
		const one = classStatusFor(at('tableTalk', { stuckTables: [4] }));
		expect(one.stuck).toEqual({
			textKey: 'console.status.stuck_one',
			params: { t: 4 },
			firstTable: 4,
		});
		const many = classStatusFor(at('proposals', { stuckTables: [5, 2, 3] }));
		expect(many.stuck?.textKey).toBe('console.status.stuck_many');
		expect(many.stuck?.params).toEqual({ n: 3 });
		expect(many.stuck?.firstTable).toBe(2);
	});

	it('stuck tables are not reported at other steps', () => {
		expect(classStatusFor(at('tables', { stuckTables: [4] })).stuck).toBeNull();
		expect(classStatusFor(at('vote', { stuckTables: [4] })).stuck).toBeNull();
	});
});

describe('classStatusFor: All proposals', () => {
	it('is the rated-everything line, ready when it is complete', () => {
		const open = classStatusFor(at('allProposals'));
		expect(open.textKey).toBe('console.all_rated_line');
		expect(open.params).toEqual({ n: 10, m: 26, k: 3 });
		expect(open.ready).toBe(false);
		const done = classStatusFor(
			at('allProposals', { allRated: { n: 26, m: 26, k: 5, complete: true } }),
		);
		expect(done.ready).toBe(true);
	});
});

describe('classStatusFor: Vote', () => {
	it('not open yet', () => {
		const status = classStatusFor(at('vote'));
		expect(status.textKey).toBe('console.vote_status_not_open');
		expect(status.ready).toBe(false);
	});

	it('open: n of m voted, "everyone voted" is ready', () => {
		const open = classStatusFor(at('vote', { ballotFrozen: true }));
		expect(open.textKey).toBe('console.vote_progress');
		expect(open.params).toEqual({ voted: 23, present: 26 });
		expect(open.ready).toBe(false);
		const all = classStatusFor(at('vote', { ballotFrozen: true, voted: 26 }));
		expect(all.textKey).toBe('console.all_voted');
		expect(all.ready).toBe(true);
	});

	it('open with nobody in the room says only that it is open', () => {
		const status = classStatusFor(at('vote', { ballotFrozen: true, present: 0, voted: 0 }));
		expect(status.textKey).toBe('console.vote_status_open');
		expect(status.ready).toBe(false);
	});

	it('paused keeps the count', () => {
		const status = classStatusFor(at('vote', { ballotFrozen: true, ballotPaused: true }));
		expect(status.textKey).toBe('console.status.vote_paused');
		expect(status.params).toEqual({ voted: 23, present: 26 });
	});

	it('closed is always ready', () => {
		const status = classStatusFor(at('vote', { ballotFrozen: true, ballotClosed: true }));
		expect(status.textKey).toBe('console.vote_status_closed');
		expect(status.ready).toBe(true);
	});
});

describe('classStatusFor: Summary and not-live lessons', () => {
	it('says whether the class sees the results; ready when it does', () => {
		const hidden = classStatusFor(at('summary'));
		expect(hidden.textKey).toBe('console.results_chip_closed');
		expect(hidden.ready).toBe(false);
		const shown = classStatusFor(at('summary', { resultsShown: true }));
		expect(shown.textKey).toBe('console.results_chip_shown');
		expect(shown.ready).toBe(true);
	});

	it.each(['paused', 'open', 'ended'] as const)('%s: hidden (the banner says it)', (status) => {
		const result = classStatusFor(at('vote', { status }));
		expect(result.hidden).toBe(true);
		expect(result.ready).toBe(false);
	});
});

function snap(patch: Partial<StatusSnapshot> = {}): StatusSnapshot {
	return { stepKey: 'side', status: 'live', ready: false, stuckTables: [], ...patch };
}

const WORDS = { stepName: 'בחירת צד', primaryLabel: 'פתיחת השלב הבא' };

describe('announcementFor: only transitions, never every change', () => {
	it('says nothing on the first look or when nothing changed', () => {
		expect(announcementFor(null, snap(), WORDS)).toBeNull();
		expect(announcementFor(snap(), snap(), WORDS)).toBeNull();
	});

	it('says "ready" once, when it turns on', () => {
		const spoken = announcementFor(snap(), snap({ ready: true }), WORDS);
		expect(spoken).toEqual({ key: 'console.ready_live', params: { label: 'פתיחת השלב הבא' } });
		expect(announcementFor(snap({ ready: true }), snap({ ready: true }), WORDS)).toBeNull();
		expect(announcementFor(snap({ ready: true }), snap({ ready: false }), WORDS)).toBeNull();
	});

	it('names the step when it changed, and that wins over "ready"', () => {
		const spoken = announcementFor(snap(), snap({ stepKey: 'tables', ready: true }), WORDS);
		expect(spoken).toEqual({ key: 'console.moved_to', params: { name: 'בחירת צד' } });
	});

	it('says the lesson paused or ended, in the banner words', () => {
		expect(announcementFor(snap(), snap({ status: 'paused' }), WORDS)?.key).toBe(
			'lesson.paused.title',
		);
		expect(announcementFor(snap(), snap({ status: 'ended' }), WORDS)?.key).toBe(
			'console.ended_banner',
		);
	});

	it('says a table became stuck, once', () => {
		const spoken = announcementFor(snap(), snap({ stuckTables: [4] }), WORDS);
		expect(spoken).toEqual({ key: 'console.status.stuck_one', params: { t: 4 } });
		expect(
			announcementFor(snap({ stuckTables: [4] }), snap({ stuckTables: [4] }), WORDS),
		).toBeNull();
		expect(
			announcementFor(snap({ stuckTables: [4] }), snap({ stuckTables: [] }), WORDS),
		).toBeNull();
	});
});

describe('the status input carries counts only', () => {
	it('has no per-student side or camp, only numbers, flags and the table numbers', () => {
		const input = at('side');
		for (const [key, value] of Object.entries(input)) {
			expect(key).not.toMatch(/camp|uid|student(?!s)/i);
			const ok =
				typeof value === 'number' ||
				typeof value === 'boolean' ||
				typeof value === 'string' ||
				value === null ||
				(Array.isArray(value) && value.every((item) => typeof item === 'number'));
			expect(ok || key === 'allRated', key).toBe(true);
		}
	});

	it('the code that fills it never reads the side of a student', () => {
		const source = readFileSync(
			new URL('../../../views/teacher/classStatusData.ts', import.meta.url),
			'utf8',
		);
		expect(source).not.toMatch(/\.camp\b/);
	});
});

describe('Proposals: a table is ready only when it is really rating', () => {
	it('the talk is done (everyone spoke) is not rating', () => {
		expect(tableIsRating({ step: 'talk' })).toBe(false);
	});

	it('writing is not rating', () => {
		expect(tableIsRating({ step: 'write' })).toBe(false);
	});

	it('rating is rating, and a table that finished rating is still at the rate step', () => {
		expect(tableIsRating({ step: 'rate' })).toBe(true);
	});

	it('two tables that all spoke but none rates: not ready', () => {
		const status = classStatusFor(at('proposals', { tableCount: 2, tablesRating: 0 }));

		expect(status.ready).toBe(false);
	});

	it('every table at rate: ready', () => {
		expect(classStatusFor(at('proposals', { tableCount: 2, tablesRating: 2 })).ready).toBe(true);
	});
});

describe('empty tables do not hold the class back', () => {
	it('a table with nobody at it is not occupied; a table with only a no-device student is', () => {
		expect(isOccupiedTable({ memberUids: [], noDeviceMembers: [] })).toBe(false);
		expect(isOccupiedTable({ memberUids: ['a'], noDeviceMembers: [] })).toBe(true);
		expect(
			isOccupiedTable({ memberUids: [], noDeviceMembers: [{ id: 'nd-1', name: 'Dan' }] }),
		).toBe(true);
	});

	it('with the empty table left out of the total, the rest rating means ready', () => {
		expect(classStatusFor(at('proposals', { tableCount: 2, tablesRating: 2 })).ready).toBe(true);
	});
});

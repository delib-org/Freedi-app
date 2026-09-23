import { describe, expect, it, vi } from 'vitest';
import type { AgoraSession } from '@freedi/shared-types';

// The module's reads go through firebase and the console callable; the helper
// under test touches neither, and node has no business loading them.
vi.mock('../firebase', () => ({}));
vi.mock('../confirmedWrite', () => ({ trackWrite: vi.fn() }));
vi.mock('../callables', () => ({ teacherConsole: vi.fn() }));
vi.mock('../i18n', () => ({ t: (key: string) => key }));
import { classesMissingAggregates } from '../teacher';

type SessionFacts = Pick<AgoraSession, 'classId' | 'aggregatedAt'>;

const classes = [{ classId: 'a' }, { classId: 'b' }];

describe('classesMissingAggregates', () => {
	it('is empty when every folded game has its class aggregate', () => {
		const sessions: SessionFacts[] = [{ classId: 'a', aggregatedAt: 1 }];
		expect(classesMissingAggregates(classes, sessions, new Map([['a', {}]]))).toEqual([]);
	});

	it('names a class whose game was folded but whose aggregate did not come back', () => {
		const sessions: SessionFacts[] = [
			{ classId: 'a', aggregatedAt: 1 },
			{ classId: 'b', aggregatedAt: 2 },
			{ classId: 'b', aggregatedAt: 3 },
		];
		expect(classesMissingAggregates(classes, sessions, new Map([['a', {}]]))).toEqual(['b']);
	});

	it('ignores games not yet folded — no aggregate is expected for them', () => {
		const sessions: SessionFacts[] = [{ classId: 'a' }];
		expect(classesMissingAggregates(classes, sessions, new Map())).toEqual([]);
	});

	it('ignores guest games and classes this teacher no longer has', () => {
		const sessions: SessionFacts[] = [{ aggregatedAt: 1 }, { classId: 'gone', aggregatedAt: 1 }];
		expect(classesMissingAggregates(classes, sessions, new Map())).toEqual([]);
	});
});

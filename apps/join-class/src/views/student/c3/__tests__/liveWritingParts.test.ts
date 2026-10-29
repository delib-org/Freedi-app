import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassTable, Statement } from '@freedi/shared-types';
import type { LiveDraft } from '@/lib/liveDrafts';
import { LineHold } from '@/lib/classroom/liveWriting';
import type { FlowFeed } from '../FlowFeed';
import type { FlowState, WatchTarget } from '../flowTypes';

const drafts: LiveDraft[] = [];

vi.mock('@/lib/liveDrafts', () => ({
	LIVE_DRAFT_STALE_MS: 120_000,
	getLiveDrafts: () => drafts,
}));
vi.mock('@/lib/i18n', () => ({
	t: (key: string, params?: Record<string, string>) => `${key}:${params?.name ?? ''}`,
}));
vi.mock('../WatchView', () => ({ WatchView: { view: () => null } }));

const { liveWritingParts } = await import('../liveWritingParts');

const WRITER = 'u-writer';
const WATCHER = 'u-watcher';

function stateWatching(): FlowState {
	const watch: WatchTarget = {
		uid: WRITER,
		name: 'Dana',
		text: 'draft',
		lastUpdate: 1000,
		endAnnounced: null,
	};

	return {
		announced: new Set<string>([WRITER]),
		lineHold: new LineHold(),
		lineTimer: null,
		lineTimerAt: null,
		liveMessage: '',
		sentToast: null,
		watch,
	} as unknown as FlowState;
}

function run(
	self: FlowState,
	proposals: Partial<Statement>[],
): ReturnType<typeof liveWritingParts> {
	return liveWritingParts({
		self,
		table: { memberUids: [WRITER, WATCHER] } as ClassTable,
		uid: WATCHER,
		mates: [],
		someone: 'someone',
		feed: { options: proposals } as unknown as FlowFeed,
		challengeId: 'challenge',
		plenum: false,
	});
}

describe('liveWritingParts: the watcher when the writer ends', () => {
	beforeEach(() => {
		drafts.length = 0;
	});

	it('clears the watch and raises the toast when the writer sent', () => {
		const self = stateWatching();
		const result = run(self, [
			{ parentId: 'challenge', creatorId: WRITER, lastUpdate: 2000 } as Partial<Statement>,
		]);

		expect(self.watch).toBeNull();
		expect(self.sentToast?.text).toBe('answer.watch_sent:Dana');
		expect(result.overlay).toBeNull();
	});

	it('keeps the watch open when the writer only stopped', () => {
		const self = stateWatching();
		const result = run(self, []);

		expect(self.watch).not.toBeNull();
		expect(self.sentToast).toBeNull();
		expect(result.overlay).not.toBeNull();
	});

	it('keeps the watch open while the writer is still live', () => {
		drafts.push({
			userId: WRITER,
			displayName: 'Dana',
			color: '#000',
			text: 'still typing',
			lastUpdate: Date.now(),
			reactions: [],
		});
		const self = stateWatching();
		run(self, []);

		expect(self.watch).not.toBeNull();
		expect(self.sentToast).toBeNull();
	});
});

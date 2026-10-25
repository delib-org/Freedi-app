import m from 'mithril';
import type { ClassTable } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { LIVE_DRAFT_STALE_MS, getLiveDrafts } from '@/lib/liveDrafts';
import {
	liveLineLabel,
	pickerUids,
	resolveEnd,
	tablemateWriters,
	writerName,
	type Writer,
} from '@/lib/classroom/liveWriting';
import type { Mate } from '@/lib/classroom/c3Logic';
import type { FlowFeed } from './FlowFeed';
import type { FlowState } from './flowTypes';
import { WatchView } from './WatchView';

/** A redraw a hair after a draft would turn stale, so a vanished writer leaves the line. */
const STALE_REDRAW_SLACK_MS = 150;

export interface LiveWritingInput {
	self: FlowState;
	table: ClassTable;
	uid: string;
	mates: Mate[];
	someone: string;
	feed: FlowFeed;
	challengeId: string | null;
	/** The plenum (`roundPhase === 'improve'`): no line there. */
	plenum: boolean;
}

export interface LiveWritingParts {
	/** The line under the strip (null: absent). */
	line: m.Children;
	/** The watch view layer (null: closed). */
	overlay: m.Children;
	/** The hidden polite region (always drawn, so the first message is announced). */
	status: m.Children;
}

function scheduleRedraw(self: FlowState, at: number | null): void {
	if (at === null || at === self.lineTimerAt) return;
	if (self.lineTimer) clearTimeout(self.lineTimer);
	self.lineTimerAt = at;
	self.lineTimer = setTimeout(
		() => {
			self.lineTimer = null;
			self.lineTimerAt = null;
			m.redraw();
		},
		Math.max(0, at - Date.now()),
	);
}

function openWatch(self: FlowState, writer: Writer): void {
	self.watch = {
		uid: writer.uid,
		name: writer.name,
		text: writer.text,
		lastUpdate: writer.lastUpdate,
		endAnnounced: null,
	};
}

function lineButton(self: FlowState, writers: Writer[], leaving: boolean): m.Children {
	const label = liveLineLabel(writers);
	const text = t(label.key, label.params);

	return m(
		'.live-line-wrap',
		{ class: leaving ? 'live-line-wrap--leaving' : '' },
		m(
			'.live-line-wrap__inner',
			m(
				'button.live-line',
				{
					type: 'button',
					'data-testid': 'live-line',
					'aria-haspopup': 'dialog',
					'aria-label': `${text}, ${t('answer.watch_open')}`,
					onclick: () => openWatch(self, writers[0]),
				},
				[
					m('span.live-line__dot', { 'aria-hidden': 'true' }),
					m('span.live-line__text', text),
					m('span.live-line__chevron', { 'aria-hidden': 'true' }, '‹'),
				],
			),
		),
	);
}

/**
 * Live writing at the table (IA 17): the line under the strip, the watch view and
 * the one polite announcement region. Tablemates only; reads the RTDB listener
 * TableFlow already holds. Called once per redraw; it keeps its small state on
 * the FlowState (hold timer, announced writers, the watched writer).
 */
export function liveWritingParts(input: LiveWritingInput): LiveWritingParts {
	const { self, table, uid, mates, someone, feed, challengeId, plenum } = input;
	const nameOf = (id: string, displayName: string): string =>
		writerName(id, displayName, mates, someone);
	const drafts = getLiveDrafts({ excludeSelf: true });
	const writers = tablemateWriters(drafts, table.memberUids, uid, nameOf);
	const now = Date.now();

	for (const writer of writers) {
		if (self.announced.has(writer.uid)) continue;
		self.announced.add(writer.uid);
		self.liveMessage = t('answer.live_started', { name: writer.name });
	}

	let overlay: m.Children = null;
	let watchedLive: Writer | undefined;
	if (self.watch) {
		const watch = self.watch;
		const all = tablemateWriters(drafts, table.memberUids, uid, nameOf, true);
		watchedLive = all.find((w) => w.uid === watch.uid);
		if (watchedLive) {
			if (watchedLive.text.trim().length > 0) watch.text = watchedLive.text;
			watch.name = watchedLive.name;
			watch.lastUpdate = watchedLive.lastUpdate;
			watch.endAnnounced = null;
		}
		const state = watchedLive
			? 'live'
			: resolveEnd(
					watch.uid,
					watch.lastUpdate,
					feed.options.filter((o) => o.parentId === challengeId),
				);
		if (state !== 'live' && watch.endAnnounced !== state) {
			watch.endAnnounced = state;
			self.liveMessage = t(state === 'sent' ? 'answer.watch_sent' : 'answer.watch_stopped', {
				name: watch.name,
			});
		}
		const picks = pickerUids(writers, watch.uid, table.memberUids).map((id) => ({
			uid: id,
			name: id === watch.uid ? watch.name : (writers.find((w) => w.uid === id)?.name ?? someone),
		}));
		overlay = m(WatchView, {
			uid: watch.uid,
			name: watch.name,
			text: watch.text,
			state,
			picks,
			onPick: (id: string) => {
				const next = writers.find((w) => w.uid === id);
				if (next) openWatch(self, next);
			},
			onClose: () => {
				self.watch = null;
			},
		});
	}

	const held = self.lineHold.view(plenum ? [] : writers, now);
	const staleAt = writers.length
		? Math.min(...writers.map((w) => w.lastUpdate)) + LIVE_DRAFT_STALE_MS + STALE_REDRAW_SLACK_MS
		: null;
	const holdAt = self.lineHold.nextCheckAt(now);
	scheduleRedraw(
		self,
		holdAt !== null && staleAt !== null ? Math.min(holdAt, staleAt) : (holdAt ?? staleAt),
	);

	return {
		line: held ? lineButton(self, held.writers, held.leaving) : null,
		overlay,
		status: m(
			'p.visually-hidden',
			{ 'aria-live': 'polite', 'data-testid': 'live-status' },
			self.liveMessage,
		),
	};
}

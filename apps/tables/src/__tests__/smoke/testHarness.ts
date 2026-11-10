import m from 'mithril';
import type {
	TableAssignment,
	TableAssignmentParticipant,
	TableAssignmentRosterEntry,
	TableAssignmentRun,
	TableAssignmentTopic,
} from '@freedi/shared-types';

/**
 * Shared by the smoke tests: the in-memory data the mocked subscriptions
 * serve, a way to make every read fail, and a helper that mounts a screen
 * in jsdom and returns what it printed.
 */
export interface FakeStore {
	session: TableAssignment | null;
	topics: TableAssignmentTopic[];
	everyone: TableAssignmentRosterEntry[];
	me: TableAssignmentParticipant | null;
	runs: TableAssignmentRun[];
	run: TableAssignmentRun | null;
	hostSessions: TableAssignment[];
	/** A Firestore error code every subscription reports instead of data. */
	failWith: string | null;
	/** The same, for the topics subscription only. */
	failTopicsWith: string | null;
}

export function emptyStore(): FakeStore {
	return {
		session: null,
		topics: [],
		everyone: [],
		me: null,
		runs: [],
		run: null,
		hostSessions: [],
		failWith: null,
		failTopicsWith: null,
	};
}

const SETTLE_MS = 0;

export async function renderScreen<Attrs>(
	component: m.Component<Attrs>,
	attrs: Attrs,
): Promise<{ root: HTMLElement; text: string }> {
	const root = document.createElement('div');

	document.body.appendChild(root);
	m.mount(root, { view: () => m(component, attrs as never) });
	await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
	m.redraw.sync();
	await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
	m.redraw.sync();

	return { root, text: root.textContent ?? '' };
}

export function unmountAll(): void {
	for (const child of Array.from(document.body.children)) {
		m.mount(child, null);
		child.remove();
	}
}

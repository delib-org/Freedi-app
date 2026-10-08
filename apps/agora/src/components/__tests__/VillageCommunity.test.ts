vi.mock('../Inbox', () => ({ Inbox: vi.fn() }));
import { describe, it, expect, vi } from 'vitest';
import {
	AgoraMessageKind,
	AgoraSessionStatus,
	AgoraStage,
	StatementType,
	type AgoraSession,
} from '@freedi/shared-types';
import type { AgoraProposal } from '../../lib/proposals';
import type m from 'mithril';
import type { ThreadChatAttrs } from '../../views/ThreadChat';

const state = vi.hoisted(() => ({
	proposals: [] as AgoraProposal[],
	answersByQuestion: {} as Record<string, AgoraProposal[]>,
	myRatings: {} as Record<string, { value: number }>,
	scores: {},
}));
vi.mock('../../lib/proposals', () => ({
	getDeliberationState: () => state,
	listenToDeliberation: vi.fn(),
	getOwnerThreads: vi.fn(() => new Map()),
	getThreadMessages: vi.fn(() => []),
	likeStatement: vi.fn(),
	rateStatement: vi.fn(),
}));
vi.mock('../../lib/session', () => ({
	getConsensusPool: () => ({ left: 0, right: 0, center: 0 }),
	getSessionState: () => ({ participants: [] }),
}));
vi.mock('../RateScale', () => ({ RateScale: vi.fn() }));
vi.mock('../ResultsBoard', () => ({ ResultsBoard: vi.fn() }));
vi.mock('../HelpersBoard', () => ({ HelpersBoard: vi.fn() }));
vi.mock('../../lib/seenState', () => ({ threadUnreadCount: vi.fn(() => 0) }));
vi.mock('../../views/ThreadChat', () => ({ ThreadChat: vi.fn() }));
vi.mock('../StageNav', () => ({ planItemLabel: () => '' }));
vi.mock('../../lib/sound', () => ({ playCoin: vi.fn() }));
import { stationNotes, VillageCommunity, type VillageCommunityAttrs } from '../VillageCommunity';
import { playCoin } from '../../lib/sound';
import { t } from '../../lib/i18n';

const proposal = (id: string, hidden = false): AgoraProposal => ({
	statementId: id,
	statement: id,
	creatorId: 'a',
	anonName: 'a',
	parentId: 'q',
	statementType: StatementType.option,
	createdAt: 1,
	lastUpdate: 1,
	hidden,
});
describe('village session integration', () => {
	it('separates question notes from proposals and omits moderated notes', () => {
		state.proposals = [proposal('solution'), proposal('hidden', true)];
		state.answersByQuestion = { q: [proposal('story')], q2: [proposal('needs')] };
		expect(
			stationNotes({ itemId: 'story', stage: AgoraStage.question, statementId: 'q' }).map(
				(p) => p.statementId,
			),
		).toEqual(['story']);
		expect(
			stationNotes({ itemId: 'vote', stage: AgoraStage.voting, statementId: 'q' }).map(
				(p) => p.statementId,
			),
		).toEqual(['solution']);
		expect(
			stationNotes({ itemId: 'empty', stage: AgoraStage.question, statementId: 'missing' }),
		).toEqual([]);
	});
	it('chimes only for a positive balance change, never initial load or redraw', () => {
		vi.useFakeTimers();
		vi.mocked(playCoin).mockClear();
		const component = VillageCommunity();
		const attrs = {
			session: { sessionId: 's' } as AgoraSession,
			userId: 'a',
			anonName: 'a',
			points: 10,
			plan: [],
			currentIndex: 0,
			viewingIndex: 0,
			navigate: vi.fn(),
			onPause: vi.fn(),
		};
		const node = { attrs } as unknown as m.VnodeDOM<VillageCommunityAttrs>;
		component.oninit!.call(component, node);
		component.onbeforeupdate!.call(component, node, node);
		expect(playCoin).not.toHaveBeenCalled();
		attrs.points = 11;
		component.onbeforeupdate!.call(component, node, node);
		component.onbeforeupdate!.call(component, node, node);
		expect(playCoin).toHaveBeenCalledTimes(1);
		attrs.points = 10.5;
		component.onbeforeupdate!.call(component, node, node);
		expect(playCoin).toHaveBeenCalledTimes(1);
		component.onremove!.call(component, node as m.VnodeDOM<VillageCommunityAttrs>);
		vi.useRealTimers();
	});
	it('offers "edit my note" on the board for my note at writable booths, including catch-up questions', () => {
		state.proposals = [proposal('mine')];
		state.answersByQuestion = { q: [proposal('my-answer')] };
		const onEditMine = vi.fn();
		const board = (viewingIndex: number, question = false, ended = false) => {
			const component = VillageCommunity();
			const attrs: VillageCommunityAttrs = {
				session: { sessionId: 's' } as AgoraSession,
				userId: 'a',
				anonName: 'a',
				plan: [
					{
						itemId: 'past',
						stage: question ? AgoraStage.question : AgoraStage.deliberation,
						statementId: 'q',
					},
					{ itemId: 'live', stage: AgoraStage.deliberation },
				],
				currentIndex: 1,
				viewingIndex,
				boardRequest: 1,
				navigate: vi.fn(),
				onPause: vi.fn(),
				onEditMine,
			};
			attrs.session = {
				...attrs.session,
				status: ended ? AgoraSessionStatus.ended : AgoraSessionStatus.live,
				stage: AgoraStage.deliberation,
				stageIndex: 1,
				stagePlan: [...attrs.plan],
			};
			const node = { attrs } as unknown as m.VnodeDOM<VillageCommunityAttrs>;
			component.oninit!.call(component, node);
			component.onbeforeupdate!.call(component, node, node);
			const tree = component.view.call(component, node);
			component.onremove!.call(component, node);

			return findButton(tree, t('village.note.edit'));
		};
		const live = board(1);
		expect(live).toBeDefined();
		(live!.attrs!.onclick as () => void)();
		expect(onEditMine).toHaveBeenCalledTimes(1);
		expect(board(0)).toBeUndefined();
		expect(board(0, true)).toBeDefined();
		expect(board(0, true, true)).toBeUndefined();
	});
	it('flags unread lines: a chip on my card and on the classmate I wrote to, and on my conversation rows', () => {
		const mine = proposal('mine');
		const theirs = { ...proposal('theirs'), creatorId: 'b', anonName: 'b' };
		const untouched = { ...proposal('untouched'), creatorId: 'c', anonName: 'c' };
		const reply = (id: string, creatorId: string, agoraThreadUserId: string): AgoraProposal => ({
			...proposal(id),
			creatorId,
			anonName: creatorId,
			agoraThreadUserId,
		});
		const renderThread = vi.fn((_attrs: ThreadChatAttrs) => null);
		let notes: AgoraProposal[] = [theirs, mine, untouched];
		const source = {
			notes: () => notes,
			// Two classmates wrote on my note: b twice, c once and I answered c
			threads: (id: string) =>
				id === 'mine'
					? new Map([
							[
								'b',
								[
									reply('b1', 'b', 'b'),
									reply('b2', 'b', 'b'),
									{
										...reply('award', 'a', 'b'),
										agoraMessageKind: AgoraMessageKind.award,
										statement: '',
									},
								],
							],
							[
								'c',
								[
									reply('c1', 'c', 'c'),
									reply('me1', 'a', 'c'),
									{
										...reply('edit', 'a', 'c'),
										agoraMessageKind: AgoraMessageKind.edit,
										statement: 'updated note',
									},
								],
							],
						])
					: new Map<string, AgoraProposal[]>(),
			// b answered the conversation I started on their note; c never did
			messages: (id: string, uid: string) =>
				id === 'theirs' && uid === 'a' ? [reply('r1', 'b', 'a')] : [],
			unread: (_key: string, messages: AgoraProposal[], uid: string) =>
				messages.filter((message) => message.creatorId !== uid).length,
			renderThread,
		};
		const component = VillageCommunity();
		const attrs: VillageCommunityAttrs = {
			session: {
				sessionId: 's',
				status: AgoraSessionStatus.live,
				stage: AgoraStage.deliberation,
				stageIndex: 0,
			} as AgoraSession,
			userId: 'a',
			anonName: 'a',
			plan: [{ itemId: 'live', stage: AgoraStage.deliberation }],
			currentIndex: 0,
			viewingIndex: 0,
			boardRequest: 1,
			source,
			navigate: vi.fn(),
			onPause: vi.fn(),
		};
		const node = { attrs } as unknown as m.VnodeDOM<VillageCommunityAttrs>;
		component.oninit!.call(component, node);
		component.onbeforeupdate!.call(component, node, node);
		const board = component.view.call(component, node);
		const cards = findAllByClass(board, 'village-note');
		expect(cards).toHaveLength(3);
		expect(nodeText(findAllByClass(cards[0], 'village-note__ownership')[0])).toBe(
			t('village.note.yours'),
		);
		// Pin mine without changing classmates' original numbers.
		expect(nodeText(findAllByClass(cards[1], 'village-note__title')[0])).toBe(
			t('village.note.n', { n: 1 }),
		);
		const chipOf = (card: Node): string | undefined =>
			findAllByClass(card, 'village-note__chip')[0]?.attrs?.['aria-label'] as string | undefined;
		// My note: 3 lines from classmates, my own answer not among them
		expect(chipOf(cards[0])).toBe(t('delib.thread_unread', { n: 3 }));
		expect(String(cards[0].attrs?.className)).toContain('village-note--news');
		// Their note: the owner's one reply to me
		expect(chipOf(cards[1])).toBe(t('delib.thread_unread_one'));
		// A note I never wrote to carries nothing
		expect(chipOf(cards[2])).toBeUndefined();
		expect(String(cards[2].attrs?.className)).not.toContain('village-note--news');

		// Inside "replies to my note", each conversation row says what is new in it
		(findButton(board, t('village.note.replies'))!.attrs!.onclick as () => void)();
		const rows = findAllByClass(component.view.call(component, node), 'village-note--conversation');
		expect(rows).toHaveLength(2);
		expect(nodeText(findAllByClass(rows[0], 'village-note__text')[0])).toBe('b2');
		expect(nodeText(findAllByClass(rows[1], 'village-note__text')[0])).toBe('me1');
		expect(chipOf(rows[0])).toBe(t('delib.thread_unread', { n: 2 }));
		expect(chipOf(rows[1])).toBe(t('delib.thread_unread_one'));
		// Identify each conversation by the same pseudonym shown inside it.
		expect(findButton(rows[0], t('delib.chat_with', { name: 'b' }))).toBeDefined();
		expect(findButton(rows[1], t('delib.chat_with', { name: 'c' }))).toBeDefined();
		(rows[0].attrs!.onclick as () => void)();
		component.view.call(component, node);
		const ownerThread: ThreadChatAttrs =
			renderThread.mock.calls[renderThread.mock.calls.length - 1][0];
		expect(ownerThread.backLabel).toBe(t('village.note.replies'));
		expect(ownerThread.proposal.statementId).toBe('mine');
		ownerThread.onBack();
		// Back climbs one level to the same note's conversations, not all notes.
		const backToReplies = component.view.call(component, node);
		expect(findAllByClass(backToReplies, 'village-note--conversation')).toHaveLength(2);
		expect(findButton(backToReplies, t('delib.chat_with', { name: 'c' }))).toBeDefined();
		(findButton(backToReplies, t('village.board.back'))!.attrs!.onclick as () => void)();
		const backToBoard = component.view.call(component, node);
		const peerCard = findAllByClass(backToBoard, 'village-note')[1];
		(findButton(peerCard, t('village.note.improve'))!.attrs!.onclick as () => void)();
		component.view.call(component, node);
		const peerThread: ThreadChatAttrs =
			renderThread.mock.calls[renderThread.mock.calls.length - 1][0];
		expect(peerThread.backLabel).toBe(t('village.board.back'));
		peerThread.onBack();
		expect(findAllByClass(component.view.call(component, node), 'village-note')).toHaveLength(3);
		// Incoming snapshots can move mine in the source list; it remains first.
		notes = [theirs, untouched, mine];
		const reordered = findAllByClass(component.view.call(component, node), 'village-note');
		expect(findAllByClass(reordered[0], 'village-note__ownership')).toHaveLength(1);
		notes = [theirs, untouched];
		const withoutMine = component.view.call(component, node);
		expect(findAllByClass(withoutMine, 'village-note')).toHaveLength(2);
		expect(findAllByClass(withoutMine, 'village-note__ownership')).toHaveLength(0);
		component.onremove!.call(component, node);
	});
});

/** Every vnode wearing `cls` in its class list, in render order */
function findAllByClass(tree: unknown, cls: string): Node[] {
	if (Array.isArray(tree)) return tree.flatMap((child) => findAllByClass(child, cls));
	if (!tree || typeof tree !== 'object') return [];
	const node = tree as Node;
	const classes = String(node.attrs?.className ?? node.attrs?.class ?? '').split(/\s+/);
	const own = classes.includes(cls) ? [node] : [];

	return [...own, ...findAllByClass(node.children, cls)];
}

interface Node {
	tag?: unknown;
	attrs?: Record<string, unknown>;
	children?: unknown;
	text?: unknown;
}
function nodeText(tree: unknown): string {
	if (typeof tree === 'string') return tree;
	if (Array.isArray(tree)) return tree.map(nodeText).join('');
	if (!tree || typeof tree !== 'object') return '';
	const node = tree as Node;

	return nodeText(node.text) + nodeText(node.children);
}
/** The first `button` vnode whose own text includes `label` */
function findButton(tree: unknown, label: string): Node | undefined {
	if (Array.isArray(tree)) {
		for (const child of tree) {
			const hit = findButton(child, label);
			if (hit) return hit;
		}

		return undefined;
	}
	if (!tree || typeof tree !== 'object') return undefined;
	const node = tree as Node;
	if (node.tag === 'button' && nodeText(node).includes(label)) return node;

	return findButton(node.children, label);
}

vi.mock('../Inbox', () => ({ Inbox: vi.fn() }));
import { describe, it, expect, vi } from 'vitest';
import {
	AgoraSessionStatus,
	AgoraStage,
	StatementType,
	type AgoraSession,
} from '@freedi/shared-types';
import type { AgoraProposal } from '../../lib/proposals';
import type m from 'mithril';

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
			agoraThreadUserId,
		});
		const source = {
			notes: () => [mine, theirs, untouched],
			// Two classmates wrote on my note: b twice, c once and I answered c
			threads: (id: string) =>
				id === 'mine'
					? new Map([
							['b', [reply('b1', 'b', 'b'), reply('b2', 'b', 'b')]],
							['c', [reply('c1', 'c', 'c'), reply('me1', 'a', 'c')]],
						])
					: new Map<string, AgoraProposal[]>(),
			// b answered the conversation I started on their note; c never did
			messages: (id: string, uid: string) =>
				id === 'theirs' && uid === 'a' ? [reply('r1', 'b', 'a')] : [],
			unread: (_key: string, messages: AgoraProposal[], uid: string) =>
				messages.filter((message) => message.creatorId !== uid).length,
			renderThread: () => null,
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
		const rows = findAllByClass(component.view.call(component, node), 'village-note');
		expect(rows).toHaveLength(2);
		expect(chipOf(rows[0])).toBe(t('delib.thread_unread', { n: 2 }));
		expect(chipOf(rows[1])).toBe(t('delib.thread_unread_one'));
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
	const texts = [node.text, ...(Array.isArray(node.children) ? node.children : [])].map((c) =>
		typeof c === 'string'
			? c
			: c && typeof c === 'object'
				? String((c as Node).children ?? '')
				: '',
	);
	if (node.tag === 'button' && texts.some((text) => text.includes(label))) return node;

	return findButton(node.children, label);
}

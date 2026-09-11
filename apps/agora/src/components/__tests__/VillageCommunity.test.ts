vi.mock('../Inbox', () => ({ Inbox: vi.fn() }));
import { describe, it, expect, vi } from 'vitest';
import { AgoraStage, StatementType, type AgoraSession } from '@freedi/shared-types';
import type { AgoraProposal } from '../../lib/proposals';
import type m from 'mithril';

const state = vi.hoisted(() => ({
	proposals: [] as AgoraProposal[],
	answersByQuestion: {} as Record<string, AgoraProposal[]>,
}));
vi.mock('../../lib/proposals', () => ({
	getDeliberationState: () => state,
	listenToDeliberation: vi.fn(),
	getOwnerThreads: vi.fn(),
	getThreadMessages: vi.fn(),
}));
vi.mock('../../lib/seenState', () => ({ threadUnreadCount: vi.fn() }));
vi.mock('../../views/ThreadChat', () => ({ ThreadChat: vi.fn() }));
vi.mock('../StageNav', () => ({ planItemLabel: () => '' }));
vi.mock('../../lib/sound', () => ({ playCoin: vi.fn() }));
import { stationNotes, VillageCommunity, type VillageCommunityAttrs } from '../VillageCommunity';
import { playCoin } from '../../lib/sound';

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
});

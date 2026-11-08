import { describe, expect, it } from 'vitest';
import { AgoraStage, type AgoraSession, type AgoraStagePlanItem } from '@freedi/shared-types';
import {
	councilModelFor,
	councilNeedsVotes,
	papersFor,
	stationPapersFor,
} from '../flows/villageModel';

const item = (itemId: string, stage: AgoraStage): AgoraStagePlanItem =>
	({ itemId, stage }) as AgoraStagePlanItem;

const plan = [
	item('lobby', AgoraStage.lobby),
	item('q1', AgoraStage.question),
	item('delib', AgoraStage.deliberation),
	item('vote', AgoraStage.voting),
	item('results', AgoraStage.results),
];

const notes = [
	{ statementId: 'a', statement: 'mine', creatorId: 'me', anonName: 'Fox' },
	{ statementId: 'b', statement: 'theirs', creatorId: 'other', anonName: 'Owl' },
];

describe('papersFor', () => {
	it('marks my paper and asks the caller whether each one landed', () => {
		const papers = papersFor(notes, 'me', (id) => id === 'a');
		expect(papers).toEqual([
			{ text: 'mine', own: true, confirmed: true },
			{ text: 'theirs', own: false, confirmed: false },
		]);
	});

	it('owns nothing for a watcher with no seat', () => {
		expect(papersFor(notes, 'teacher', () => undefined).every((p) => !p.own)).toBe(true);
	});
});

describe('stationPapersFor', () => {
	it('lays papers only on opened stations, by pseudonym and never by uid', () => {
		const stations = stationPapersFor(plan, 2, (p) => (p.itemId === 'q1' ? notes : []), 'me');
		expect(stations.map((s) => s.itemId)).toEqual(['lobby', 'q1', 'delib']);
		expect(stations[1].papers).toEqual([
			{ text: 'mine', own: true, author: 'Fox' },
			{ text: 'theirs', own: false, author: 'Owl' },
		]);
		expect(JSON.stringify(stations)).not.toContain('other');
	});
});

describe('councilModelFor', () => {
	const session = {
		sessionId: 's',
		votingSettings: { goalZoneOnly: false },
	} as unknown as AgoraSession;
	const base = {
		plan,
		session,
		votes: { selections: {}, myVoteStatementId: null, votedCount: 0 },
		proposals: notes,
		scores: {},
		userId: 'me',
		classSize: 4,
		leftLabel: 'L',
		rightLabel: 'R',
	};

	it('shows the class map while the room writes and rates', () => {
		expect(councilModelFor({ ...base, currentIndex: 2 }).mode).toBe('pitch');
	});

	it('shows the ballot once the room is at the vote and the ballot is drawn', () => {
		const voting = { ...session, voting: { candidates: [] } } as unknown as AgoraSession;
		expect(councilModelFor({ ...base, session: voting, currentIndex: 3 }).mode).toBe('ballot');
	});

	it('keeps the map when the vote stage has no ballot yet', () => {
		expect(councilModelFor({ ...base, currentIndex: 3 }).mode).toBe('pitch');
	});

	it('needs the ballot listener only while the room votes', () => {
		expect(councilNeedsVotes(plan, 3)).toBe(true);
		expect(councilNeedsVotes(plan, 2)).toBe(false);
	});
});

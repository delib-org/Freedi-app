import { safeParse } from 'valibot';
import {
	AGORA_STATION_LINK,
	AgoraParticipantSchema,
	AgoraStage,
	AgoraStagePlanItemSchema,
	agoraGuestClaimOf,
	parseHandoffFragment,
	parseStationLink,
	stationDeepLink,
	stationReturnPath,
	stationReturnUrl,
	stationVisitCounts,
	stationVisitState,
	validateStagePlan,
	type AgoraStagePlanItem,
} from '../index';

const LINK = { app: 'main' as const, statementId: 'q1', title: 'Where to plant?', linkedAt: 1 };

describe('parseStationLink', () => {
	it('reads a main-app question link on an allowed host', () => {
		expect(parseStationLink('https://app.wizcol.com/statement/abc123')).toEqual({
			app: 'main',
			statementId: 'abc123',
		});
		expect(parseStationLink('https://freedi-test.web.app/statement/abc/main')).toEqual({
			app: 'main',
			statementId: 'abc',
		});
		expect(parseStationLink('https://app.wizcol.com/statement-screen/xyz/options')).toEqual({
			app: 'main',
			statementId: 'xyz',
		});
		expect(parseStationLink('  https://app.wizcol.com/stage/s-9  ')).toEqual({
			app: 'main',
			statementId: 's-9',
		});
	});

	it('reads Join links on the Join hosts', () => {
		expect(parseStationLink('https://join.wizcol.com/q/qq1')).toEqual({
			app: 'join',
			statementId: 'qq1',
		});
		expect(parseStationLink('https://join.wizcol.com/m/meet/q/qq2')).toEqual({
			app: 'join',
			statementId: 'qq2',
		});
	});

	it('refuses other hosts, other paths, plain http and junk', () => {
		expect(parseStationLink('https://evil.example/statement/abc')).toBeNull();
		expect(parseStationLink('https://app.wizcol.com/home')).toBeNull();
		expect(parseStationLink('https://join.wizcol.com/statement/abc')).toBeNull();
		expect(parseStationLink('http://app.wizcol.com/statement/abc')).toBeNull();
		expect(parseStationLink('not a url')).toBeNull();
		expect(parseStationLink('')).toBeNull();
		expect(parseStationLink('https://app.wizcol.com/statement/a%2Fb')).toBeNull();
		expect(
			parseStationLink(
				`https://app.wizcol.com/statement/${'a'.repeat(AGORA_STATION_LINK.MAX_URL_CHARS)}`,
			),
		).toBeNull();
	});

	it('accepts localhost only when allowed, deciding the app by the path', () => {
		expect(parseStationLink('http://localhost:5283/statement/abc')).toBeNull();
		expect(
			parseStationLink('http://localhost:5283/statement/abc', { allowLocalhost: true }),
		).toEqual({
			app: 'main',
			statementId: 'abc',
		});
		expect(parseStationLink('http://127.0.0.1:3007/q/z', { allowLocalhost: true })).toEqual({
			app: 'join',
			statementId: 'z',
		});
	});
});

describe('return and deep links', () => {
	it('builds the return path to the same station', () => {
		expect(stationReturnPath('s1', 'linked-1')).toBe('/#!/play/s1?at=booth%3Alinked-1&back=1');
		expect(stationReturnUrl('https://agora.wizcol.com/', 's1', 'linked-1')).toBe(
			'https://agora.wizcol.com/#!/play/s1?at=booth%3Alinked-1&back=1',
		);
	});

	it('puts the code in the fragment and reads it back', () => {
		const url = stationDeepLink({
			app: 'main',
			origin: 'https://app.wizcol.com',
			statementId: 'q1',
			code: 'C0de_-x',
			sessionId: 's1',
			itemId: 'linked-1',
		});
		expect(url.startsWith('https://app.wizcol.com/statement/q1#')).toBe(true);
		expect(url).not.toContain('?');
		expect(parseHandoffFragment(new URL(url).hash)).toEqual({
			code: 'C0de_-x',
			opened: true,
			sessionId: 's1',
			itemId: 'linked-1',
		});
	});

	it('ignores a fragment with no code, an over-long code, or a malformed hint', () => {
		expect(parseHandoffFragment('#via=open')).toBeNull();
		expect(parseHandoffFragment(`#freedi-handoff=${'x'.repeat(101)}`)).toBeNull();
		expect(parseHandoffFragment('#freedi-handoff=abc&as=s1')).toEqual({
			code: 'abc',
			opened: false,
		});
		expect(parseHandoffFragment('#freedi-handoff=abc&as=s/1~i')).toEqual({
			code: 'abc',
			opened: false,
		});
	});

	it('reads the guest claim only when it is well formed', () => {
		expect(agoraGuestClaimOf({ agora: { s: 's1', i: 'i1', q: 'q1' } })).toEqual({
			s: 's1',
			i: 'i1',
			q: 'q1',
		});
		expect(agoraGuestClaimOf({})).toBeNull();
		expect(agoraGuestClaimOf({ agora: 'x' })).toBeNull();
		expect(agoraGuestClaimOf({ agora: { s: 's1', i: 'i1' } })).toBeNull();
		expect(agoraGuestClaimOf({ agora: { s: 's/1', i: 'i1', q: 'q1' } })).toBeNull();
	});
});

describe('station visits', () => {
	it('reads none, opened, back — and opened again after a second tap', () => {
		expect(stationVisitState(undefined)).toBe('none');
		expect(stationVisitState({ openedAt: 10 })).toBe('opened');
		expect(stationVisitState({ openedAt: 10, returnedAt: 20 })).toBe('back');
		expect(stationVisitState({ openedAt: 30, returnedAt: 20 })).toBe('opened');
	});

	it('counts the class', () => {
		expect(
			stationVisitCounts([
				undefined,
				{ openedAt: 1 },
				{ openedAt: 1, returnedAt: 2 },
				{ openedAt: 3, returnedAt: 4 },
			]),
		).toEqual({ opened: 3, back: 2 });
	});

	it('is part of the participant schema', () => {
		const parsed = safeParse(AgoraParticipantSchema, {
			participantId: 's--u',
			sessionId: 's',
			userId: 'u',
			anonName: 'Brave Owl',
			points: { valueAccuracy: 0, proposals: 0, helping: 0, total: 0 },
			joinedAt: 1,
			lastActive: 1,
			stationVisits: { 'linked-1': { openedAt: 5, returnedAt: 6 } },
		});
		expect(parsed.success).toBe(true);
	});
});

describe('linked plan items', () => {
	const plan = (linked: AgoraStagePlanItem): AgoraStagePlanItem[] => [
		{ itemId: 'lobby', stage: AgoraStage.lobby },
		linked,
		{ itemId: 'results', stage: AgoraStage.results },
	];

	it('keeps the link through the schema', () => {
		const parsed = safeParse(AgoraStagePlanItemSchema, {
			itemId: 'linked-1',
			stage: 'linked',
			link: LINK,
		});
		expect(parsed.success && parsed.output.link).toEqual(LINK);
	});

	it('runs only with a link', () => {
		expect(
			validateStagePlan(plan({ itemId: 'linked-1', stage: AgoraStage.linked, link: LINK }), {
				hasCharacters: false,
			}),
		).toEqual([]);
		expect(
			validateStagePlan(plan({ itemId: 'linked-1', stage: AgoraStage.linked }), {
				hasCharacters: false,
			}),
		).toEqual(['linked_needs_link']);
	});

	it('does not count as a voting source', () => {
		expect(
			validateStagePlan(
				[
					{ itemId: 'lobby', stage: AgoraStage.lobby },
					{ itemId: 'linked-1', stage: AgoraStage.linked, link: LINK },
					{ itemId: 'voting', stage: AgoraStage.voting },
					{ itemId: 'results', stage: AgoraStage.results },
				],
				{ hasCharacters: false },
			),
		).toEqual(['voting_needs_source']);
	});
});

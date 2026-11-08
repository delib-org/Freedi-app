import { describe, expect, it } from 'vitest';
import type { AgoraCharacterReview } from '@freedi/shared-types';
import { buildDefaultFrenchRevolutionTopic } from '../../defaultTopic';
import { councilVoices, verdictLine } from '../councilVoices';
import { scenarioCast } from '../scenarioCast';

const cast = scenarioCast(buildDefaultFrenchRevolutionTopic('t'));

const review = (statementId: string, characterId: string, text: string, score: number) =>
	({
		reviewId: `${statementId}--${characterId}`,
		sessionId: 's',
		statementId,
		characterId,
		verdictText: text,
		acceptanceScore: score,
		advice: [],
		asksByRound: {},
		roundNumber: 1,
		createdAt: 1,
		lastUpdate: 1,
	}) satisfies AgoraCharacterReview;

describe('councilVoices', () => {
	it('gives one tile per character that reviewed the proposal', () => {
		const reviews = {
			'p1--a': review('p1', cast[0].characterId, 'יש כאן סדר. אבל חסר לי כבוד.', 61.4),
			'p1--b': review('p1', cast[1].characterId, 'לחם לכולם!', 80),
		};
		const keyed = Object.fromEntries(Object.values(reviews).map((r) => [r.reviewId, r]));
		const voices = councilVoices('p1', cast, keyed);
		expect(voices.map((v) => v.name)).toEqual([cast[0].name, cast[1].name]);
		expect(voices[0]).toMatchObject({ score: 61, line: 'יש כאן סדר.' });
	});

	it('skips a character with no review and a proposal with none', () => {
		const r = review('p1', cast[0].characterId, 'אני מסכים.', 70);
		expect(councilVoices('p1', cast, { [r.reviewId]: r })).toHaveLength(1);
		expect(councilVoices('p2', cast, { [r.reviewId]: r })).toEqual([]);
	});

	it('trims a long verdict to one short line', () => {
		const long = `${'מילה '.repeat(40)}.`;
		expect(verdictLine(long).length).toBeLessThanOrEqual(78);
		expect(verdictLine(long).endsWith('…')).toBe(true);
		expect(verdictLine('  שורה   אחת  ')).toBe('שורה אחת');
	});
});

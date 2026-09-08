import {
	AGORA_CP_BANDS,
	AGORA_CP_BAND_ORDER,
	agoraCpBand,
	cpOf,
	groupByCpBand,
	rankByCp,
} from '../models/agora/questionSummary';

const row = (over: Partial<{ statementId: string; consensus: number; mean: number; raters: number }> = {}) => ({
	statementId: 'a',
	mean: 0.5,
	raters: 5,
	...over,
});

describe('agoraCpBand — the ladder the record is read on', () => {
	it('bands an answer the room is behind as firm', () => {
		expect(agoraCpBand(row({ consensus: 0.62 }))).toBe('strong');
		expect(agoraCpBand(row({ consensus: AGORA_CP_BANDS.STRONG_MIN }))).toBe('strong');
	});

	it('bands mild-or-thin support as emerging, not firm', () => {
		expect(agoraCpBand(row({ consensus: 0.39 }))).toBe('emerging');
		expect(agoraCpBand(row({ consensus: 0 }))).toBe('emerging');
	});

	it('bands a negative C_p as contested', () => {
		expect(agoraCpBand(row({ consensus: -0.01 }))).toBe('contested');
		expect(agoraCpBand(row({ consensus: -0.8 }))).toBe('contested');
	});

	it('calls an unrated answer unrated whatever its numbers say', () => {
		expect(agoraCpBand(row({ raters: 0, mean: 0.9, consensus: 0.9 }))).toBe('unrated');
	});

	it('demotes an answer two friends loved below one the room liked less', () => {
		// Same +0.9 mean; the pipeline's confidence penalty is what separates them
		const loved = row({ statementId: 'friends', mean: 0.9, consensus: 0.12, raters: 2 });
		const liked = row({ statementId: 'room', mean: 0.6, consensus: 0.47, raters: 18 });
		expect(agoraCpBand(loved)).toBe('emerging');
		expect(agoraCpBand(liked)).toBe('strong');
		expect(rankByCp([loved, liked]).map((r) => r.statementId)).toEqual(['room', 'friends']);
	});
});

describe('cpOf — the fallback when the pipeline has not stamped C_p', () => {
	it('reads consensus when it is there', () => {
		expect(cpOf(row({ consensus: 0.3, mean: 0.8 }))).toBe(0.3);
	});

	it('falls back to the mean rather than to a silent zero', () => {
		expect(cpOf(row({ mean: 0.8 }))).toBe(0.8);
	});

	it('reads an unrated answer as 0', () => {
		expect(cpOf(row({ raters: 0, mean: 0.8 }))).toBe(0);
	});
});

describe('groupByCpBand', () => {
	const rows = [
		row({ statementId: 'firm', consensus: 0.7 }),
		row({ statementId: 'thin', consensus: 0.1 }),
		row({ statementId: 'split', consensus: -0.3 }),
		row({ statementId: 'quiet', raters: 0 }),
	];

	it('returns bands strongest first', () => {
		expect(groupByCpBand(rows).map((group) => group.band)).toEqual([...AGORA_CP_BAND_ORDER]);
	});

	it('drops bands nothing landed in', () => {
		expect(groupByCpBand([rows[0]]).map((group) => group.band)).toEqual(['strong']);
	});

	it('puts every row in exactly one band', () => {
		const grouped = groupByCpBand(rows).flatMap((group) => group.rows.map((r) => r.statementId));
		expect(grouped.sort()).toEqual(['firm', 'quiet', 'split', 'thin']);
	});

	it('keeps a C_p-sorted input sorted inside its band', () => {
		const sorted = rankByCp([
			row({ statementId: 'lower', consensus: 0.45 }),
			row({ statementId: 'higher', consensus: 0.8 }),
		]);
		expect(groupByCpBand(sorted)[0].rows.map((r) => r.statementId)).toEqual(['higher', 'lower']);
	});
});

describe('rankByCp', () => {
	it('sinks unrated answers below every rated one', () => {
		const ranked = rankByCp([
			row({ statementId: 'quiet', raters: 0 }),
			row({ statementId: 'against', consensus: -0.5 }),
		]);
		expect(ranked.map((r) => r.statementId)).toEqual(['against', 'quiet']);
	});

	it('breaks a C_p tie by rater count, then by id', () => {
		const ranked = rankByCp([
			row({ statementId: 'b', consensus: 0.4, raters: 4 }),
			row({ statementId: 'a', consensus: 0.4, raters: 4 }),
			row({ statementId: 'c', consensus: 0.4, raters: 9 }),
		]);
		expect(ranked.map((r) => r.statementId)).toEqual(['c', 'a', 'b']);
	});
});

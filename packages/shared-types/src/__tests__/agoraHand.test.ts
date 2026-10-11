import {
	AGORA_LOTTERY,
	handGoal,
	lotteryActive,
	orderCandidates,
	planDeal,
	type DealCandidate,
} from '../models/agora';

const candidate = (statementId: string, dealtCount = 0): DealCandidate => ({
	statementId,
	dealtCount,
});
const ids = (count: number, dealtCount = 0): DealCandidate[] =>
	Array.from({ length: count }, (_, i) => candidate(`n${i + 1}`, dealtCount));
/** Deterministic tie-break: keeps input order */
let seed = 0;
const random = () => (seed += 1e-6);

beforeEach(() => {
	seed = 0;
});

describe('lotteryActive / handGoal', () => {
	it('deals by lottery only above the small-class ceiling', () => {
		expect(lotteryActive(6)).toBe(false);
		expect(lotteryActive(7)).toBe(true);
		expect(AGORA_LOTTERY.MAX_STUDENTS_WITHOUT_LOTTERY).toBe(6);
	});

	it('aims for the hand size, or every classmate when fewer', () => {
		expect(handGoal(20)).toBe(AGORA_LOTTERY.HAND_SIZE);
		expect(handGoal(3)).toBe(3);
		expect(handGoal(0)).toBe(0);
	});
});

describe('orderCandidates', () => {
	it('puts the least-dealt notes first', () => {
		const ordered = orderCandidates(
			[candidate('a', 3), candidate('b', 0), candidate('c', 1)],
			random,
		);
		expect(ordered.map((c) => c.statementId)).toEqual(['b', 'c', 'a']);
	});

	it('breaks ties at random', () => {
		const values = [0.9, 0.1, 0.5];
		let i = 0;
		const ordered = orderCandidates(
			[candidate('a'), candidate('b'), candidate('c')],
			() => values[i++],
		);
		expect(ordered.map((c) => c.statementId)).toEqual(['b', 'c', 'a']);
	});
});

describe('planDeal — fill', () => {
	it('deals a full hand on a fresh board', () => {
		const plan = planDeal({ mode: 'fill', hand: [], rated: new Set(), candidates: ids(9), random });
		expect(plan.dealt).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
		expect(plan.poolExhausted).toBe(false);
	});

	it('tops up a short hand as notes arrive, without redealing', () => {
		const plan = planDeal({
			mode: 'fill',
			hand: ['x', 'y'],
			rated: new Set(),
			candidates: ids(2),
			random,
		});
		expect(plan.dealt).toEqual(['n1', 'n2']);
		expect(plan.poolExhausted).toBe(true);
	});

	it('deals everything there is when the pool is short', () => {
		const plan = planDeal({ mode: 'fill', hand: [], rated: new Set(), candidates: ids(2), random });
		expect(plan.dealt).toEqual(['n1', 'n2']);
	});

	it('deals nothing while the hand is full and still has unrated notes', () => {
		const hand = ['a', 'b', 'c', 'd', 'e'];
		const plan = planDeal({
			mode: 'fill',
			hand,
			rated: new Set(['a', 'b']),
			candidates: ids(4),
			random,
		});
		expect(plan.dealt).toEqual([]);
		expect(plan.poolExhausted).toBe(false);
	});

	it('deals exactly one under-read note once the hand is rated through', () => {
		const hand = ['a', 'b', 'c', 'd', 'e'];
		const candidates = [candidate('well', 6), candidate('late', 1), candidate('mid', 4)];
		const plan = planDeal({ mode: 'fill', hand, rated: new Set(hand), candidates, random });
		expect(plan.dealt).toEqual(['late']);
	});

	it('deals none when every remaining note already has enough readers', () => {
		const hand = ['a', 'b', 'c', 'd', 'e'];
		const plan = planDeal({
			mode: 'fill',
			hand,
			rated: new Set(hand),
			candidates: ids(3, 6),
			random,
		});
		expect(plan.dealt).toEqual([]);
		expect(plan.poolExhausted).toBe(false);
	});

	it('reports the pool exhausted when nothing is left after the deal', () => {
		const hand = ['a', 'b', 'c', 'd', 'e'];
		const plan = planDeal({
			mode: 'fill',
			hand,
			rated: new Set(hand),
			candidates: [candidate('last', 2)],
			random,
		});
		expect(plan).toEqual({ dealt: ['last'], poolExhausted: true });
	});
});

describe('planDeal — more', () => {
	it('deals another hand of the least-dealt rest regardless of need', () => {
		const candidates = [
			...ids(3, 6),
			candidate('fresh', 0),
			...ids(2, 2).map((c) => ({ ...c, statementId: `m${c.statementId}` })),
		];
		const plan = planDeal({
			mode: 'more',
			hand: ['a', 'b', 'c', 'd', 'e'],
			rated: new Set(),
			candidates,
			random,
		});
		expect(plan.dealt).toHaveLength(5);
		expect(plan.dealt[0]).toBe('fresh');
		expect(plan.dealt.slice(1, 3)).toEqual(['mn1', 'mn2']);
		expect(plan.poolExhausted).toBe(false);
	});

	it('never deals a held or rated note (the caller excludes them from candidates)', () => {
		const plan = planDeal({
			mode: 'more',
			hand: ['a'],
			rated: new Set(['b']),
			candidates: [],
			random,
		});
		expect(plan).toEqual({ dealt: [], poolExhausted: true });
	});
});

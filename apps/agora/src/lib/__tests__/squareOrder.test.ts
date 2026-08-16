import { describe, it, expect } from 'vitest';
import {
	mergeLateArrivals,
	orderSquare,
	rankStalls,
	studentOrder,
	type OrderableProposal,
	type StallRankInputs,
} from '../squareOrder';

const ME = 'me';

function proposal(
	statementId: string,
	createdAt: number,
	creatorId = 'someone',
): OrderableProposal {
	return { statementId, creatorId, createdAt };
}

describe('orderSquare', () => {
	it('hides my own proposal — the square is other people', () => {
		const ordered = orderSquare([proposal('mine', 100, ME), proposal('theirs', 50)], {}, ME);

		expect(ordered.map((entry) => entry.statementId)).toEqual(['theirs']);
	});

	it('puts the most recently posted proposal first when nobody has edited', () => {
		const ordered = orderSquare([proposal('old', 100), proposal('new', 300)], {}, ME);

		expect(ordered.map((entry) => entry.statementId)).toEqual(['new', 'old']);
	});

	it('lifts a proposal the author rewrote above one merely posted later', () => {
		const ordered = orderSquare(
			[proposal('rewritten', 100), proposal('posted-later', 300)],
			{ rewritten: { lastEditAt: 400 } },
			ME,
		);

		expect(ordered.map((entry) => entry.statementId)).toEqual(['rewritten', 'posted-later']);
	});

	it('re-sorts when the author edits again — the newest rewrite leads', () => {
		const proposals = [proposal('a', 100), proposal('b', 200)];
		const before = orderSquare(proposals, { b: { lastEditAt: 300 } }, ME);
		const after = orderSquare(proposals, { b: { lastEditAt: 300 }, a: { lastEditAt: 500 } }, ME);

		expect(before.map((entry) => entry.statementId)).toEqual(['b', 'a']);
		expect(after.map((entry) => entry.statementId)).toEqual(['a', 'b']);
	});

	it('IGNORES the statement lastUpdate the evaluation pipeline bumps', () => {
		// A rated proposal arrives with a fresh lastUpdate riding on it. If the
		// order ever reads that field again, the row jumps under a reading
		// finger every time anybody in the class presses a face.
		const rated = { ...proposal('rated', 100), lastUpdate: Date.now() };
		const quiet = { ...proposal('quiet', 200), lastUpdate: 200 };

		const ordered = orderSquare([rated, quiet], {}, ME);

		expect(ordered.map((entry) => entry.statementId)).toEqual(['quiet', 'rated']);
	});

	it('holds the row still across a burst of ratings', () => {
		const proposals = [proposal('a', 100), proposal('b', 200), proposal('c', 300)];
		const scores = { a: { lastEditAt: 400 } };
		const first = orderSquare(proposals, scores, ME).map((entry) => entry.statementId);

		// Ratings land: score docs gain aggregates, but no lastEditAt changes
		const afterRatings = orderSquare(proposals, { ...scores, b: {}, c: {} }, ME).map(
			(entry) => entry.statementId,
		);

		expect(afterRatings).toEqual(first);
	});

	it('breaks ties per student, deterministically', () => {
		const proposals = [proposal('x', 100), proposal('y', 100), proposal('z', 100)];
		const mine = orderSquare(proposals, {}, ME).map((entry) => entry.statementId);

		expect(orderSquare(proposals, {}, ME).map((entry) => entry.statementId)).toEqual(mine);
		expect(mine).toHaveLength(3);
	});

	it('does not mutate the list it was handed', () => {
		const proposals = [proposal('a', 100), proposal('b', 300)];
		const snapshot = proposals.map((entry) => entry.statementId);
		orderSquare(proposals, {}, ME);

		expect(proposals.map((entry) => entry.statementId)).toEqual(snapshot);
	});
});

describe('studentOrder', () => {
	it('is stable for one student and differs between students', () => {
		expect(studentOrder('a', 'p1')).toBe(studentOrder('a', 'p1'));
		expect(studentOrder('a', 'p1')).not.toBe(studentOrder('b', 'p1'));
	});
});

describe('rankStalls', () => {
	const p = (statementId: string, creatorId = 'someone'): OrderableProposal => ({
		statementId,
		creatorId,
		createdAt: 0,
	});
	const none: StallRankInputs = { openIdeas: () => 0, mine: () => false };

	it('sends me to proposals I have not helped yet', () => {
		// A second idea on a text I already helped is worth less to the class
		// than a first idea on one nobody has read.
		const order = rankStalls([p('a'), p('b')], 'me', {
			openIdeas: () => 0,
			mine: (id) => id === 'a',
		});
		expect(order[order.length - 1]).toBe('a');
	});

	it('sends help where there is none', () => {
		const order = rankStalls([p('busy'), p('quiet')], 'me', {
			openIdeas: (id) => (id === 'busy' ? 3 : 0),
			mine: () => false,
		});
		expect(order[0]).toBe('quiet');
	});

	it('prefers un-helped over merely quiet', () => {
		// Rule 1 outranks rule 2: helping a text I already helped is the thing
		// we most want to avoid, even if it is the emptiest.
		const order = rankStalls([p('helped-quiet'), p('unhelped-busy')], 'me', {
			openIdeas: (id) => (id === 'unhelped-busy' ? 5 : 0),
			mine: (id) => id === 'helped-quiet',
		});
		expect(order[0]).toBe('unhelped-busy');
	});

	it('fans two equally neglected proposals across different students', () => {
		const proposals = [p('x'), p('y'), p('z')];
		const forAlice = rankStalls(proposals, 'alice', none);
		const forBob = rankStalls(proposals, 'bob', none);
		expect(forAlice.slice().sort()).toEqual(forBob.slice().sort());
		// Same set, and the shuffle is deterministic per student
		expect(rankStalls(proposals, 'alice', none)).toEqual(forAlice);
	});

	it('never deals me my own proposal', () => {
		// The caller filters, but the row must not contain it either way
		const order = rankStalls(
			[p('mine', 'me'), p('theirs', 'them')].filter((x) => x.creatorId !== 'me'),
			'me',
			none,
		);
		expect(order).toEqual(['theirs']);
	});
});

describe('mergeLateArrivals', () => {
	const p = (statementId: string): OrderableProposal => ({
		statementId,
		creatorId: 'someone',
		createdAt: 0,
	});

	it('puts a mid-lap joiner at the end, not into the middle of what I am reading', () => {
		expect(mergeLateArrivals(['a', 'b'], [p('a'), p('b'), p('late')])).toEqual(['a', 'b', 'late']);
	});

	it('leaves an unchanged row alone', () => {
		expect(mergeLateArrivals(['a', 'b'], [p('a'), p('b')])).toEqual(['a', 'b']);
	});

	it('does not resurrect a proposal that vanished from the square', () => {
		// It stays in the order but the caller drops it when mapping to docs
		expect(mergeLateArrivals(['a', 'gone'], [p('a')])).toEqual(['a', 'gone']);
	});
});

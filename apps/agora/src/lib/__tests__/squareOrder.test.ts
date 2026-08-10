import { describe, it, expect } from 'vitest';
import { orderSquare, studentOrder, type OrderableProposal } from '../squareOrder';

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

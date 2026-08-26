import { SortType, Statement } from '@freedi/shared-types';
import { sortByConsensus } from '@/redux/utils/selectorFactories';

/**
 * Ordering of the answer list.
 *
 * Two independent inputs decide what the reader sees:
 *  - `sortStatements` applies the question's ranking (`defaultSortType`, or a
 *    `:sort` the reader asked for in the URL).
 *  - `applyManualOrder` replaces that ranking entirely when an admin has saved a
 *    hand-placed order from the Top Answers panel or the Join facilitator panel.
 *
 * Kept as pure functions in their own module so both can be reasoned about — and
 * tested — without mounting the card list.
 */

/**
 * Apply an admin's hand-placed order (`statementSettings.manualOptionOrder`).
 *
 * Same precedence the Join app's list uses: ids in the saved array lead, in the
 * saved order; anything that arrived after the order was saved is appended in
 * whatever order it came in, so a new answer is never silently dropped.
 */
export function applyManualOrder(statements: Statement[], manualOrder: string[]): Statement[] {
	const rank = new Map(manualOrder.map((id, index) => [id, index]));
	const placed: Statement[] = [];
	const unplaced: Statement[] = [];

	for (const statement of statements) {
		(rank.has(statement.statementId) ? placed : unplaced).push(statement);
	}

	placed.sort((a, b) => rank.get(a.statementId)! - rank.get(b.statementId)!);

	return [...placed, ...unplaced];
}

// Helper function to sort statements
export function sortStatements(
	statements: Statement[],
	sort: string | undefined,
	randomSeed: number,
	parentStatement?: Statement,
): Statement[] {
	const sorted = [...statements];

	if (sort === 'backend-order') {
		return sorted;
	}

	switch (sort) {
		case SortType.accepted: {
			const isSingleLike = parentStatement?.statementSettings?.evaluationType === 'single-like';
			if (isSingleLike) {
				return sorted.sort((a, b) => {
					const aLikes = a.evaluation?.sumPro || a.pro || 0;
					const bLikes = b.evaluation?.sumPro || b.pro || 0;

					return bLikes - aLikes;
				});
			}

			return sorted.sort(sortByConsensus);
		}
		case SortType.newest:
			return sorted.sort((a, b) => b.createdAt - a.createdAt);
		case SortType.random:
			if (randomSeed) {
				return sorted.sort((a, b) => {
					const hashA = `${randomSeed}-${a.statementId}`
						.split('')
						.reduce(
							(acc, char, index) => acc + ((char.charCodeAt(0) * (index + 1) * randomSeed) % 10000),
							0,
						);
					const hashB = `${randomSeed}-${b.statementId}`
						.split('')
						.reduce(
							(acc, char, index) => acc + ((char.charCodeAt(0) * (index + 1) * randomSeed) % 10000),
							0,
						);

					return hashA - hashB;
				});
			}

			return sorted.sort(() => Math.random() - 0.5);
		case SortType.averageEvaluation:
			return sorted.sort(
				(a, b) => (b.evaluation?.averageEvaluation ?? 0) - (a.evaluation?.averageEvaluation ?? 0),
			);
		case SortType.mostUpdated:
			return sorted.sort((a, b) => b.lastUpdate - a.lastUpdate);
		default:
			return sorted;
	}
}

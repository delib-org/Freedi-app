/**
 * The order in which one person sees the tables on the Rank screen: random,
 * different per person, drawn once and remembered in this browser only.
 *
 * Rule for changes: tables the host removed drop out of the stored order; a
 * table the host added is placed at a random position among the others, and
 * the result is remembered again. Picked tables still move to the top (see
 * `orderTopics`); this order only decides how the rest follows.
 */

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;

/** Returns a number in [0, 1), like Math.random. Injected so tests are deterministic. */
export type RandomSource = () => number;

const ORDER_PREFIX = 'freedi_tables_order_';

export function orderStorageKey(sessionId: string, uid: string): string {
	return `${ORDER_PREFIX}${sessionId}_${uid}`;
}

/** Parse a stored order; anything malformed is ignored (null). */
export function parseOrder(raw: string | null): string[] | null {
	if (!raw) return null;

	try {
		const value: unknown = JSON.parse(raw);

		if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) return null;

		return value as string[];
	} catch {
		return null;
	}
}

export function loadOrder(sessionId: string, uid: string, storage: Reader): string[] | null {
	return parseOrder(storage.getItem(orderStorageKey(sessionId, uid)));
}

export function saveOrder(
	sessionId: string,
	uid: string,
	order: readonly string[],
	storage: Writer,
): void {
	storage.setItem(orderStorageKey(sessionId, uid), JSON.stringify(order));
}

/** Fisher-Yates on a copy: a random permutation of the ids. */
export function shuffleIds(ids: readonly string[], random: RandomSource): string[] {
	const next = [...ids];

	for (let i = next.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));

		[next[i], next[j]] = [next[j], next[i]];
	}

	return next;
}

/**
 * The stored order brought up to date with the current tables: no stored
 * order means a fresh shuffle; otherwise removed ids drop out and new ids are
 * inserted at random positions.
 */
export function reconcileOrder(
	stored: readonly string[] | null,
	currentIds: readonly string[],
	random: RandomSource,
): string[] {
	if (!stored) return shuffleIds(currentIds, random);

	const current = new Set(currentIds);
	const seen = new Set<string>();
	const kept = stored.filter((id) => {
		if (!current.has(id) || seen.has(id)) return false;
		seen.add(id);

		return true;
	});

	for (const id of currentIds) {
		if (seen.has(id)) continue;
		kept.splice(Math.floor(random() * (kept.length + 1)), 0, id);
	}

	return kept;
}

/** The tables sorted by `order`; tables missing from it keep their given order at the end. */
export function sortByOrder<T extends { topicId: string }>(
	topics: readonly T[],
	order: readonly string[],
): T[] {
	const byId = new Map(topics.map((topic) => [topic.topicId, topic]));
	const placed = order.flatMap((id) => byId.get(id) ?? []);
	const placedIds = new Set(order);

	return [...placed, ...topics.filter((topic) => !placedIds.has(topic.topicId))];
}

function sameIds(a: readonly string[] | null, b: readonly string[]): boolean {
	return a !== null && a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * The tables in this person's own order. Reads the remembered order, brings
 * it up to date, and remembers it again when it changed.
 */
export function participantTopicOrder<T extends { topicId: string }>(
	topics: readonly T[],
	sessionId: string,
	uid: string,
	storage: Reader & Writer,
	random: RandomSource = Math.random,
): T[] {
	const stored = loadOrder(sessionId, uid, storage);
	const order = reconcileOrder(
		stored,
		topics.map((topic) => topic.topicId),
		random,
	);

	if (!sameIds(stored, order)) saveOrder(sessionId, uid, order, storage);

	return sortByOrder(topics, order);
}

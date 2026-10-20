import type {
	OdysseyElderTranslation,
	OdysseyGameTranslation,
	OdysseyTranslationLang,
} from '@freedi/shared-types';
import { hashSource } from './translationSource';
import type { TranslationChunk, TranslationItem } from './translationSource';

/**
 * Assembling the translation document from flat (path → text) answers.
 *
 * The doc is rebuilt whole on every run rather than merged: a field whose
 * Hebrew vanished (a deleted stance, a removed chip) must vanish with it, and
 * index-aligned arrays (chips, needs) cannot be patched one slot at a time
 * through a Firestore merge anyway.
 */

type Draft = Omit<OdysseyGameTranslation, 'sourceHashes'>;

/** Which of a chunk's items still need the model, given the stored hashes. */
export function staleItems(
	items: TranslationItem[],
	previous: OdysseyGameTranslation | null,
	force: boolean,
): TranslationItem[] {
	if (force || !previous?.sourceHashes) return items;
	const hashes = previous.sourceHashes;

	return items.filter((entry) => hashes[entry.path] !== hashSource(entry.text));
}

/** The stored translation of `path`, read back out of a previous doc. */
export function readTranslation(
	doc: OdysseyGameTranslation | null | undefined,
	path: string,
): string | undefined {
	if (!doc) return undefined;
	const segments = path.split('/');
	let cursor: unknown = doc;
	for (const segment of segments) {
		if (cursor === null || typeof cursor !== 'object') return undefined;
		cursor = (cursor as Record<string, unknown>)[segment];
	}

	return typeof cursor === 'string' ? cursor : undefined;
}

function ensure<T extends object>(
	parent: Record<string, T | undefined>,
	key: string,
	blank: NoInfer<T>,
): T {
	parent[key] ??= blank;

	return parent[key] as T;
}

function placeInElder(elder: OdysseyElderTranslation, segments: string[], value: string): void {
	const [field, key, sub] = segments;
	switch (field) {
		case 'name':
		case 'role':
		case 'bio':
			elder[field] = value;

			return;
		case 'needs':
			(elder.needs ??= [])[Number(key)] = value;

			return;
		case 'values':
			if (sub === 'label' || sub === 'description') {
				ensure(
					(elder.values ??= {}) as Record<string, { label?: string; description?: string }>,
					key,
					{},
				)[sub] = value;
			}

			return;
		case 'reactions':
		case 'challenges':
			(elder[field] ??= {})[key] = value;

			return;
		case 'counsel':
			ensure((elder.counsel ??= {}) as Record<string, Record<string, string>>, key, {})[sub] =
				value;

			return;
		default:
			return;
	}
}

/** Put one translated string where its path says, growing the doc as needed. */
export function placeTranslation(draft: Draft, path: string, value: string): void {
	const [root, id, ...rest] = path.split('/');
	const [field, index] = rest;
	switch (root) {
		case 'texts':
			(draft.texts ??= {})[id] = value;

			return;
		case 'values':
			(draft.values ??= {})[id] = value;

			return;
		case 'stances':
			(draft.stances ??= {})[id] = value;

			return;
		case 'compassQuestions': {
			const question = ensure((draft.compassQuestions ??= {}), id, {});
			if (field === 'chips') (question.chips ??= [])[Number(index)] = value;
			else if (field === 'title' || field === 'prompt') question[field] = value;

			return;
		}
		case 'islands': {
			const island = ensure((draft.islands ??= {}), id, {});
			if (
				field === 'title' ||
				field === 'issue' ||
				field === 'shortExplain' ||
				field === 'opening' ||
				field === 'depthQuestion' ||
				field === 'question'
			) {
				island[field] = value;
			}

			return;
		}
		case 'parties': {
			const party = ensure((draft.parties ??= {}), id, {});
			if (field === 'name' || field === 'description') party[field] = value;

			return;
		}
		case 'elders':
			placeInElder(ensure((draft.elders ??= {}), id, {}), rest, value);

			return;
		default:
			return;
	}
}

/**
 * The next translation doc: for every current source field, the fresh
 * translation when the model gave one, else the previous translation when
 * the Hebrew is unchanged, else nothing (the client shows Hebrew there).
 * Index-aligned arrays keep Hebrew-less holes as empty strings so the
 * indexes still line up; the client treats a blank as "fall back".
 */
export function assembleTranslationDoc(input: {
	gameId: string;
	lang: OdysseyTranslationLang;
	chunks: TranslationChunk[];
	previous: OdysseyGameTranslation | null;
	fresh: Record<string, string>;
	now: number;
}): OdysseyGameTranslation {
	const { gameId, lang, chunks, previous, fresh, now } = input;
	const draft: Draft = { gameId, lang, updatedAt: now };
	const sourceHashes: Record<string, string> = {};

	for (const chunk of chunks) {
		for (const entry of chunk.items) {
			const hash = hashSource(entry.text);
			const kept =
				previous?.sourceHashes?.[entry.path] === hash
					? readTranslation(previous, entry.path)
					: undefined;
			const value = fresh[entry.path] ?? kept;
			if (value === undefined) {
				if (isIndexed(entry.path)) placeTranslation(draft, entry.path, '');
				continue;
			}
			placeTranslation(draft, entry.path, value);
			sourceHashes[entry.path] = hash;
		}
	}

	return { ...draft, sourceHashes };
}

function isIndexed(path: string): boolean {
	return /\/(chips|needs)\/\d+$/.test(path);
}

import {
	AGORA_LIBRARY,
	AgoraLibraryTag,
	AgoraScenarioCardText,
	AgoraTopicPackage,
	normalizeLibraryText,
	resolveTagAlias,
	showsAsFilterChip,
	tagLabelIn,
} from '@freedi/shared-types';
import type { LibrarySort } from './api';

/**
 * The pure half of the library home: what a card says in the viewer's
 * language, which cards a search and the chips let through, and which make the
 * featured row. No Firestore, no DOM — tested in node.
 */

export interface LibraryFilters {
	query: string;
	subjectIds: readonly string[];
	lessonTypeIds: readonly string[];
	/** Show only scenarios written in this language ('' = every language) */
	language: string;
}

export const NO_FILTERS: LibraryFilters = {
	query: '',
	subjectIds: [],
	lessonTypeIds: [],
	language: '',
};

export function hasActiveFilters(filters: LibraryFilters): boolean {
	return (
		filters.query.trim().length > 0 ||
		filters.subjectIds.length > 0 ||
		filters.lessonTypeIds.length > 0 ||
		filters.language !== ''
	);
}

/** A scenario as the viewer reads it */
export interface CardText {
	title: string;
	summary: string;
	/** True when the words are a translation of what the author wrote */
	translated: boolean;
}

/** The viewer-language title and summary: the cached translation when there is one, else the author's own */
export function cardTextFor(
	pkg: AgoraTopicPackage,
	lang: string,
	translations: ReadonlyMap<string, AgoraScenarioCardText>,
): CardText {
	const summary = pkg.library?.summary ?? '';
	if (pkg.language === lang) return { title: pkg.title, summary, translated: false };
	const translation = translations.get(pkg.topicPackageId);
	if (!translation) return { title: pkg.title, summary, translated: false };

	return {
		title: translation.title || pkg.title,
		summary: translation.summary || summary,
		translated: true,
	};
}

/** Ids of the scenarios whose text is in another language than the viewer's and not translated yet */
export function untranslatedIds(
	scenarios: readonly AgoraTopicPackage[],
	lang: string,
	translations: ReadonlyMap<string, AgoraScenarioCardText>,
): string[] {
	return scenarios
		.filter((pkg) => pkg.language !== lang && !translations.has(pkg.topicPackageId))
		.map((pkg) => pkg.topicPackageId);
}

/** Tag ids -> labels in the viewer's language, dropping ids with no tag doc */
export function tagLabels(
	ids: readonly string[],
	tags: ReadonlyMap<string, AgoraLibraryTag>,
	lang: string,
): string[] {
	// A tag an admin merged away still resolves: its label is the canonical tag's
	return [...new Set(ids.map((id) => resolveTagAlias(id, tags)))]
		.map((id) => tags.get(id))
		.filter((tag): tag is AgoraLibraryTag => tag !== undefined)
		.map((tag) => tagLabelIn(tag, lang));
}

function haystack(
	pkg: AgoraTopicPackage,
	lang: string,
	tags: ReadonlyMap<string, AgoraLibraryTag>,
	translations: ReadonlyMap<string, AgoraScenarioCardText>,
): { title: string; rest: string } {
	const text = cardTextFor(pkg, lang, translations);
	const ids = [...(pkg.library?.subjectIds ?? []), ...(pkg.library?.lessonTypeIds ?? [])];
	const labels = ids.flatMap((id) => {
		const tag = tags.get(id);

		return tag ? Object.values(tag.labels) : [];
	});

	return {
		title: normalizeLibraryText(`${text.title} ${pkg.title}`),
		rest: normalizeLibraryText(
			[text.summary, pkg.library?.summary ?? '', pkg.library?.authorName ?? '', ...labels].join(
				' ',
			),
		),
	};
}

/**
 * How well a card answers the search: every word must be found somewhere;
 * a word in the title counts more than one in the summary or a tag. 0 = out.
 */
export function searchScore(
	pkg: AgoraTopicPackage,
	query: string,
	lang: string,
	tags: ReadonlyMap<string, AgoraLibraryTag>,
	translations: ReadonlyMap<string, AgoraScenarioCardText>,
): number {
	const words = normalizeLibraryText(query).split(' ').filter(Boolean);
	if (words.length === 0) return 1;
	const { title, rest } = haystack(pkg, lang, tags, translations);
	let score = 0;
	for (const word of words) {
		if (title.includes(word)) score += 3;
		else if (rest.includes(word)) score += 1;
		else return 0;
	}

	return score;
}

/**
 * The cards the chips and the search let through. OR inside a chip group, AND
 * across groups and with the search. With a search, the best matches lead and
 * the loaded order (the chosen sort) breaks ties; without one the order is
 * left exactly as loaded.
 */
export function applyFilters(
	scenarios: readonly AgoraTopicPackage[],
	filters: LibraryFilters,
	lang: string,
	tags: ReadonlyMap<string, AgoraLibraryTag>,
	translations: ReadonlyMap<string, AgoraScenarioCardText>,
): AgoraTopicPackage[] {
	const subjects = new Set(filters.subjectIds);
	const lessonTypes = new Set(filters.lessonTypeIds);
	const searching = filters.query.trim().length > 0;
	const scored = scenarios
		.map((pkg, position) => ({
			pkg,
			position,
			score: searching ? searchScore(pkg, filters.query, lang, tags, translations) : 1,
		}))
		.filter(({ pkg, score }) => {
			if (score === 0) return false;
			if (filters.language && pkg.language !== filters.language) return false;
			const card = pkg.library;
			if (subjects.size > 0 && !card?.subjectIds.some((id) => subjects.has(id))) return false;
			if (lessonTypes.size > 0 && !card?.lessonTypeIds.some((id) => lessonTypes.has(id))) {
				return false;
			}

			return true;
		});
	if (searching) scored.sort((a, b) => b.score - a.score || a.position - b.position);

	return scored.map(({ pkg }) => pkg);
}

/** The "recommended" row: the best-rated scenarios that enough teachers have rated */
export function featuredScenarios(scenarios: readonly AgoraTopicPackage[]): AgoraTopicPackage[] {
	return scenarios
		.filter((pkg) => (pkg.stats?.ratingCount ?? 0) >= AGORA_LIBRARY.FEATURED_MIN_RATINGS)
		.sort((a, b) => (b.stats?.ratingBayes ?? 0) - (a.stats?.ratingBayes ?? 0))
		.slice(0, AGORA_LIBRARY.FEATURED_COUNT);
}

/** The tags that get a filter chip, of one kind, most-used first and then alphabetical */
export function chipTags(
	tags: readonly AgoraLibraryTag[],
	kind: AgoraLibraryTag['kind'],
	lang: string,
	selected: readonly string[],
): AgoraLibraryTag[] {
	return tags
		.filter((tag) => tag.kind === kind && (showsAsFilterChip(tag) || selected.includes(tag.tagId)))
		.sort(
			(a, b) =>
				b.scenarioCount - a.scenarioCount ||
				tagLabelIn(a, lang).localeCompare(tagLabelIn(b, lang), lang),
		);
}

/** The mean as a one-decimal string ("4.6"), or '' with no ratings */
export function ratingLabel(pkg: Pick<AgoraTopicPackage, 'stats'>): string {
	const stats = pkg.stats;
	if (!stats || stats.ratingCount === 0) return '';

	return (stats.ratingSum / stats.ratingCount).toFixed(1);
}

export const SORTS: readonly LibrarySort[] = ['rating', 'new', 'used'];

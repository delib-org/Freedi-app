import m from 'mithril';
import { AgoraLibraryTag, AgoraTopicPackage } from '@freedi/shared-types';
import { Icon } from '../../../components/Icon';
import { FilterChips } from '../../../components/scenarioLibrary/FilterChips';
import { ScenarioCard } from '../../../components/scenarioLibrary/ScenarioCard';
import { getAvailableLanguages, getLang, tCount, t } from '../../../lib/i18n';
import type { LibrarySort } from '../../../lib/scenarioLibrary/api';
import { getLibraryStore, loadLibrary, translateLoaded } from '../../../lib/scenarioLibrary/state';
import {
	applyFilters,
	cardTextFor,
	chipTags,
	featuredScenarios,
	hasActiveFilters,
	NO_FILTERS,
	SORTS,
	tagLabels,
	type LibraryFilters,
} from '../../../lib/scenarioLibrary/view';
import { getUserState } from '../../../lib/user';
import { LibraryShell } from './LibraryShell';
import { MineList } from './MineList';

export interface LibraryHomeAttrs {
	/** The "my scenarios" segment instead of the shared library */
	mine?: boolean;
}

/**
 * The library home: search, subject and lesson-type chips, a sort, a row of
 * recommended scenarios, and the grid. Everything is read once per sort and
 * filtered in the browser (the library is a few hundred cards, not millions).
 */
export function LibraryHome(): m.Component<LibraryHomeAttrs> {
	let filters: LibraryFilters = NO_FILTERS;
	let sort: LibrarySort = 'rating';
	let showHidden = false;

	function toggleIn(list: readonly string[], id: string): string[] {
		return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
	}

	function chipLabel(id: string, tags: ReadonlyMap<string, AgoraLibraryTag>, lang: string): string {
		return tagLabels([id], tags, lang)[0] ?? id;
	}

	function activeFilterChips(tags: ReadonlyMap<string, AgoraLibraryTag>, lang: string): m.Children {
		const removable: Array<{ key: string; label: string; clear: () => void }> = [
			...filters.subjectIds.map((id) => ({
				key: id,
				label: chipLabel(id, tags, lang),
				clear: () =>
					(filters = { ...filters, subjectIds: filters.subjectIds.filter((x) => x !== id) }),
			})),
			...filters.lessonTypeIds.map((id) => ({
				key: id,
				label: chipLabel(id, tags, lang),
				clear: () =>
					(filters = { ...filters, lessonTypeIds: filters.lessonTypeIds.filter((x) => x !== id) }),
			})),
			...(filters.language
				? [
						{
							key: 'language',
							label: getAvailableLanguages().find((l) => l.code === filters.language)?.name ?? '',
							clear: () => (filters = { ...filters, language: '' }),
						},
					]
				: []),
		];
		if (removable.length === 0 && !filters.query) return null;

		return m('.scn-active', [
			...removable.map((entry) =>
				m(
					'button.scn-chip.scn-chip--on',
					{
						key: entry.key,
						type: 'button',
						'aria-label': t('scenlib.remove_filter', { label: entry.label }),
						onclick: entry.clear,
					},
					[m('span', entry.label), m('span', { 'aria-hidden': 'true' }, '✕')],
				),
			),
			m(
				'button.btn.btn--ghost.btn--sm',
				{ key: 'clear-all', type: 'button', onclick: () => (filters = NO_FILTERS) },
				t('scenlib.clear_filters'),
			),
		]);
	}

	function card(
		pkg: AgoraTopicPackage,
		lang: string,
		opts: { featured?: boolean; hidden?: boolean } = {},
	): m.Children {
		const store = getLibraryStore();
		const uid = getUserState().user?.uid;

		return m(ScenarioCard, {
			key: pkg.topicPackageId,
			pkg,
			text: cardTextFor(pkg, lang, store.translations),
			subjects: tagLabels(pkg.library?.subjectIds ?? [], store.tags, lang),
			mine: pkg.creatorId === uid,
			featured: opts.featured,
			hidden: opts.hidden,
		});
	}

	function library(): m.Children {
		const store = getLibraryStore();
		const lang = getLang();
		const tags = [...store.tags.values()];
		const shown = applyFilters(store.scenarios, filters, lang, store.tags, store.translations);
		const active = hasActiveFilters(filters);
		const featured = !active ? featuredScenarios(store.scenarios) : [];
		const languagesHere = [...new Set(store.scenarios.map((pkg) => pkg.language))];

		return m('.scn-layout', [
			m('aside.scn-side', { 'aria-label': t('scenlib.filters') }, [
				m('.scn-search', [
					m(Icon, { name: 'search', size: 20 }),
					m('input.text-input.scn-search__input', {
						type: 'search',
						value: filters.query,
						'aria-label': t('scenlib.search_label'),
						placeholder: t('scenlib.search_ph'),
						oninput: (event: InputEvent) => {
							filters = { ...filters, query: (event.target as HTMLInputElement).value };
						},
					}),
				]),
				m(FilterChips, {
					label: t('scenlib.subjects'),
					tags: chipTags(tags, 'subject', lang, filters.subjectIds),
					selected: filters.subjectIds,
					lang,
					onToggle: (id: string) => {
						filters = { ...filters, subjectIds: toggleIn(filters.subjectIds, id) };
					},
				}),
				m(FilterChips, {
					label: t('scenlib.lesson_types'),
					tags: chipTags(tags, 'lessonType', lang, filters.lessonTypeIds),
					selected: filters.lessonTypeIds,
					lang,
					onToggle: (id: string) => {
						filters = { ...filters, lessonTypeIds: toggleIn(filters.lessonTypeIds, id) };
					},
				}),
				languagesHere.length > 1
					? m('.scn-filter', [
							m('label.scn-filter__label', { for: 'scn-language' }, t('scenlib.language')),
							m(
								'select.text-input#scn-language',
								{
									value: filters.language,
									onchange: (event: Event) => {
										filters = { ...filters, language: (event.target as HTMLSelectElement).value };
									},
								},
								[
									m('option', { value: '' }, t('scenlib.all_languages')),
									...getAvailableLanguages()
										.filter((entry) => languagesHere.includes(entry.code))
										.map((entry) => m('option', { value: entry.code }, entry.name)),
								],
							),
						])
					: null,
			]),

			m('.scn-results', [
				featured.length > 0
					? m('section.scn-featured', { 'aria-label': t('scenlib.featured') }, [
							m('h2.scn-section-title', t('scenlib.featured')),
							m(
								'.scn-featured__row',
								featured.map((pkg) => card(pkg, lang, { featured: true })),
							),
						])
					: null,

				m('.scn-bar', [
					m('p.scn-bar__count', { role: 'status' }, tCount('scenlib.count', shown.length)),
					store.translating ? m('span.scn-bar__translating', t('scenlib.translating')) : null,
					m('label.scn-sort', [
						m('span', t('scenlib.sort')),
						m(
							'select.text-input',
							{
								value: sort,
								onchange: (event: Event) => {
									sort = (event.target as HTMLSelectElement).value as LibrarySort;
									void loadLibrary(sort);
								},
							},
							SORTS.map((value) => m('option', { value }, t(`scenlib.sort_${value}`))),
						),
					]),
				]),
				activeFilterChips(store.tags, lang),

				store.failed
					? m('.card.stack', [
							m('p', { role: 'alert' }, t('scenlib.error')),
							m(
								'button.btn.btn--primary',
								{ type: 'button', onclick: () => void loadLibrary(sort) },
								t('scenlib.retry'),
							),
						])
					: store.loading && !store.loadedOnce
						? m('.spinner', { role: 'status' })
						: shown.length === 0
							? m('.scn-empty', [
									m('h2', t(active ? 'scenlib.none_found' : 'scenlib.empty_library')),
									m('p', t(active ? 'scenlib.none_found_hint' : 'scenlib.empty_library_hint')),
									m(
										m.route.Link,
										{ href: '/teach/library/mine', class: 'btn btn--primary' },
										t('scenlib.publish_one'),
									),
								])
							: m(
									'.scn-grid',
									{ role: 'list' },
									shown.map((pkg) =>
										m(
											'.scn-grid__cell',
											{ key: pkg.topicPackageId, role: 'listitem' },
											card(pkg, lang),
										),
									),
								),

				store.isAdmin && store.hidden.length > 0
					? m('section.scn-admin', [
							m(
								'button.btn.btn--ghost.btn--sm',
								{
									type: 'button',
									'aria-expanded': String(showHidden),
									onclick: () => (showHidden = !showHidden),
								},
								t('scenlib.admin_hidden_list', { n: store.hidden.length }),
							),
							showHidden
								? m(
										'.scn-grid',
										store.hidden.map((pkg) => card(pkg, lang, { hidden: true })),
									)
								: null,
						])
					: null,
			]),
		]);
	}

	return {
		view({ attrs }) {
			const mine = attrs.mine === true;
			const store = getLibraryStore();
			// The teacher switched language with the library open: ask for the cards in it
			if (
				store.access === 'approved' &&
				store.loadedOnce &&
				!store.translating &&
				store.translationLang !== getLang()
			) {
				void translateLoaded();
			}

			return m(
				LibraryShell,
				{
					title: t('scenlib.title'),
					onBack: () => m.route.set('/teach'),
					// Every visit reads again: what the page shows first is the last list
					// (so coming back is instant), and the fresh one replaces it — a
					// scenario published, hidden or copied since must not stay stale
					onApproved: () => {
						void loadLibrary(sort);
					},
				},
				[
					m('nav.scn-segment', { 'aria-label': t('scenlib.title') }, [
						m(
							m.route.Link,
							{
								href: '/teach/library',
								class: `scn-segment__opt${mine ? '' : ' scn-segment__opt--on'}`,
								'aria-current': mine ? undefined : 'page',
							},
							t('scenlib.seg_all'),
						),
						m(
							m.route.Link,
							{
								href: '/teach/library/mine',
								class: `scn-segment__opt${mine ? ' scn-segment__opt--on' : ''}`,
								'aria-current': mine ? 'page' : undefined,
							},
							t('scenlib.seg_mine'),
						),
					]),
					mine
						? m(MineList, { tags: [...store.tags.values()], sort })
						: store.access === 'approved'
							? library()
							: null,
				],
			);
		},
	};
}

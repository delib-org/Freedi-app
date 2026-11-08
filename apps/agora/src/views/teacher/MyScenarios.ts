import m from 'mithril';
import { AgoraTopicPackage, isNewerVersionAvailable } from '@freedi/shared-types';
import { ScenarioRow } from '../../components/ScenarioRow';
import { Segment } from '../../components/Segment';
import { TeacherNav } from '../../components/TeacherNav';
import { skeleton, sectionError } from './home/HomeSections';
import { t } from '../../lib/i18n';
import { fetchSourceVersions } from '../../lib/scenarioLibrary/api';
import { ensureLibraryAccess, getLibraryStore, reloadTags } from '../../lib/scenarioLibrary/state';
import { listTopicPackages } from '../../lib/teacher';
import {
	filterScenarios,
	NO_SCENARIO_QUERY,
	scenarioCounts,
	type ScenarioFilter,
	type ScenarioQuery,
	type ScenarioSort,
} from '../../lib/teacherHome';
import { ensureUser, getUserState } from '../../lib/user';
import { PublishControls } from './scenarioLibrary/PublishControls';

/**
 * "My scenarios" (/teach/scenarios): every scenario the teacher wrote or took
 * from the library, to start a lesson with, edit, and — for a teacher approved
 * for the library — to share. The home shows the top five of this same list.
 *
 * Works fully without the library: a teacher who is not approved sees no
 * switch, no "public" chip and no publish controls, and loses nothing else.
 */
export function MyScenarios(): m.Component {
	let topics: AgoraTopicPackage[] = [];
	let sources = new Map<string, { lastUpdate: number; title: string }>();
	let loaded = false;
	let failed = false;
	let loadedFor: string | null = null;
	let query: ScenarioQuery = NO_SCENARIO_QUERY;

	async function load(): Promise<void> {
		failed = false;
		try {
			const user = await ensureUser();
			loadedFor = user.uid;
			if (!user.isAnonymous) {
				void ensureLibraryAccess().then(async () => {
					if (getLibraryStore().access === 'approved' && getLibraryStore().tags.size === 0) {
						await reloadTags().catch((error: unknown) => {
							console.error('[Scenarios] Loading the tags failed:', error);
						});
					}
					m.redraw();
				});
			}
			topics = await listTopicPackages(user.uid);
			loaded = true;
			m.redraw();
			sources = await fetchSourceVersions(topics.filter((pkg) => pkg.sourceScenarioId));
		} catch (error) {
			console.error('[Scenarios] Loading my scenarios failed:', error);
			failed = true;
			loaded = true;
		}
		m.redraw();
	}

	function retry(): void {
		loaded = false;
		void load();
	}

	function chip(id: ScenarioFilter, label: string): m.Children {
		const on = query.filter === id;

		return m(
			'button.filter-chip',
			{
				type: 'button',
				class: on ? 'filter-chip--on' : undefined,
				'aria-pressed': String(on),
				onclick: () => {
					query = { ...query, filter: id };
				},
			},
			label,
		);
	}

	function controls(approved: boolean): m.Children {
		const counts = scenarioCounts(topics);

		return m('.find-bar', [
			m('input.text-input.find-bar__input', {
				type: 'search',
				value: query.query,
				'aria-label': t('teach.search_scenarios'),
				placeholder: t('teach.search_scenarios'),
				oninput: (event: InputEvent) => {
					query = { ...query, query: (event.target as HTMLInputElement).value };
				},
			}),
			m('.filter-chips', [
				chip('all', t('teach.filter_all', { n: counts.all })),
				chip('ready', t('editor.ready')),
				chip('draft', t('editor.draft')),
				approved ? chip('public', t('scenlib.public')) : null,
			]),
			m(
				'select.text-input.sort-select',
				{
					'aria-label': t('teach.sort_recent'),
					value: query.sort,
					onchange: (event: Event) => {
						query = { ...query, sort: (event.target as HTMLSelectElement).value as ScenarioSort };
					},
				},
				[
					m('option', { value: 'recent' }, t('teach.sort_recent')),
					m('option', { value: 'title' }, t('teach.sort_title')),
				],
			),
		]);
	}

	function replace(fresh: AgoraTopicPackage): void {
		topics = topics.map((pkg) => (pkg.topicPackageId === fresh.topicPackageId ? fresh : pkg));
	}

	function row(pkg: AgoraTopicPackage, approved: boolean): m.Children {
		const source = pkg.sourceScenarioId ? sources.get(pkg.sourceScenarioId) : undefined;
		const newer = source ? isNewerVersionAvailable(pkg, source) : false;

		return m(
			ScenarioRow,
			{ key: pkg.topicPackageId, topic: pkg, sourceVersions: sources, showEdited: true },
			[
				approved && newer && pkg.sourceScenarioId
					? m(
							m.route.Link,
							{
								href: `/teach/library/${pkg.sourceScenarioId}`,
								class: 'teach-link scenario-item__update',
							},
							t('scenlib.see_original'),
						)
					: null,
				approved
					? m(PublishControls, {
							pkg,
							tags: [...getLibraryStore().tags.values()],
							onChanged: replace,
						})
					: null,
			],
		);
	}

	function list(approved: boolean): m.Children {
		if (!loaded) return skeleton();
		if (failed) return sectionError(retry);
		const shown = filterScenarios(topics, query);
		if (scenarioCounts(topics).all === 0) {
			return m('.teach-empty', [
				m('strong.teach-empty__title', t('scenlib.mine_empty')),
				m(
					'button.btn.btn--primary',
					{ type: 'button', onclick: () => m.route.set('/teach/scenarios/new') },
					t('teacher.create_topic'),
				),
				approved
					? m(m.route.Link, { href: '/teach/library', class: 'teach-link' }, t('scenlib.nav'))
					: null,
			]);
		}

		return [
			controls(approved),
			shown.length === 0
				? m('p.teach-note', t('teach.scenarios_none_match'))
				: m(
						'ul.scenario-list',
						{ role: 'list' },
						shown.map((pkg) => row(pkg, approved)),
					),
		];
	}

	void load();

	return {
		view() {
			const { tier, loading, user } = getUserState();
			if (user && loadedFor !== null && loadedFor !== user.uid) {
				loadedFor = user.uid;
				retry();
			}
			if (loading) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}
			if (tier !== 2) {
				m.route.set('/teach');

				return null;
			}
			const approved = getLibraryStore().access === 'approved';

			return m('.shell', [
				m(TeacherNav, {
					title: t('scenlib.seg_mine'),
					onBack: () => m.route.set('/teach'),
				}),
				m('.shell__content.teach-page', [
					approved
						? m(Segment, {
								ariaLabel: t('scenlib.title'),
								selected: 'mine',
								options: [
									{ id: 'mine', label: t('scenlib.seg_mine'), href: '/teach/scenarios' },
									{ id: 'library', label: t('scenlib.seg_all'), href: '/teach/library' },
								],
							})
						: null,
					m(
						'button.btn.btn--primary.btn--full',
						{ type: 'button', onclick: () => m.route.set('/teach/scenarios/new') },
						t('teacher.create_topic'),
					),
					m('section.teach-section', { 'aria-label': t('scenlib.seg_mine') }, list(approved)),
				]),
			]);
		},
	};
}

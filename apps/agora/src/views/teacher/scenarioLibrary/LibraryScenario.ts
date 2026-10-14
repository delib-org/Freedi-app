import m from 'mithril';
import { AgoraScenarioCardText, AgoraTopicPackage, isNewScenario } from '@freedi/shared-types';
import { Icon } from '../../../components/Icon';
import { Stars } from '../../../components/scenarioLibrary/Stars';
import { getAvailableLanguages, getLang, t, tCount } from '../../../lib/i18n';
import {
	fetchLibraryScenario,
	translateScenarios,
	useScenario,
} from '../../../lib/scenarioLibrary/api';
import { getLibraryStore, reloadTags } from '../../../lib/scenarioLibrary/state';
import { ratingLabel, tagLabels } from '../../../lib/scenarioLibrary/view';
import { getUserState } from '../../../lib/user';
import { LibraryShell } from './LibraryShell';
import { ScenarioFeedback } from './ScenarioFeedback';

type Phase = 'loading' | 'ready' | 'missing' | 'failed';
type UseState = 'idle' | 'working' | 'done' | 'limit' | 'failed';

export interface LibraryScenarioAttrs {
	id: string;
}

function languageName(code: string): string {
	return getAvailableLanguages().find((entry) => entry.code === code)?.name ?? code;
}

/** The pieces of the lesson the page previews, in the viewer's language when it has them */
function previewOf(
	pkg: AgoraTopicPackage,
	card: AgoraScenarioCardText | null,
): { question: string; characters: string[]; scenes: string[] } {
	return {
		question: card?.challengeQuestion || pkg.challengeQuestion,
		characters:
			card && card.characters.length === pkg.characters.length
				? card.characters
				: pkg.characters.map((character) => `${character.name} — ${character.role}`),
		scenes:
			card && card.scenes.length === pkg.scenes.length
				? card.scenes
				: pkg.scenes.map((scene) => scene.title),
	};
}

/**
 * One scenario: its picture, what it is, what is in the lesson, and the one
 * thing a teacher came for — "use this", which makes a private copy of their
 * own, in their language, still credited to the author.
 */
export function LibraryScenario(): m.Component<LibraryScenarioAttrs> {
	let phase: Phase = 'loading';
	let pkg: AgoraTopicPackage | null = null;
	let card: AgoraScenarioCardText | null = null;
	let useState: UseState = 'idle';
	let copyId = '';
	let copyTranslated = false;
	let loadedId = '';

	async function load(id: string): Promise<void> {
		loadedId = id;
		phase = 'loading';
		pkg = null;
		card = null;
		useState = 'idle';
		m.redraw();
		try {
			if (getLibraryStore().tags.size === 0) await reloadTags();
			const found = await fetchLibraryScenario(id);
			if (!found || found.visibility !== 'public' || !found.library) {
				// Mine but private: still worth opening, as a preview of the listing
				if (!found || found.creatorId !== getUserState().user?.uid) {
					phase = 'missing';
					m.redraw();

					return;
				}
			}
			pkg = found;
			phase = 'ready';
			m.redraw();
			if (found && found.language !== getLang()) {
				const answer = await translateScenarios({ scenarioIds: [id], lang: getLang() });
				card = answer.translations[id] ?? null;
				m.redraw();
			}
		} catch (error) {
			console.error('[Library] Loading the scenario failed:', error);
			phase = 'failed';
			m.redraw();
		}
	}

	/** The numbers moved (a rating, a hide): read the scenario again, quietly */
	async function reread(id: string): Promise<void> {
		try {
			const fresh = await fetchLibraryScenario(id);
			if (fresh && id === loadedId) pkg = fresh;
		} catch (error) {
			console.error('[Library] Re-reading the scenario failed:', error);
		}
		m.redraw();
	}

	async function use(scenario: AgoraTopicPackage): Promise<void> {
		if (useState === 'working') return;
		useState = 'working';
		m.redraw();
		try {
			const answer = await useScenario({ scenarioId: scenario.topicPackageId, lang: getLang() });
			copyId = answer.copyId;
			copyTranslated = answer.translated;
			useState = 'done';
		} catch (error) {
			console.error('[Library] Taking a copy failed:', error);
			useState =
				(error as { code?: string }).code === 'functions/resource-exhausted' ? 'limit' : 'failed';
		}
		m.redraw();
	}

	function useBlock(scenario: AgoraTopicPackage, mine: boolean): m.Children {
		if (useState === 'done') {
			return m('.scn-done', { role: 'status' }, [
				m('h2.scn-done__title', t('scenlib.use_done')),
				m('p', t('scenlib.use_done_text')),
				copyTranslated ? m('p', t('scenlib.use_translated')) : null,
				m('.scn-done__actions', [
					m(
						m.route.Link,
						{ href: `/teach/start?topic=${copyId}`, class: 'btn btn--primary' },
						t('scenlib.use_start'),
					),
					m(
						m.route.Link,
						{ href: `/teach/topic/${copyId}`, class: 'btn btn--secondary' },
						t('scenlib.use_edit'),
					),
				]),
			]);
		}

		return m('.scn-use', [
			mine
				? m('p.scn-note', t('scenlib.own_notice'))
				: m(
						'button.btn.btn--primary.btn--lg.btn--full',
						{
							type: 'button',
							disabled: useState === 'working',
							onclick: () => void use(scenario),
						},
						useState === 'working' ? t('scenlib.using') : t('scenlib.use'),
					),
			useState === 'limit'
				? m('p.scn-field__error', { role: 'alert' }, t('scenlib.use_limit'))
				: useState === 'failed'
					? m('p.scn-field__error', { role: 'alert' }, t('scenlib.use_failed'))
					: null,
			useState === 'working' && scenario.language !== getLang()
				? m('p.scn-note', { role: 'status' }, t('scenlib.using_translating'))
				: null,
		]);
	}

	function body(scenario: AgoraTopicPackage): m.Children {
		const store = getLibraryStore();
		const lang = getLang();
		const library = scenario.library;
		const mine = scenario.creatorId === getUserState().user?.uid;
		const title = card?.title || scenario.title;
		const summary = card?.summary || library?.summary || '';
		const mean = ratingLabel(scenario);
		const stats = scenario.stats;
		const preview = previewOf(scenario, card);
		const subjects = tagLabels(library?.subjectIds ?? [], store.tags, lang);
		const lessonTypes = tagLabels(library?.lessonTypeIds ?? [], store.tags, lang);
		const published = library ? new Date(library.publishedAt).toLocaleDateString(lang) : '';
		const updated = new Date(scenario.lastUpdate).toLocaleDateString(lang);

		return m('article.scn-page', [
			m('.scn-page__main', [
				m('.scn-page__cover', [
					library?.coverUrl
						? m('img.scn-page__img', { src: library.coverUrl, alt: '' })
						: m('span.scn-page__fallback', m(Icon, { name: 'tunnel', size: 64 })),
				]),
				m('header.scn-page__head', [
					m('h1.scn-page__title', title),
					m(
						'p.scn-page__by',
						[
							t('scenlib.by', { name: library?.authorName || t('scenlib.author_anon') }),
							published ? ` · ${t('scenlib.published', { date: published })}` : '',
							scenario.lastUpdate > (library?.publishedAt ?? 0)
								? ` · ${t('scenlib.updated', { date: updated })}`
								: '',
						].join(''),
					),
					library && isNewScenario(library.publishedAt, Date.now())
						? m('span.scn-pill', t('scenlib.badge_new'))
						: null,
				]),
				m('p.scn-page__summary', summary),
				scenario.language !== lang
					? m(
							'p.scn-note',
							{ role: 'status' },
							card
								? t('scenlib.translated_note', { language: languageName(scenario.language) })
								: store.translating || phase === 'ready'
									? t('scenlib.translating')
									: '',
						)
					: null,

				m('section.scn-page__preview', [
					m('h2.scn-section-title', t('scenlib.lesson_contents')),
					m('.scn-quote', [
						m('span.scn-quote__label', t('scenlib.challenge')),
						m('p.scn-quote__text', preview.question),
					]),
					m('.scn-preview', [
						m('div', [
							m('h3', t('scenlib.characters')),
							m(
								'ul',
								preview.characters.map((line) => m('li', line)),
							),
						]),
						m('div', [
							m('h3', t('scenlib.scenes')),
							m(
								'ul',
								preview.scenes.map((line) => m('li', line)),
							),
						]),
					]),
				]),

				m(ScenarioFeedback, {
					scenario,
					mine,
					onChanged: () => void reread(scenario.topicPackageId),
				}),
			]),

			m('aside.scn-page__side', [
				m('.scn-panel', [
					mean
						? m('.scn-panel__rating', [
								m(Stars, { value: Number(mean), size: 22 }),
								m('strong', mean),
								m('span', tCount('scenlib.rated_by', stats?.ratingCount ?? 0)),
							])
						: m('p.scn-panel__none', t('scenlib.rating_none')),
					(stats?.copyCount ?? 0) > 0
						? m('p.scn-panel__stat', tCount('scenlib.copied_n', stats?.copyCount ?? 0))
						: null,
					m('p.scn-panel__stat', languageName(scenario.language)),
					m('.scn-tags', [
						...subjects.map((label) => m('span.scn-tag', label)),
						...lessonTypes.map((label) => m('span.scn-tag.scn-tag--kind', label)),
					]),
					useBlock(scenario, mine),
				]),
			]),
		]);
	}

	return {
		view({ attrs }) {
			return m(
				LibraryShell,
				{
					title: t('scenlib.title'),
					onBack: () => m.route.set('/teach/library'),
					// Reading a scenario needs the approval marker the shell just refreshed
					onApproved: () => {
						if (loadedId !== attrs.id) void load(attrs.id);
					},
				},
				phase === 'loading'
					? m('.spinner', { role: 'status' })
					: phase === 'missing'
						? m('.card.stack.scn-gate', [
								m('p', { role: 'alert' }, t('scenlib.not_found')),
								m(
									m.route.Link,
									{ href: '/teach/library', class: 'btn btn--secondary' },
									t('scenlib.back'),
								),
							])
						: phase === 'failed' || !pkg
							? m('.card.stack.scn-gate', [
									m('p', { role: 'alert' }, t('scenlib.error')),
									m(
										'button.btn.btn--primary',
										{ type: 'button', onclick: () => void load(attrs.id) },
										t('scenlib.retry'),
									),
								])
							: body(pkg),
			);
		},
	};
}

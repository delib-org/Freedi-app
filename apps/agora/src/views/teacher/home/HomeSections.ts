import m from 'mithril';
import type { AgoraClassAggregate, AgoraTopicPackage } from '@freedi/shared-types';
import { advancementSummary } from '@freedi/shared-types';
import { Icon } from '../../../components/Icon';
import { ScenarioRow, ownQuestionRow } from '../../../components/ScenarioRow';
import { SectionHead } from '../../../components/SectionHead';
import { LibraryEntry } from '../../../components/scenarioLibrary/LibraryEntry';
import { t } from '../../../lib/i18n';
import { classLabel, type TeacherDashboard } from '../../../lib/teacher';
import { classAverage, HOME_SCENARIO_LIMIT, homeScenarios } from '../../../lib/teacherHome';

type DashboardClass = TeacherDashboard['classes'][number];

/**
 * The home's sections as plain view builders: they hold no state and load
 * nothing, the screen hands in what it has. Four things live on the home, in
 * this order — the live lesson, the first-run strip, my scenarios, my classes.
 */

/** Three rows of waiting, so a slow section never leaves a hole */
export function skeleton(): m.Children {
	return m(
		'ul.teach-skeleton',
		{ 'aria-hidden': 'true' },
		[0, 1, 2].map((n) => m('li.teach-skeleton__row', { key: n })),
	);
}

/** A section that could not load says so itself and offers the retry — the other section is untouched */
export function sectionError(onRetry: () => void): m.Children {
	return m('p.teach-error', { role: 'alert' }, [
		m('span', t('teach.section_error')),
		m('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: onRetry }, t('teach.retry')),
	]);
}

/** A lesson running right now — the first thing on the page, and one tap back in */
export function liveBanner(sessionId: string, meta: string): m.Children {
	return m('section.card.dashboard__live.teach-live', { key: sessionId, role: 'status' }, [
		m('strong.dashboard__live-title', [
			m('span.teach-live__dot', { 'aria-hidden': 'true' }),
			t('dashboard.live_title'),
		]),
		m('span.dashboard__live-meta', meta),
		m(
			'button.btn.btn--lg',
			{ type: 'button', onclick: () => m.route.set(`/teach/session/${sessionId}`) },
			t('dashboard.back_to_lesson'),
		),
	]);
}

/** The three lines that are the whole of running a lesson */
export function firstRunStrip(onDismiss: () => void): m.Children {
	return m('section.card.dashboard__firstrun', [
		m('strong.dashboard__firstrun-title', t('dashboard.first_run_title')),
		m(
			'ol.dashboard__steps',
			[1, 2, 3].map((n) =>
				m('li.dashboard__step', { key: n }, [
					m('span.dashboard__step-n', String(n)),
					m('span', t(`dashboard.first_run_${n}`)),
				]),
			),
		),
		m(
			'button.dashboard__firstrun-dismiss',
			{ type: 'button', 'aria-label': t('dashboard.first_run_dismiss'), onclick: onDismiss },
			'✕',
		),
	]);
}

export interface ScenariosSectionAttrs {
	loaded: boolean;
	failed: boolean;
	topics: readonly AgoraTopicPackage[];
	reusableCount: number;
	sourceVersions: ReadonlyMap<string, { lastUpdate: number; title: string }>;
	/** Only the starter scenario, or none: say how to make one's own */
	onlyStarter: boolean;
	onRetry: () => void;
}

/**
 * "My scenarios": the job a teacher comes for first. "+ New scenario" is the
 * only create entry; the library, for a teacher approved for it, sits right
 * under it, and for one who is not it is a quiet locked line at the end.
 */
export function scenariosSection(attrs: ScenariosSectionAttrs): m.Children {
	const shown = homeScenarios(attrs.topics);

	return m('section.teach-section', { 'aria-labelledby': 'home-scenarios' }, [
		m(SectionHead, {
			id: 'home-scenarios',
			title: t('dashboard.scenarios'),
			action: m(
				'button.btn.btn--secondary.btn--sm',
				{ type: 'button', onclick: () => m.route.set('/teach/scenarios/new') },
				t('teacher.create_topic'),
			),
		}),
		m(LibraryEntry, { mode: 'open' }),
		!attrs.loaded
			? skeleton()
			: attrs.failed && attrs.topics.length === 0
				? sectionError(attrs.onRetry)
				: [
						m('ul.scenario-list', { role: 'list' }, [
							...shown.map((topic) =>
								m(ScenarioRow, {
									key: topic.topicPackageId,
									topic,
									sourceVersions: attrs.sourceVersions,
								}),
							),
							ownQuestionRow(),
						]),
						attrs.onlyStarter ? m('p.teach-note', t('teach.new_scenario_hint')) : null,
						attrs.reusableCount > HOME_SCENARIO_LIMIT
							? m(m.route.Link, { href: '/teach/scenarios', class: 'teach-link' }, [
									t('teach.all_scenarios', { n: attrs.reusableCount }),
									m(Icon, { name: 'arrow', size: 16 }),
								])
							: null,
					],
		m(LibraryEntry, { mode: 'locked' }),
	]);
}

/** One class: its name, its size, and ONE number — the class average */
export function classCard(
	agoraClass: DashboardClass,
	aggregate: AgoraClassAggregate | undefined,
): m.Children {
	const lessons = aggregate ? advancementSummary(aggregate).gamesPlayed : 0;
	const average = classAverage(aggregate);

	return m(
		m.route.Link,
		{ key: agoraClass.classId, href: `/teach/class/${agoraClass.classId}`, class: 'class-card' },
		[
			m('span.class-card__main', [
				m('span.class-card__name', classLabel(agoraClass)),
				m(
					'span.class-card__meta',
					[
						t('dashboard.members', { count: String(agoraClass.memberCount) }),
						t('teach.class_lessons', { n: lessons }),
					].join(' · '),
				),
			]),
			lessons === 0
				? m('span.class-card__none', t('dashboard.no_games_yet'))
				: m('span.class-card__score', [
						m('span.class-card__number', average === null ? '—' : String(average)),
						m('span.class-card__label', t('teach.kpi_avg')),
					]),
		],
	);
}

export interface ClassesSectionAttrs {
	loaded: boolean;
	failed: boolean;
	classes: readonly DashboardClass[];
	hasSchool: boolean;
	aggregates: ReadonlyMap<string, AgoraClassAggregate>;
	onAddClass: () => void;
	onRetry: () => void;
	/** The new-class form, when open */
	form: m.Children;
}

/** "My classes": one card each, and "+ New class" when the teacher has a school */
export function classesSection(attrs: ClassesSectionAttrs): m.Children {
	const empty = attrs.classes.length === 0;

	return m('section.teach-section', { 'aria-labelledby': 'home-classes' }, [
		m(SectionHead, {
			id: 'home-classes',
			title: t('dashboard.my_classes'),
			action:
				!empty && attrs.hasSchool
					? m(
							'button.btn.btn--ghost.btn--sm',
							{ type: 'button', onclick: attrs.onAddClass },
							`＋ ${t('dashboard.add_class')}`,
						)
					: null,
		}),
		!attrs.loaded
			? skeleton()
			: attrs.failed && empty
				? sectionError(attrs.onRetry)
				: empty
					? m('.teach-empty', [
							m('strong.teach-empty__title', t('teach.no_classes')),
							m('p', t(attrs.hasSchool ? 'teach.no_classes_hint' : 'dashboard.no_school_text')),
							attrs.hasSchool
								? m(
										'button.btn.btn--primary',
										{ type: 'button', onclick: attrs.onAddClass },
										`＋ ${t('dashboard.add_class')}`,
									)
								: null,
						])
					: attrs.classes.map((agoraClass) =>
							classCard(agoraClass, attrs.aggregates.get(agoraClass.classId)),
						),
		attrs.form,
	]);
}

import m from 'mithril';
import '@/styles/teacher.scss';
import type { Statement } from '@freedi/shared-types';
import { getAvailableLanguages, t } from '@/lib/i18n';
import { setFollowLessonLanguage } from '@/lib/store';
import { getPlanMain, isGameMode } from './planSource';
import { TeacherBackBar, type TeacherBackBarAttrs } from './TeacherBackBar';
import { lessonNameOf } from '@/lib/lessonLinks';
import { ClassForm, closeClassForm, isClassFormOpen, openClassForm } from './ClassForm';
import { planPathOf } from '@/lib/lessonLinks';
import { NotYourLesson } from './NotYourLesson';
import { WizColFooter } from '@/components/WizColFooter';
import {
	CHALLENGE_NEW_KEY,
	addNewCard,
	commitNewCard,
	commitNewChallenge,
	commitQuestionHint,
	commitQuestionText,
	deleteQuestion,
	fieldValue,
	flushAll,
	getAnnouncement,
	getCreatingChallenge,
	getFieldError,
	getLoad,
	getGamePlanTitle,
	getMainId,
	getNewCards,
	getPlan,
	getTitle,
	getVisibleNewCards,
	hasAnyError,
	isFlushing,
	isSavedFlag,
	moveQuestion,
	onInput,
	openGame,
	openPlan,
	removeNewCard,
	reorder,
	setNewCardText,
	teardownPlan,
	type NewCard,
} from './planController';
import { MAX_HINT_LENGTH, MAX_QUESTION_LENGTH, hintOf } from './planHelpers';
import { LANGUAGE_KEY, commitLanguage, savedLessonLanguage } from './planDetails';
import { renderSides } from './PlanSides';
import { PlanIntro } from './PlanIntro';
import { PlanChallengeWarning, focusChallengeFromRoute } from './PlanChallengeWarning';
import { enterAddsNext, field, fieldError } from './planFields';
import {
	OWN_QUESTIONS_KEY,
	PROPOSALS_TURNS_KEY,
	SPEAK_SECONDS_KEY,
	ownQuestionsControl,
	proposalsTurnsControl,
	speakTimeControl,
} from './planLessonSettings';

function focusHandleAfterMove(statementId: string): void {
	m.redraw.sync();
	window.requestAnimationFrame(() => {
		document.querySelector<HTMLElement>(`[data-handle-id="${statementId}"]`)?.focus();
	});
}

function renderHandle(q: Statement, ids: string[], position: number): m.Vnode {
	const drag = reorder.cardAttrs(q.statementId, ids);
	const name = q.statement;

	return m(
		'span.plan-card__handle',
		{
			role: 'button',
			tabindex: '0',
			'data-handle-id': q.statementId,
			title: t('plan.reorder.title'),
			'aria-label': t('plan.reorder.aria', { name, n: position, total: ids.length }),
			draggable: drag.draggable,
			ondragstart: (e: DragEvent) => {
				drag.ondragstart?.(e);
				const card = (e.target as HTMLElement).closest('.plan-card');
				if (card && e.dataTransfer) e.dataTransfer.setDragImage(card, 24, 24);
			},
			ondragend: drag.ondragend,
			onkeydown: (e: KeyboardEvent) => {
				if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
				e.preventDefault();
				moveQuestion(q.statementId, e.key === 'ArrowUp' ? -1 : 1, (n, total) =>
					t('plan.reorder.moved', { n, total }),
				);
				focusHandleAfterMove(q.statementId);
			},
		},
		m('span.plan-card__handle-dots', { 'aria-hidden': 'true' }, '⋮⋮'),
	);
}

function renderGuidingCard(q: Statement, index: number, ids: string[]): m.Vnode {
	const id = q.statementId;
	const textKey = `${id}:text`;
	const hintKey = `${id}:hint`;
	const drag = reorder.cardAttrs(id, ids);
	const classes = [
		'plan-card',
		reorder.isDragging(id) ? 'plan-card--dragging' : '',
		reorder.isDropTarget(id) ? 'plan-card--drop-target' : '',
	]
		.filter(Boolean)
		.join(' ');

	return m(
		'li',
		{
			key: id,
			class: classes,
			ondragover: drag.ondragover,
			ondragleave: drag.ondragleave,
			ondrop: drag.ondrop,
		},
		[
			renderHandle(q, ids, index + 1),
			m('.plan-card__main', [
				field({
					key: textKey,
					label: t('plan.question.label', { n: index + 1 }),
					value: fieldValue(textKey, q.statement),
					placeholder: t('plan.question.placeholder'),
					max: MAX_QUESTION_LENGTH,
					className: 'plan-card__text',
					onValue: (v) => onInput(textKey, v, MAX_QUESTION_LENGTH),
					onCommit: () => commitQuestionText(id, q.statement),
					onEnter: enterAddsNext(() => commitQuestionText(id, q.statement)),
				}),
				field({
					key: hintKey,
					label: t('plan.hint.label', { n: index + 1 }),
					value: fieldValue(hintKey, hintOf(q)),
					placeholder: t('plan.hint.placeholder'),
					max: MAX_HINT_LENGTH,
					className: 'plan-card__hint',
					onValue: (v) => onInput(hintKey, v, MAX_HINT_LENGTH),
					onCommit: () => commitQuestionHint(id, hintOf(q)),
				}),
				fieldError(textKey),
				fieldError(hintKey),
				fieldError(`${id}:del`),
			]),
			m(
				'button.btn.btn--tertiary.btn--small.plan-card__delete',
				{
					type: 'button',
					'aria-label': t('plan.delete.aria', { name: q.statement }),
					onclick: () => deleteQuestion(id),
				},
				t('plan.delete'),
			),
		],
	);
}

function renderNewCard(card: NewCard, index: number): m.Vnode {
	return m('li.plan-card.plan-card--new', { key: card.key }, [
		m('span.plan-card__handle.plan-card__handle--idle', { 'aria-hidden': 'true' }, '⋮⋮'),
		m('.plan-card__main', [
			field({
				key: card.key,
				label: t('plan.question.label', { n: index + 1 }),
				value: card.text,
				placeholder: t('plan.question.placeholder'),
				max: MAX_QUESTION_LENGTH,
				className: 'plan-card__text',
				disabled: card.creating,
				onValue: (v) => setNewCardText(card, v, MAX_QUESTION_LENGTH),
				onCommit: () => commitNewCard(card),
				onEnter: enterAddsNext(() => commitNewCard(card)),
			}),
			card.failed
				? m('.plan-card__error', { role: 'alert' }, [
						m('span', t('plan.error.save')),
						m(
							'button.btn.btn--tertiary.btn--small',
							{ type: 'button', onclick: () => commitNewCard(card) },
							t('plan.error.retry'),
						),
					])
				: null,
		]),
		m(
			'button.btn.btn--tertiary.btn--small.plan-card__delete',
			{ type: 'button', disabled: card.creating, onclick: () => removeNewCard(card) },
			t('plan.delete'),
		),
	]);
}

function renderChallenge(challenge: Statement | undefined): m.Vnode {
	const label = t('plan.challenge.title');
	const creating = getCreatingChallenge();
	let input: m.Vnode;
	let errorKey: string;
	if (challenge) {
		const key = `${challenge.statementId}:text`;
		errorKey = key;
		input = field({
			key,
			label,
			value: fieldValue(key, challenge.statement),
			placeholder: t('plan.challenge.placeholder'),
			max: MAX_QUESTION_LENGTH,
			className: 'plan-card__text plan-card__text--challenge',
			onValue: (v) => onInput(key, v, MAX_QUESTION_LENGTH),
			onCommit: () => commitQuestionText(challenge.statementId, challenge.statement),
		});
	} else {
		errorKey = CHALLENGE_NEW_KEY;
		input = field({
			key: CHALLENGE_NEW_KEY,
			label,
			value: fieldValue(CHALLENGE_NEW_KEY, ''),
			placeholder: t('plan.challenge.placeholder'),
			max: MAX_QUESTION_LENGTH,
			className: 'plan-card__text plan-card__text--challenge',
			disabled: creating !== null,
			onValue: (v) => onInput(CHALLENGE_NEW_KEY, v, MAX_QUESTION_LENGTH),
			onCommit: commitNewChallenge,
		});
	}

	return m(
		'section.plan__challenge',
		{
			class: challenge ? '' : 'plan__challenge--missing',
			'aria-labelledby': 'plan-challenge-title',
			oncreate: focusChallengeFromRoute,
		},
		[
			m('h2.plan__section-title', { id: 'plan-challenge-title' }, label),
			m('p.plan__help', t('plan.challenge.help')),
			m('.plan-card.plan-card--challenge', [m('.plan-card__main', [input, fieldError(errorKey)])]),
		],
	);
}

function languageField(): m.Vnode {
	const value = fieldValue(LANGUAGE_KEY, savedLessonLanguage());

	return m('.plan-details__language', [
		m('label.plan-details__label', { for: 'lesson-language' }, t('plan.details.language')),
		m(
			'select.plan-card__text.plan-details__select',
			{
				id: 'lesson-language',
				value,
				onchange: (e: Event) => commitLanguage((e.target as HTMLSelectElement).value),
			},
			[
				m('option', { value: '' }, t('plan.details.language.device')),
				getAvailableLanguages().map((lang) =>
					m('option', { key: lang.code, value: lang.code, dir: 'auto' }, lang.name),
				),
			],
		),
		fieldError(LANGUAGE_KEY),
	]);
}

function renderDetails(): m.Vnode {
	return m('section.plan__details', { 'aria-labelledby': 'plan-details-title' }, [
		m('h2.plan__section-title', { id: 'plan-details-title' }, t('plan.details.title')),
		m('.plan-card.plan-details', [
			m('.plan-card__main', [
				// First: it changes every student screen and the projector.
				languageField(),
				renderSides(),
				speakTimeControl(),
				fieldError(SPEAK_SECONDS_KEY),
				proposalsTurnsControl(),
				fieldError(PROPOSALS_TURNS_KEY),
			]),
		]),
		renderLessonFrom(),
	]);
}

/**
 * Under a lesson's plan: where it came from ("Game: ... · Class: ...") and that edits stay
 * in this lesson (docs/ia/join-class-lesson-plan.md 3). Nothing under a game.
 */
function renderLessonFrom(): m.Children {
	if (isGameMode()) return null;
	const main = getPlanMain();
	const link = main?.statementSettings?.classLesson;
	// the game's name comes first in every language: split the line around both names
	const [before, rest = ''] = t('plan.lesson_from', { game: '\u0001', class: '\u0002' }).split(
		'\u0001',
	);
	const [mid = '', after = ''] = rest.split('\u0002');
	const classLabel = link ? link.className || t('teacher.lesson.class_none') : '';

	return [
		link
			? m('p.plan__help.plan__copied-from', [
					before,
					m('bdi', { dir: 'auto' }, main?.statement ?? ''),
					mid,
					m('bdi', { dir: 'auto' }, classLabel),
					after,
				])
			: null,
		m('p.plan__help.plan__lesson-only', t('plan.lesson_only')),
	];
}

function renderTables(guiding: Statement[]): m.Vnode {
	const ids = guiding.map((g) => g.statementId);
	const extra = getVisibleNewCards(guiding);
	const total = guiding.length + extra.length;

	return m('section.plan__tables', { 'aria-labelledby': 'plan-tables-title' }, [
		m('h2.plan__section-title', { id: 'plan-tables-title' }, t('plan.tables.title')),
		m('p.plan__help', t('plan.tables.help')),
		total === 0 ? m('p.plan__empty', t('plan.empty')) : null,
		m('ul.plan__list', reorder.listAttrs(), [
			...guiding.map((q, i) => renderGuidingCard(q, i, ids)),
			...extra.map((c, i) => renderNewCard(c, guiding.length + i)),
		]),
		m(
			'button.plan__add',
			{ type: 'button', onclick: addNewCard },
			m('span.plan__add-label', t('plan.add')),
		),
		ownQuestionsControl(total),
		fieldError(OWN_QUESTIONS_KEY),
		getFieldError('order')
			? m('.plan-card__error', { role: 'alert' }, [
					m('span', t('plan.error.save')),
					m(
						'button.btn.btn--tertiary.btn--small',
						{ type: 'button', onclick: getFieldError('order') },
						t('plan.error.retry'),
					),
				])
			: null,
	]);
}

function renderBar(mainId: string): m.Vnode {
	const flushing = isFlushing();
	const saved = isSavedFlag() && !flushing;
	const label = flushing ? t('plan.saving') : saved ? t('plan.saved') : t('plan.save');
	const busy = getNewCards().some((c) => c.creating);

	return m('.plan__bar', { role: 'group', 'aria-label': t('plan.bar.aria') }, [
		m('.plan__bar-inner', [
			m(
				'button.btn.plan__save',
				{
					type: 'button',
					class: saved ? 'btn--agree plan__save--saved' : 'btn--primary',
					disabled: flushing,
					'aria-busy': flushing || busy ? 'true' : undefined,
					onclick: () => void flushAll(),
				},
				[saved ? m('span.plan__save-mark', { 'aria-hidden': 'true' }, '✓ ') : null, label],
			),
			isGameMode()
				? m(
						'button.btn.btn--secondary.plan__console',
						{
							type: 'button',
							'data-action': 'new-lesson',
							onclick: async () => {
								await flushAll();
								openClassForm(mainId, getTitle());
							},
						},
						t('teacher.lesson.new'),
					)
				: m(
						'button.btn.btn--secondary.plan__console',
						{
							type: 'button',
							onclick: async () => {
								await flushAll();
								m.route.set(`/t/${mainId}`);
							},
						},
						t('plan.to_console'),
					),
			hasAnyError() ? m('span.plan__bar-error', { role: 'alert' }, t('plan.error.save')) : null,
		]),
	]);
}

function renderSkeleton(): m.Vnode {
	return m('.plan__skeleton', { 'aria-busy': 'true', 'aria-label': t('plan.loading') }, [
		m('.plan__skeleton-block.plan__skeleton-block--tall'),
		m('.plan__skeleton-block'),
		m('.plan__skeleton-block'),
		m('.plan__skeleton-block'),
	]);
}

function renderBody(mainId: string, game: { planId: string; gameId: string } | null): m.Children {
	const state = getLoad();
	if (state === 'loading') return renderSkeleton();
	if (state === 'error') {
		return m('.plan__load-error', { role: 'alert' }, [
			m('p', t('plan.error.load')),
			m(
				'button.btn.btn--primary',
				{
					type: 'button',
					onclick: () => void (game ? openGame(game.planId, game.gameId) : openPlan(mainId)),
				},
				t('plan.error.retry'),
			),
		]);
	}
	const { challenge, guiding } = getPlan();

	// A draft may be saved without it, but the lesson cannot start (the console refuses).
	const missing = !challenge && getCreatingChallenge() === null;

	return [
		missing ? m(PlanChallengeWarning) : null,
		renderDetails(),
		renderChallenge(challenge),
		m(PlanIntro),
		renderTables(guiding),
	];
}

/** The route names a game (`/t/plans/:planId/games/:gameId`) rather than a lesson. */
function routeGame(): { planId: string; gameId: string } | null {
	const planId = m.route.param('planId');
	const gameId = m.route.param('gameId');

	return planId && gameId ? { planId, gameId } : null;
}

/**
 * One level up: a game goes to its plan (named after the plan); a lesson's own questions
 * go to the lesson's console (named after the lesson, as the teacher called it).
 */
function backTarget(
	game: { planId: string; gameId: string } | null,
	mid: string,
	planTitle: string,
): TeacherBackBarAttrs {
	if (game) return { href: planPathOf(game.planId), label: planTitle || t('classPlan.back') };
	const main = getPlanMain();

	return { href: `/t/${mid}`, label: main ? lessonNameOf(main) : t('plan.back') };
}

export const PlanScreen: m.Component = {
	oninit() {
		setFollowLessonLanguage(false);
		closeClassForm();
		const game = routeGame();
		if (game) {
			void openGame(game.planId, game.gameId);

			return;
		}
		const mid = m.route.param('mid');
		if (!mid) {
			m.route.set('/t');

			return;
		}
		void openPlan(mid);
	},

	onremove() {
		teardownPlan();
		closeClassForm();
	},

	view() {
		const game = routeGame();
		const mid = game ? game.gameId : (m.route.param('mid') ?? getMainId());
		if (getLoad() === 'denied') return m(NotYourLesson);
		const ready = getLoad() === 'ready';
		const planTitle = getGamePlanTitle();

		return m('.plan', [
			m(TeacherBackBar, backTarget(game, mid, planTitle)),
			m('header.plan__header', [
				m('h1.plan__title', t('plan.title')),
				ready && getTitle() ? m('p.plan__lesson', getTitle()) : null,
			]),
			m('main.plan__body', [
				game && ready && isClassFormOpen(game.gameId)
					? m(ClassForm, { planId: game.planId, gameId: game.gameId })
					: null,
				renderBody(mid, game),
			]),
			ready ? renderBar(mid) : null,
			m('.visually-hidden', { role: 'status', 'aria-live': 'polite' }, getAnnouncement()),
			m(WizColFooter),
		]);
	},
};

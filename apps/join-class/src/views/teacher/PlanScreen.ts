import m from 'mithril';
import '@/styles/teacher.scss';
import type { Statement } from '@freedi/shared-types';
import { getAvailableLanguages, t } from '@/lib/i18n';
import { setFollowLessonLanguage } from '@/lib/store';
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
	openPlan,
	removeNewCard,
	reorder,
	setNewCardText,
	takeFocus,
	teardownPlan,
	type NewCard,
} from './planController';
import { MAX_HINT_LENGTH, MAX_QUESTION_LENGTH, hintOf } from './planHelpers';
import { SIDE_NAME_MAX_LENGTH } from '@/lib/classroom/classSettings';
import {
	LANGUAGE_KEY,
	MAX_VIDEO_URL_LENGTH,
	SIDE_A_KEY,
	SIDE_B_KEY,
	VIDEO_KEY,
	commitLanguage,
	commitSideName,
	commitVideoUrl,
	defaultSideName,
	isInvalid,
	onDetailInput,
	savedLessonLanguage,
	savedSideName,
	savedVideoUrl,
} from './planDetails';

interface FieldAttrs {
	key: string;
	label: string;
	value: string;
	placeholder: string;
	max: number;
	className: string;
	disabled?: boolean;
	onValue: (value: string) => void;
	onCommit: () => void;
	onEnter?: () => void;
}

/** One always-visible text field that saves on blur. Labelled for screen
 *  readers; the placeholder is a hint, never the label. */
function field(a: FieldAttrs): m.Vnode {
	return m('input', {
		type: 'text',
		class: a.className,
		value: a.value,
		maxlength: a.max,
		placeholder: a.placeholder,
		disabled: a.disabled,
		'aria-label': a.label,
		'aria-invalid': getFieldError(a.key) ? 'true' : undefined,
		oncreate: (vn: m.VnodeDOM) => {
			if (takeFocus(a.key)) (vn.dom as HTMLInputElement).focus();
		},
		onupdate: (vn: m.VnodeDOM) => {
			if (takeFocus(a.key)) (vn.dom as HTMLInputElement).focus();
		},
		oninput: (e: Event) => a.onValue((e.target as HTMLInputElement).value),
		onblur: a.onCommit,
		onkeydown: (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.isComposing) {
				e.preventDefault();
				if (a.onEnter) a.onEnter();
				else (e.target as HTMLInputElement).blur();
			}
		},
	});
}

function fieldError(key: string): m.Vnode | null {
	const retry = getFieldError(key);
	if (!retry) return null;

	return m('.plan-card__error', { role: 'alert' }, [
		m('span', t('plan.error.save')),
		m(
			'button.btn.btn--tertiary.btn--small',
			{ type: 'button', onclick: retry },
			t('plan.error.retry'),
		),
	]);
}

function enterAddsNext(blurTarget: () => void): () => void {
	return () => {
		blurTarget();
		addNewCard();
	};
}

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

	return m('section.plan__challenge', { 'aria-labelledby': 'plan-challenge-title' }, [
		m('h2.plan__section-title', { id: 'plan-challenge-title' }, label),
		m('p.plan__help', t('plan.challenge.help')),
		m('.plan-card.plan-card--challenge', [m('.plan-card__main', [input, fieldError(errorKey)])]),
	]);
}

function sideNameField(key: string, labelKey: string): m.Vnode {
	return field({
		key,
		label: t(labelKey),
		value: fieldValue(key, savedSideName(key)),
		placeholder: defaultSideName(key),
		max: SIDE_NAME_MAX_LENGTH,
		className: 'plan-card__text plan-details__name',
		onValue: (v) => onDetailInput(key, v, SIDE_NAME_MAX_LENGTH),
		onCommit: () => commitSideName(key),
	});
}

/** "Lesson details": the opening video link and the two character names. */
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
				field({
					key: VIDEO_KEY,
					label: t('plan.details.video'),
					value: fieldValue(VIDEO_KEY, savedVideoUrl()),
					placeholder: t('plan.details.video.placeholder'),
					max: MAX_VIDEO_URL_LENGTH,
					className: 'plan-card__text plan-details__video',
					onValue: (v) => onDetailInput(VIDEO_KEY, v, MAX_VIDEO_URL_LENGTH),
					onCommit: commitVideoUrl,
				}),
				isInvalid(VIDEO_KEY)
					? m('.plan-card__error', { role: 'alert' }, t('plan.details.video.invalid'))
					: null,
				fieldError(VIDEO_KEY),
				sideNameField(SIDE_A_KEY, 'plan.details.side_a'),
				sideNameField(SIDE_B_KEY, 'plan.details.side_b'),
				fieldError(SIDE_A_KEY),
				fieldError(SIDE_B_KEY),
			]),
		]),
	]);
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
			m(
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

function renderBody(mainId: string): m.Children {
	const state = getLoad();
	if (state === 'loading') return renderSkeleton();
	if (state === 'error') {
		return m('.plan__load-error', { role: 'alert' }, [
			m('p', t('plan.error.load')),
			m(
				'button.btn.btn--primary',
				{ type: 'button', onclick: () => void openPlan(mainId) },
				t('plan.error.retry'),
			),
		]);
	}
	const { challenge, guiding } = getPlan();

	return [renderDetails(), renderChallenge(challenge), renderTables(guiding)];
}

export const PlanScreen: m.Component = {
	oninit() {
		setFollowLessonLanguage(false);
		const mid = m.route.param('mid');
		if (!mid) {
			m.route.set('/t');

			return;
		}
		void openPlan(mid);
	},

	onremove() {
		teardownPlan();
	},

	view() {
		const mid = m.route.param('mid') ?? getMainId();
		if (getLoad() === 'denied') return m(NotYourLesson);
		const ready = getLoad() === 'ready';

		return m('.plan', [
			m('header.plan__header', [
				m(m.route.Link, { class: 'plan__back', href: `/t/${mid}` }, [
					m('span.plan__back-chevron', { 'aria-hidden': 'true' }, '‹'),
					m('span', t('plan.back')),
				]),
				m('h1.plan__title', t('plan.title')),
				ready && getTitle() ? m('p.plan__lesson', getTitle()) : null,
			]),
			m('main.plan__body', renderBody(mid)),
			ready ? renderBar(mid) : null,
			m('.visually-hidden', { role: 'status', 'aria-live': 'polite' }, getAnnouncement()),
			m(WizColFooter),
		]);
	},
};

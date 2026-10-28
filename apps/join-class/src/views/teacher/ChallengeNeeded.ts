import m from 'mithril';
import '@/styles/teacher-challenge.scss';
import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { MAX_QUESTION_LENGTH } from './planHelpers';
import { addProposalsQuestion, setProposalsQuestion } from './challengeActions';
import { isBusy } from './consoleState';

/**
 * The console's "no Proposals question" prompt. At Waiting it says the class
 * cannot start yet; later it says students on the Proposals step see no
 * question. Either way the teacher can pick one of the lesson's questions or
 * write a new one right here, or open the plan.
 */

export interface ChallengeNeededAttrs {
	mainId: string;
	/** The lesson has started (it is past Waiting). */
	started: boolean;
	/** The lesson's questions that could become the Proposals question. */
	candidates: readonly Statement[];
}

interface PromptState {
	pickedId: string;
	draft: string;
}

function pickRow(attrs: ChallengeNeededAttrs, state: PromptState): m.Children {
	if (attrs.candidates.length === 0) return null;
	const picked = attrs.candidates.some((q) => q.statementId === state.pickedId)
		? state.pickedId
		: attrs.candidates[0].statementId;
	const busy = isBusy('challenge:set');

	return m('.challenge-warning__row', [
		m(
			'select.challenge-warning__select',
			{
				value: picked,
				'aria-label': t('console.challenge.pick_label'),
				'data-testid': 'challenge-pick',
				onchange: (e: Event) => {
					state.pickedId = (e.target as HTMLSelectElement).value;
				},
			},
			attrs.candidates.map((q) =>
				m('option', { key: q.statementId, value: q.statementId, dir: 'auto' }, q.statement),
			),
		),
		m(
			'button.btn.btn--primary.btn--small',
			{
				type: 'button',
				disabled: busy,
				'aria-busy': busy ? 'true' : undefined,
				'data-testid': 'challenge-use',
				onclick: () => void setProposalsQuestion(attrs.mainId, picked),
			},
			t('console.challenge.use'),
		),
	]);
}

function writeRow(attrs: ChallengeNeededAttrs, state: PromptState): m.Children {
	const busy = isBusy('challenge:add');
	const submit = (): void => {
		const text = state.draft;
		void addProposalsQuestion(attrs.mainId, text).then((ok) => {
			if (ok) state.draft = '';
		});
	};

	return m('.challenge-warning__row', [
		m('input.challenge-warning__input', {
			type: 'text',
			value: state.draft,
			maxlength: MAX_QUESTION_LENGTH,
			disabled: busy,
			dir: 'auto',
			placeholder: t('plan.challenge.placeholder'),
			'aria-label': t('console.challenge.write_label'),
			'data-testid': 'challenge-write',
			oninput: (e: Event) => {
				state.draft = (e.target as HTMLInputElement).value;
			},
			onkeydown: (e: KeyboardEvent) => {
				if (e.key === 'Enter' && !e.isComposing) {
					e.preventDefault();
					submit();
				}
			},
		}),
		m(
			'button.btn.btn--primary.btn--small',
			{
				type: 'button',
				disabled: busy || state.draft.trim() === '',
				'aria-busy': busy ? 'true' : undefined,
				'data-testid': 'challenge-add',
				onclick: submit,
			},
			t('console.challenge.add'),
		),
	]);
}

export const ChallengeNeeded: m.Component<ChallengeNeededAttrs> = {
	oninit(vnode) {
		const state = vnode.state as unknown as PromptState;
		state.pickedId = '';
		state.draft = '';
	},

	view(vnode) {
		const { attrs } = vnode;
		const state = vnode.state as unknown as PromptState;

		return m(
			'section.challenge-warning.challenge-warning--console',
			{
				role: 'status',
				'aria-labelledby': 'challenge-needed-title',
				'data-testid': 'challenge-needed',
			},
			[
				m('h2.challenge-warning__title', { id: 'challenge-needed-title' }, [
					m('span.challenge-warning__mark', { 'aria-hidden': 'true' }, '!'),
					m('span', t('console.challenge.missing_title')),
				]),
				m(
					'p.challenge-warning__text',
					t(attrs.started ? 'console.challenge.missing_live' : 'console.challenge.missing_start'),
				),
				pickRow(attrs, state),
				m('p.challenge-warning__or', t('console.challenge.or_write')),
				writeRow(attrs, state),
				m(
					m.route.Link,
					{
						class: 'challenge-warning__plan-link',
						href: `/t/${attrs.mainId}/plan?focus=challenge`,
					},
					t('console.challenge.go_plan'),
				),
			],
		);
	},
};

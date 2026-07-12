import m from 'mithril';
import { t } from '../lib/i18n';
import { getValueAnswersState, listenToValueAnswers, submitValueAnswer } from '../lib/values';
import type { AgoraTopicPackage } from '@freedi/shared-types';
import { AGORA_LIMITS } from '@freedi/shared-types';

export interface ValueIdentificationAttrs {
	sessionId: string;
	userId: string;
	topic: AgoraTopicPackage;
}

/**
 * The student writes, per character, which values guide them. Submission
 * is fire-and-forget; the AI feedback and accuracy score stream in via
 * the answer-doc listener while the student moves to the next character.
 */
export function ValueIdentification(): m.Component<ValueIdentificationAttrs> {
	let activeIndex = 0;
	const drafts: Record<string, string> = {};

	return {
		oninit(vnode) {
			const { sessionId, userId, topic } = vnode.attrs;
			listenToValueAnswers(
				sessionId,
				userId,
				topic.characters.map((character) => character.characterId),
			);
		},

		view(vnode) {
			const { sessionId, topic } = vnode.attrs;
			const { answers, pending } = getValueAnswersState();
			const characters = topic.characters;
			const character = characters[Math.min(activeIndex, characters.length - 1)];
			const answer = answers[character.characterId];
			const isPending = pending[character.characterId] ?? false;
			const draft = drafts[character.characterId] ?? '';
			const allAnswered = characters.every((candidate) => answers[candidate.characterId]);

			if (allAnswered && activeIndex >= characters.length) {
				return m('.shell', [
					m(
						'.shell__content.text-center',
						{ style: { justifyContent: 'center', gap: 'var(--space-lg)' } },
						[
							m('h3', t('scene.done_waiting')),
							m(
								'.stack',
								characters.map((candidate) => {
									const graded = answers[candidate.characterId];

									return graded?.gradedAt
										? m('.card.values__result', { key: candidate.characterId }, [
												m('strong', candidate.name),
												m('p.values__feedback', graded.aiFeedback ?? ''),
												m('span.values__score', `${t('values.score')}: ${graded.aiScore ?? 0}/100`),
											])
										: m(
												'p.lobby__status',
												{ key: candidate.characterId },
												`${candidate.name}: ${t('values.waiting_grade')}`,
											);
								}),
							),
						],
					),
				]);
			}

			return m('.shell', [
				m('.shell__content', { style: { justifyContent: 'center', gap: 'var(--space-lg)' } }, [
					m('h2.text-center', t('values.title', { name: character.name })),
					m('p.home-explanation', t('values.subtitle')),

					answer
						? m('.card.values__result', [
								m('p.scene__text', answer.answerText),
								answer.gradedAt
									? [
											m('h3.values__feedback-title', t('values.feedback')),
											m('p.values__feedback', answer.aiFeedback ?? ''),
											m('span.values__score', `${t('values.score')}: ${answer.aiScore ?? 0}/100`),
										]
									: m('p.lobby__status.lobby__waiting-dots', t('values.waiting_grade')),
							])
						: m('.stack', [
								m('textarea.text-input.values__textarea', {
									value: draft,
									rows: 5,
									maxlength: AGORA_LIMITS.MAX_ANSWER_LENGTH,
									placeholder: t('values.placeholder'),
									oninput: (event: InputEvent) => {
										drafts[character.characterId] = (event.target as HTMLTextAreaElement).value;
									},
								}),
								m(
									'button.btn.btn--primary.btn--full.btn--lg',
									{
										disabled: isPending || draft.trim().length < AGORA_LIMITS.MIN_ANSWER_LENGTH,
										onclick: () => {
											submitValueAnswer(sessionId, character.characterId, draft.trim());
										},
									},
									isPending ? t('values.waiting_grade') : t('values.submit'),
								),
							]),

					answer
						? m(
								'button.btn.btn--secondary.btn--full',
								{
									onclick: () => {
										activeIndex++;
									},
								},
								activeIndex < characters.length - 1
									? t('values.next_character')
									: t('scene.continue'),
							)
						: null,
				]),
			]);
		},
	};
}

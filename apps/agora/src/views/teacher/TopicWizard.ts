import m from 'mithril';
import { t, getLang } from '../../lib/i18n';
import { functions, httpsCallable } from '../../lib/firebase';
import { LanguagePicker } from '../../components/LanguagePicker';

/** Teacher enters a topic; the AI drafts the full journey for review */
export function TopicWizard(): m.Component {
	let topic = '';
	let generating = false;
	let error = false;

	function generate(): void {
		if (generating || topic.trim().length < 2) return;
		generating = true;
		error = false;
		const call = httpsCallable<{ topic: string; language: string }, { topicPackageId: string }>(
			functions,
			'agoraGenerateTopicPackage',
		);
		call({ topic: topic.trim(), language: getLang() })
			.then((result) => {
				m.route.set(`/teach/topic/${result.data.topicPackageId}`);
			})
			.catch((err: unknown) => {
				console.error('[Wizard] Generation failed:', err);
				error = true;
			})
			.finally(() => {
				generating = false;
				m.redraw();
			});
	}

	return {
		view() {
			return m('.shell', [
				m('.home-header', [
					m(LanguagePicker),
					m('button.btn.btn--ghost', { onclick: () => m.route.set('/teach') }, t('common.back')),
				]),
				m('.shell__content', { style: { justifyContent: 'center', gap: 'var(--space-xl)' } }, [
					m('h2.text-center', t('wizard.title')),
					m('.card.stack', [
						m('p.home-card__text', t('wizard.topic_label')),
						m('input.text-input', {
							type: 'text',
							value: topic,
							placeholder: t('wizard.topic_placeholder'),
							disabled: generating,
							oninput: (event: InputEvent) => {
								topic = (event.target as HTMLInputElement).value;
							},
							onkeydown: (event: KeyboardEvent) => {
								if (event.key === 'Enter') generate();
							},
						}),
						m(
							'button.btn.btn--primary.btn--full.btn--lg',
							{
								disabled: generating || topic.trim().length < 2,
								onclick: generate,
							},
							generating ? t('wizard.generating') : t('wizard.generate'),
						),
						generating ? m('.spinner') : null,
						error ? m('p.join__error', t('common.error')) : null,
					]),
				]),
			]);
		},
	};
}

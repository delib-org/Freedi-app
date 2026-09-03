import m from 'mithril';
import { t, getLang } from '../../lib/i18n';
import { generateTopicPackage } from '../../lib/callables';
import { LanguagePicker } from '../../components/LanguagePicker';
import { TeacherBar } from '../../components/TeacherBar';

/** Teacher enters a topic; the AI drafts the full journey for review */
export function TopicWizard(): m.Component {
	let topic = '';
	let generating = false;
	let error = false;
	/** A teacher who leaves mid-generation must not be yanked back when the
	 *  draft lands: the package is still created, and shows up on the shelf. */
	let alive = true;

	function generate(): void {
		if (generating || topic.trim().length < 2) return;
		generating = true;
		error = false;
		generateTopicPackage({ topic: topic.trim(), language: getLang() })
			.then((result) => {
				if (alive) m.route.set(`/teach/topic/${result.topicPackageId}`);
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
		onremove() {
			alive = false;
		},
		view() {
			return m('.shell', [
				m(TeacherBar, {
					title: t('wizard.title'),
					onBack: () => m.route.set('/teach'),
					trailing: m(LanguagePicker),
				}),
				m('.shell__content', { style: { justifyContent: 'center', gap: 'var(--space-xl)' } }, [
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

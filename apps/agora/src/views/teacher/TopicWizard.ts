import m from 'mithril';
import { t, getLang } from '../../lib/i18n';
import { generateTopicPackage } from '../../lib/callables';
import { LanguagePicker } from '../../components/LanguagePicker';
import { TeacherNav } from '../../components/TeacherNav';

/** Teacher supplies the question and purpose; AI drafts a scenario for review. */
export function TopicWizard(): m.Component {
	let statement = '';
	let description = '';
	const canGenerate = (): boolean => statement.trim().length >= 2 && description.trim().length > 0;
	let generating = false;
	let error = false;
	/** A teacher who leaves mid-generation must not be yanked back when the
	 *  draft lands: the package is still created, and shows up on the shelf. */
	let alive = true;

	function generate(): void {
		if (generating || !canGenerate()) return;
		generating = true;
		error = false;
		generateTopicPackage({
			statement: statement.trim(),
			description: description.trim(),
			language: getLang(),
		})
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
				m(TeacherNav, {
					title: t('wizard.title'),
					onBack: () => m.route.set('/teach'),
					trailing: m(LanguagePicker),
				}),
				m('.shell__content', { style: { justifyContent: 'center', gap: 'var(--space-xl)' } }, [
					m('.card.stack', [
						m('label.home-card__text', { for: 'scenario-statement' }, t('wizard.topic_label')),
						m('input.text-input', {
							id: 'scenario-statement',
							type: 'text',
							maxlength: 200,
							required: true,
							value: statement,
							placeholder: t('wizard.topic_placeholder'),
							disabled: generating,
							oninput: (event: InputEvent) => {
								statement = (event.target as HTMLInputElement).value;
							},
						}),
						m(
							'label.home-card__text',
							{ for: 'scenario-description' },
							t('wizard.description_label'),
						),
						m('textarea.text-input', {
							id: 'scenario-description',
							value: description,
							rows: 5,
							maxlength: 2000,
							required: true,
							placeholder: t('wizard.description_placeholder'),
							disabled: generating,
							oninput: (event: InputEvent) => {
								description = (event.target as HTMLTextAreaElement).value;
							},
						}),
						m('p.home-explanation', t('wizard.method_hint')),

						m(
							'button.btn.btn--primary.btn--full.btn--lg',
							{
								disabled: generating || !canGenerate(),
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

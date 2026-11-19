import m from 'mithril';
import { getAvailableLanguages, getLang, isLanguageForced, setLang, t } from '@/lib/i18n';
import '@/styles/language-button.scss';

/**
 * The student's language button: a globe and the name of the language now on
 * screen, in the student frame's header where every student screen has it.
 * Tapping opens the phone's own picker (a native select), so it works the
 * same on every phone and in every direction.
 *
 * Draws nothing while the teacher has locked the lesson's language: the choice
 * is gone, not greyed out. When the lock is lifted it comes back.
 */
export const LanguageButton: m.Component = {
	view() {
		if (isLanguageForced()) return null;

		return m('label.language-button', [
			m(
				'svg.language-button__globe',
				{
					viewBox: '0 0 24 24',
					'aria-hidden': 'true',
					focusable: 'false',
					fill: 'none',
					stroke: 'currentColor',
					'stroke-width': '2',
					'stroke-linecap': 'round',
					'stroke-linejoin': 'round',
				},
				[
					m('circle', { cx: 12, cy: 12, r: 10 }),
					m('path', { d: 'M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20' }),
				],
			),
			m(
				'select.language-button__select',
				{
					'aria-label': t('a11y.language'),
					value: getLang(),
					onchange: (e: Event) => setLang((e.target as HTMLSelectElement).value),
				},
				getAvailableLanguages().map((lang) =>
					m('option', { key: lang.code, value: lang.code, dir: 'auto' }, lang.name),
				),
			),
		]);
	},
};

import m from 'mithril';
import { getLang, setLang, getAvailableLanguages, LangCode } from '../lib/i18n';

export const LanguagePicker: m.Component = {
	view() {
		return m('.lang-picker', [
			m(
				'select',
				{
					value: getLang(),
					'aria-label': 'Language',
					onchange: (event: Event) => {
						setLang((event.target as HTMLSelectElement).value as LangCode);
					},
				},
				getAvailableLanguages().map((language) =>
					m('option', { value: language.code }, language.name),
				),
			),
		]);
	},
};

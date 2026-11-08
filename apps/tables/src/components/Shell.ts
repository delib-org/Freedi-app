import m from 'mithril';
import { getAvailableLanguages, getLang, setLang, t } from '@/lib/i18n';

/**
 * The page frame of every screen: app name, language switch, a back link to
 * the screen's home (IA section 5: every child returns to its role's home),
 * the screen title and the content. Mobile-first single column.
 */
export interface ShellAttrs {
	title: string;
	/** Where "back" goes; omitted on a role's home. */
	backHref?: string;
	backLabel?: string;
	/** Extra modifier for the content width, e.g. wide tables. */
	wide?: boolean;
}

function languageSwitch(): m.Vnode {
	return m('label.shell__lang', [
		m('span.visually-hidden', t('tableAssignment.language')),
		m(
			'select.shell__lang-select',
			{
				value: getLang(),
				onchange: (event: Event) => {
					const value = (event.target as HTMLSelectElement).value;

					if (value === 'he' || value === 'en' || value === 'ar') setLang(value);
				},
			},
			getAvailableLanguages().map((lang) => m('option', { value: lang.code }, lang.name)),
		),
	]);
}

export const Shell: m.Component<ShellAttrs> = {
	view({ attrs, children }) {
		return m('.shell', [
			m('header.shell__bar', [m('span.shell__app', t('tableAssignment.app')), languageSwitch()]),
			m('main.shell__main', { class: attrs.wide ? 'shell__main--wide' : '' }, [
				attrs.backHref
					? m(
							m.route.Link,
							{ href: attrs.backHref, class: 'shell__back' },
							attrs.backLabel ?? t('tableAssignment.back'),
						)
					: null,
				m('h1.shell__title', attrs.title),
				children,
			]),
		]);
	},
};

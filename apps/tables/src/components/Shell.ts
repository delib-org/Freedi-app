import m from 'mithril';
import { getAvailableLanguages, getLang, isSupported, setLang, t } from '@/lib/i18n';
import { isDarkTheme } from '@/lib/a11yPrefs';
import { AccessibilityTool } from '@/components/AccessibilityTool';

/**
 * The page frame of every screen, host and participant: the accessibility
 * tool, a logo that follows the theme, language, and the content.
 * Host screens pass `title` and `backHref`; a participant screen draws its own
 * header and passes `phone`.
 */
export interface ShellAttrs {
	title?: string;
	/** Where "back" goes; omitted on a role's home. */
	backHref?: string;
	backLabel?: string;
	/** Extra modifier for the content width, e.g. wide tables. */
	wide?: boolean;
	/** The one-column phone layout of the participant screens. */
	phone?: boolean;
	/** What the bar says besides language: the step, or the gathering name. */
	barLabel?: string;
	largeLogo?: boolean;
	/** A projector screen: the whole width, and its heading in the bar. */
	room?: boolean;
	barTitle?: string;
	/** Host screens only: signs the host out. Never drawn on a projector screen. */
	onSignOut?: () => void;
}

const LOGO_LIGHT = '/brand/wizcol-logo.webp';
const LOGO_DARK = '/brand/wizcol-logo-dark.webp';
const BRAND_NAME = 'WizCol';

function languageSwitch(): m.Vnode {
	return m('label.shell__lang', [
		m('span.visually-hidden', t('tableAssignment.language')),
		m(
			'select.shell__lang-select',
			{
				value: getLang(),
				onchange: (event: Event) => {
					const value = (event.target as HTMLSelectElement).value;

					if (isSupported(value)) setLang(value);
				},
			},
			getAvailableLanguages().map((lang) => m('option', { value: lang.code }, lang.name)),
		),
	]);
}

export const Shell: m.Component<ShellAttrs> = {
	view({ attrs, children }) {
		const variant = attrs.room ? 'shell--room' : attrs.phone ? 'shell--phone' : '';

		return m('.shell', { class: variant }, [
			m('header.shell__bar', [
				m('.shell__brand', [
					m(AccessibilityTool),
					m('img.shell__logo', {
						class: attrs.largeLogo ? 'shell__logo--large' : '',
						src: isDarkTheme() ? LOGO_DARK : LOGO_LIGHT,
						alt: BRAND_NAME,
					}),
				]),
				attrs.barTitle ? m('h1.shell__bar-title', { dir: 'auto' }, attrs.barTitle) : null,
				m('.shell__bar-end', [
					attrs.barLabel ? m('span.shell__label', { dir: 'auto' }, attrs.barLabel) : null,
					languageSwitch(),
					attrs.onSignOut && !attrs.room
						? m(
								'button.btn.btn--text.shell__sign-out',
								{ type: 'button', onclick: attrs.onSignOut },
								t('tableAssignment.signOut'),
							)
						: null,
				]),
			]),
			m('main.shell__main', { class: attrs.wide ? 'shell__main--wide' : '' }, [
				attrs.backHref
					? m(
							m.route.Link,
							{ href: attrs.backHref, class: 'shell__back' },
							attrs.backLabel ?? t('tableAssignment.back'),
						)
					: null,
				attrs.title ? m('h1.shell__title', attrs.title) : null,
				children,
			]),
		]);
	},
};

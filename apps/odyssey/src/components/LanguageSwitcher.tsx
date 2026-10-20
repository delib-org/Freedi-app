import { LANGS, LANGUAGE_NAMES } from '../i18n/i18n';
import { useT } from '../i18n/useT';

/**
 * עברית / English / العربية — three buttons, the current one pressed.
 *
 * Each name is written in its own language and carries its own `lang` and
 * `dir="auto"`, so it is read aloud correctly and laid out correctly whatever
 * the page's language is. Switching persists the choice (see i18n.setLang);
 * everything that reads `useT()` re-renders, and the sea stage rebuilds.
 */
export default function LanguageSwitcher({ className = '' }: { className?: string }) {
	const { t, lang, setLang } = useT();

	return (
		<div className={`lang-switch ${className}`.trim()} role="group" aria-label={t('lang.switch')}>
			{LANGS.map((option) => {
				const active = option === lang;

				return (
					<button
						key={option}
						type="button"
						lang={option}
						dir="auto"
						className={`lang-switch__option${active ? ' lang-switch__option--active' : ''}`}
						aria-pressed={active}
						onClick={() => void setLang(option)}
					>
						{LANGUAGE_NAMES[option]}
					</button>
				);
			})}
		</div>
	);
}

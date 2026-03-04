import m from 'mithril';
import { getAvailableLanguages, getLang, setLang } from '../lib/i18n';

/**
 * LanguagePicker — a row of language pills.
 * Highlights the active language. Calls setLang() on tap which
 * updates localStorage, document direction, and triggers m.redraw().
 */
export function LanguagePicker(): m.Component {
  return {
    view() {
      const current = getLang();
      const languages = getAvailableLanguages();

      return m('.lang-picker', { role: 'radiogroup', 'aria-label': 'Language' },
        languages.map((lang) =>
          m('button.lang-picker__pill', {
            key: lang.code,
            class: lang.code === current ? 'lang-picker__pill--active' : '',
            role: 'radio',
            'aria-checked': String(lang.code === current),
            'aria-label': lang.name,
            onclick: () => {
              if (lang.code !== current) {
                setLang(lang.code);
              }
            },
          }, lang.name)
        )
      );
    },
  };
}

import ar from './ar';
import de from './de';
import en from './en';
import es from './es';
import he from './he';
import nl from './nl';
import type { LangCode } from '../i18n';

/**
 * Every dictionary at once. Exported for the key-parity tests only. The
 * locales drifted apart once already: a key added to one language and
 * forgotten in five shows up as a raw dotted key on a student's screen, and
 * nothing was checking. The app itself never imports this file, so the five
 * non-default dictionaries stay out of the entry bundle.
 */
export const translations: Record<LangCode, Record<string, string>> = { he, en, ar, es, de, nl };

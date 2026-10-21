import { describe, expect, it } from 'vitest';
import en from '@/lib/locales/en';
import he from '@/lib/locales/he';
import ar from '@/lib/locales/ar';
import de from '@/lib/locales/de';
import es from '@/lib/locales/es';
import fa from '@/lib/locales/fa';
import nl from '@/lib/locales/nl';

function missingFrom(dictionary: Record<string, string>): string[] {
	return Object.keys(en).filter((key) => !(key in dictionary));
}

describe('locale parity', () => {
	it('Hebrew, the default language, has every English key', () => {
		expect(missingFrom(he)).toEqual([]);
	});

	it('reports the gap of the other locales (English fills it at runtime; not translated yet)', () => {
		const gaps = { ar, de, es, fa, nl };
		for (const [lang, dictionary] of Object.entries(gaps)) {
			console.info(
				`[localeParity] ${lang} lacks ${missingFrom(dictionary).length} of ${Object.keys(en).length} keys`,
			);
		}
		expect(Object.keys(gaps)).toHaveLength(5);
	});
});

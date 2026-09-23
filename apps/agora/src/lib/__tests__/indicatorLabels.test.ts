import { describe, it, expect } from 'vitest';
import { labelKeysFor, type IndicatorScope } from '@freedi/shared-charts';
import { translations } from '../i18n';

describe('modular indicator translations', () => {
	for (const [locale, dict] of Object.entries(translations))
		it(`${locale} covers every registered indicator`, () => {
			for (const scope of ['class', 'student', 'teacher', 'school', 'system'] as IndicatorScope[])
				for (const key of labelKeysFor(scope)) expect(dict[key], `${locale}: ${key}`).toBeTruthy();
		});
});

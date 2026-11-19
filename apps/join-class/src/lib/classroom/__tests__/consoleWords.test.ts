import { describe, expect, it } from 'vitest';
import en from '@/lib/locales/en';
import he from '@/lib/locales/he';
import ar from '@/lib/locales/ar';
import de from '@/lib/locales/de';
import es from '@/lib/locales/es';
import fa from '@/lib/locales/fa';
import nl from '@/lib/locales/nl';
import { gatePercent } from '@/lib/classroom/gatePercent';
import { consoleStepLabelKey } from '@/lib/classroom/consoleStepLabel';

const ALL: Record<string, Record<string, string>> = { en, he, ar, de, es, fa, nl };
const RETIRED_HE = ['שאלה להצעות', 'השאלה המרכזית', 'רף ', 'היעד', 'מושהית'];

describe('console words', () => {
	it('shows the goal as a whole percent', () => {
		expect(gatePercent(0.4)).toBe(40);
		expect(gatePercent(0.05)).toBe(5);
		expect(gatePercent(1)).toBe(100);
		expect(gatePercent(0.1 + 0.2)).toBe(30);
	});

	it('names the first step for the teacher, and only for the teacher', () => {
		expect(consoleStepLabelKey('waiting')).toBe('console.step.waiting');
		expect(consoleStepLabelKey('vote')).toBe('step.vote');
		expect(he['console.step.waiting']).toBe('התלמידים נכנסים');
		expect(he['step.waiting']).toBe('ממתינים למורה');
	});

	it('has the new keys in every language', () => {
		for (const [lang, dict] of Object.entries(ALL)) {
			expect(dict['console.step.waiting'], lang).toBeTruthy();
			expect(dict['console.settings_scope'], lang).toBeTruthy();
		}
	});

	it('uses one name for the question to solve and for the goal in Hebrew console strings', () => {
		for (const [key, value] of Object.entries(he)) {
			if (!key.startsWith('console.') && !key.startsWith('plan.challenge')) continue;
			for (const word of RETIRED_HE) expect(value, key).not.toContain(word);
		}
	});

	it('shows the goal as a percent in settings', () => {
		expect(he['console.gate.value']).toContain('%');
		expect(en['console.gate.value']).toContain('%');
	});
});

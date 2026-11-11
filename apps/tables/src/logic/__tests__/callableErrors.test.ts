import { describe, expect, it } from 'vitest';
import en from '@/lib/locales/en';
import he from '@/lib/locales/he';
import ar from '@/lib/locales/ar';
import { NAME_SCREEN_REASON_KEYS, errorMessageKey } from '../callableErrors';

function refusal(reason: string): { code: string; details: { reason: string } } {
	return { code: 'functions/failed-precondition', details: { reason } };
}

const NEW_REASONS: ReadonlyArray<[string, string]> = [
	['too-few-registrants', 'tableAssignment.error.tooFewRegistrants'],
	['preview-limit', 'tableAssignment.error.previewLimit'],
	['registration-full', 'tableAssignment.error.registrationFull'],
	['name-locked', 'tableAssignment.error.nameLocked'],
];

describe('new server reasons', () => {
	it.each(NEW_REASONS)('%s has its own message', (reason, key) => {
		expect(errorMessageKey(refusal(reason), 'tableAssignment.error.generic')).toBe(key);
	});

	it.each([...NEW_REASONS.map(([, key]) => key), 'tableAssignment.error.nameClaimed'])(
		'%s is written in he, en and ar',
		(key) => {
			for (const locale of [he, en, ar]) {
				expect((locale as Record<string, string>)[key]?.length ?? 0).toBeGreaterThan(10);
			}
		},
	);

	it('does not tell the host to wait for registrants when the preview limit is reached', () => {
		expect(en['tableAssignment.error.previewLimit']).not.toMatch(/register/i);
	});

	it('says a rename of a claimed registration is blocked on the name screen, and a cancel elsewhere', () => {
		const claimed = refusal('claimed-by-name');

		expect(errorMessageKey(claimed, 'x', NAME_SCREEN_REASON_KEYS)).toBe(
			'tableAssignment.error.nameClaimed',
		);
		expect(errorMessageKey(claimed, 'x')).toBe('tableAssignment.cancel.claimed');
	});

	it('explains why the name cannot change in name-locked and claimed messages', () => {
		expect(en['tableAssignment.error.nameLocked']).toMatch(/name/i);
		expect(en['tableAssignment.error.nameClaimed']).toMatch(/cannot be changed/i);
	});
});

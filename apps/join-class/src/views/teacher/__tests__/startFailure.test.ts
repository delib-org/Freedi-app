import { describe, expect, it } from 'vitest';
import { startFailureOf } from '../startFailure';

describe('startFailureOf', () => {
	it('names a missing Agora approval, so the form can offer "בלי כיתה"', () => {
		expect(
			startFailureOf({
				code: 'functions/permission-denied',
				details: { reason: 'agora-not-approved' },
			}),
		).toBe('not_approved');
		expect(
			startFailureOf({ code: 'functions/permission-denied', details: { reason: 'not-approved' } }),
		).toBe('not_approved');
	});

	it('any other permission-denied is "not yours"', () => {
		expect(startFailureOf({ code: 'functions/permission-denied' })).toBe('not_yours');
		expect(startFailureOf({ code: 'functions/permission-denied', details: { reason: 'x' } })).toBe(
			'not_yours',
		);
	});

	it('everything else, and non-errors, is a plain failure', () => {
		expect(startFailureOf({ code: 'functions/unavailable' })).toBe('failed');
		expect(startFailureOf(null)).toBe('failed');
		expect(startFailureOf('boom')).toBe('failed');
	});
});

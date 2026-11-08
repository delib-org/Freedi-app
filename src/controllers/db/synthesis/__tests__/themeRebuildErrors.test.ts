import { classifyThemeRebuildError } from '../themeRebuildErrors';

describe('classifyThemeRebuildError', () => {
	it('treats already-exists as a run in progress', () => {
		expect(classifyThemeRebuildError({ code: 'functions/already-exists' })).toBe('in-progress');
	});

	it('maps an expired or missing proposal to expired', () => {
		expect(
			classifyThemeRebuildError({
				code: 'functions/failed-precondition',
				details: { reason: 'proposal-expired' },
			}),
		).toBe('expired');
		expect(
			classifyThemeRebuildError({
				code: 'functions/failed-precondition',
				details: { reason: 'proposal-not-found' },
			}),
		).toBe('expired');
	});

	it('maps no-atoms', () => {
		expect(
			classifyThemeRebuildError({
				code: 'functions/failed-precondition',
				details: { reason: 'no-atoms' },
			}),
		).toBe('no-atoms');
	});

	it('returns undefined for anything else', () => {
		expect(
			classifyThemeRebuildError({
				code: 'functions/failed-precondition',
				details: { reason: 'derived-docs-have-votes' },
			}),
		).toBeUndefined();
		expect(classifyThemeRebuildError({ code: 'functions/failed-precondition' })).toBeUndefined();
		expect(
			classifyThemeRebuildError({
				code: 'functions/failed-precondition',
				details: { reason: 7 },
			}),
		).toBeUndefined();
		expect(classifyThemeRebuildError({ code: 'functions/permission-denied' })).toBeUndefined();
		expect(classifyThemeRebuildError(new Error('boom'))).toBeUndefined();
		expect(classifyThemeRebuildError(null)).toBeUndefined();
		expect(classifyThemeRebuildError('boom')).toBeUndefined();
	});
});

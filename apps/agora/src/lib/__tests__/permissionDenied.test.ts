import { describe, expect, it } from 'vitest';
import { isPermissionDenied } from '../permissionDenied';

describe('isPermissionDenied', () => {
	it('recognises the Firestore and callable codes', () => {
		expect(isPermissionDenied({ code: 'permission-denied' })).toBe(true);
		expect(isPermissionDenied({ code: 'firestore/permission-denied' })).toBe(true);
		expect(isPermissionDenied({ code: 'functions/permission-denied' })).toBe(true);
	});

	it('tells other failures apart', () => {
		expect(isPermissionDenied({ code: 'unavailable' })).toBe(false);
		expect(isPermissionDenied({ code: 'functions/not-found' })).toBe(false);
		expect(isPermissionDenied(new Error('permission-denied'))).toBe(false);
		expect(isPermissionDenied(null)).toBe(false);
		expect(isPermissionDenied(undefined)).toBe(false);
	});
});

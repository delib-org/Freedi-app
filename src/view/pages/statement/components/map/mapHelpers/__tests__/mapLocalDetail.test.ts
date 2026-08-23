jest.mock('@freedi/shared-types', () => ({}));

import { loadLocalDetail, saveLocalDetail } from '../mapLocalDetail';

describe('mapLocalDetail', () => {
	beforeEach(() => localStorage.clear());

	it('round-trips a level per question and user', () => {
		saveLocalDetail('q1', 'u1', 'themes');
		expect(loadLocalDetail('q1', 'u1')).toBe('themes');
		expect(loadLocalDetail('q1', 'u2')).toBeNull();
		expect(loadLocalDetail('q2', 'u1')).toBeNull();
	});

	it('treats a missing user as anonymous', () => {
		saveLocalDetail('q1', undefined, 'everything');
		expect(loadLocalDetail('q1', undefined)).toBe('everything');
	});

	it('rejects a stale or corrupt value', () => {
		localStorage.setItem('freedi_map_detail_level:q1:u1', 'raw');
		expect(loadLocalDetail('q1', 'u1')).toBeNull();
	});

	it('clears on null', () => {
		saveLocalDetail('q1', 'u1', 'ideas');
		saveLocalDetail('q1', 'u1', null);
		expect(loadLocalDetail('q1', 'u1')).toBeNull();
	});
});

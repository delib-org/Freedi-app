import { pluralKey, translateCount } from '../translateCount';

const dictionary: Record<string, string> = {
	'people.rooms.roomCount_one': '1 room',
	'people.rooms.roomCount_other': '{{count}} rooms',
};
const t = (key: string): string => dictionary[key] ?? key;

describe('pluralKey', () => {
	it('uses _one for exactly one', () => {
		expect(pluralKey('people.rooms.roomCount', 1)).toBe('people.rooms.roomCount_one');
	});

	it('uses _other for zero and for more than one', () => {
		expect(pluralKey('people.rooms.roomCount', 0)).toBe('people.rooms.roomCount_other');
		expect(pluralKey('people.rooms.roomCount', 3)).toBe('people.rooms.roomCount_other');
	});
});

describe('translateCount', () => {
	it('translates the singular form', () => {
		expect(translateCount(t, 'people.rooms.roomCount', 1)).toBe('1 room');
	});

	it('translates the plural form and fills the count', () => {
		expect(translateCount(t, 'people.rooms.roomCount', 4)).toBe('4 rooms');
	});
});

import { RoomSettings } from '@freedi/shared-types';
import { activeSplitsOf, countActiveRooms } from '../roomsLogic';

function split(
	settingsId: string,
	statementId: string,
	totalRooms: number,
	createdAt: number,
	status: RoomSettings['status'] = 'active',
	topParentId = 'q1',
): RoomSettings {
	return { settingsId, statementId, topParentId, totalRooms, createdAt, status } as RoomSettings;
}

describe('roomsLogic', () => {
	const settings = [
		split('old', 'answer-a', 9, 1),
		split('new', 'answer-a', 2, 5),
		split('b', 'answer-b', 3, 2),
		split('gone', 'answer-c', 4, 3, 'archived' as RoomSettings['status']),
		split('other', 'answer-d', 7, 3, 'active', 'q2'),
	];

	it('keeps the newest active split per answer of this question', () => {
		expect(
			activeSplitsOf(settings, 'q1')
				.map((s) => s.settingsId)
				.sort(),
		).toEqual(['b', 'new']);
	});

	it('counts the rooms of those splits', () => {
		expect(countActiveRooms(settings, 'q1')).toBe(5);
	});

	it('is 0 when nothing is split', () => {
		expect(countActiveRooms([], 'q1')).toBe(0);
	});
});

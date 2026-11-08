import {
	hasEnoughPeopleToSplit,
	MIN_PEOPLE_TO_SPLIT,
	ParticipantWithDemographics,
	scrambleIntoRooms,
} from '../rooms/scrambleIntoRooms';

function people(count: number, withDemographics = false): ParticipantWithDemographics[] {
	return Array.from({ length: count }, (_, i) => ({
		userId: `u${i}`,
		userName: `User ${i}`,
		demographicKey: withDemographics ? (i % 2 === 0 ? 'a' : 'b') : 'random',
		demographicTags: [],
		hasCompleteDemographics: withDemographics,
	}));
}

function roomSizes(count: number, roomSize: number, withDemographics = false): number[] {
	return scrambleIntoRooms(people(count, withDemographics), roomSize)
		.rooms.map((room) => room.participants.length)
		.sort((a, b) => b - a);
}

describe('hasEnoughPeopleToSplit', () => {
	it('needs two people, whatever the room size', () => {
		expect(MIN_PEOPLE_TO_SPLIT).toBe(2);
		expect(hasEnoughPeopleToSplit(0)).toBe(false);
		expect(hasEnoughPeopleToSplit(1)).toBe(false);
		expect(hasEnoughPeopleToSplit(2)).toBe(true);
		expect(hasEnoughPeopleToSplit(5)).toBe(true);
	});
});

describe('scrambleIntoRooms', () => {
	it('makes one smaller room when an answer has fewer people than a room holds', () => {
		expect(roomSizes(2, 7)).toEqual([2]);
		expect(roomSizes(5, 7)).toEqual([5]);
	});

	it('balances rooms as evenly as possible without exceeding the room size', () => {
		expect(roomSizes(8, 7)).toEqual([4, 4]);
		expect(roomSizes(15, 7)).toEqual([5, 5, 5]);
		expect(roomSizes(16, 7)).toEqual([6, 5, 5]);
		expect(roomSizes(16, 7, true)).toEqual([6, 5, 5]);
	});

	it('puts every person in exactly one room', () => {
		const result = scrambleIntoRooms(people(23, true), 4);
		const placed = result.rooms.flatMap((room) => room.participants.map((p) => p.userId));

		expect(result.totalParticipants).toBe(23);
		expect(new Set(placed).size).toBe(23);
		expect(Math.max(...result.rooms.map((room) => room.participants.length))).toBeLessThanOrEqual(
			4,
		);
	});

	it('returns no rooms for nobody', () => {
		expect(scrambleIntoRooms([], 7).totalRooms).toBe(0);
	});
});

import { describe, expect, it } from 'vitest';
import { openPlaceOf, placeNavTabs, type PlaceNavInput } from '../flows/placeNav';

const atBooth: PlaceNavInput = {
	village: true,
	hasDesk: true,
	hasCommunity: true,
	inFlight: false,
	open: 'none',
};

const ids = (input: PlaceNavInput): string[] => placeNavTabs(input).map((tab) => tab.id);
const locked = (input: PlaceNavInput): string[] =>
	placeNavTabs(input)
		.filter((tab) => tab.locked)
		.map((tab) => tab.id);
const activeId = (input: PlaceNavInput): string | undefined =>
	placeNavTabs(input).find((tab) => tab.active)?.id;

describe('placeNavTabs', () => {
	it('offers four doors at a booth, in lesson order', () => {
		expect(ids(atBooth)).toEqual(['village', 'note', 'board', 'results']);
		expect(locked(atBooth)).toEqual([]);
	});

	it('drops the village door in the flat view, keeping the other three', () => {
		expect(ids({ ...atBooth, village: false })).toEqual(['note', 'board', 'results']);
	});

	it('fills exactly one tab, and standing in the village fills the village', () => {
		expect(activeId(atBooth)).toBe('village');
		expect(activeId({ ...atBooth, open: 'note' })).toBe('note');
		expect(activeId({ ...atBooth, open: 'board' })).toBe('board');
		expect(activeId({ ...atBooth, open: 'results' })).toBe('results');
		expect(placeNavTabs({ ...atBooth, open: 'board' }).filter((t) => t.active)).toHaveLength(1);
	});

	it('locks the note and the board where there is no desk — the library, the council', () => {
		const away = { ...atBooth, hasDesk: false };
		expect(locked(away)).toEqual(['note', 'board']);
		expect(placeNavTabs(away).find((t) => t.id === 'note')?.hint).toBe('village.nav.hint_no_note');
		expect(placeNavTabs(away).find((t) => t.id === 'board')?.hint).toBe(
			'village.nav.hint_no_board',
		);
	});

	it('locks the board and the results until the student has a seat', () => {
		const seatless = { ...atBooth, hasCommunity: false };
		expect(locked(seatless)).toEqual(['board', 'results']);
		expect(placeNavTabs(seatless).find((t) => t.id === 'results')?.hint).toBe(
			'village.nav.hint_no_seat',
		);
	});

	it('locks the note and the board while the note is flying, and says why', () => {
		const flying = { ...atBooth, inFlight: true };
		expect(locked(flying)).toEqual(['note', 'board']);
		expect(placeNavTabs(flying).find((t) => t.id === 'note')?.hint).toBe('village.nav.hint_flight');
		// the way back to the village is never shut
		expect(placeNavTabs(flying).find((t) => t.id === 'village')?.locked).toBe(false);
	});

	it('never marks a locked tab as the place you are standing in', () => {
		const tabs = placeNavTabs({ ...atBooth, hasDesk: false, open: 'note' });
		expect(tabs.find((t) => t.id === 'note')).toMatchObject({ locked: true, active: false });
	});
});

describe('openPlaceOf', () => {
	const shell = { opened: false, deskOpen: false, communityOpen: false, boardView: false };

	it('reads the shell flags as one place', () => {
		expect(openPlaceOf(shell)).toBe('none');
		expect(openPlaceOf({ ...shell, opened: true, deskOpen: true })).toBe('note');
		expect(openPlaceOf({ ...shell, communityOpen: true, boardView: true })).toBe('board');
		expect(openPlaceOf({ ...shell, communityOpen: true })).toBe('results');
		expect(openPlaceOf({ ...shell, opened: true, council: true })).toBe('results');
		expect(openPlaceOf({ ...shell, opened: true })).toBe('none');
	});

	it('lets an open board outrank a paper left open behind it', () => {
		expect(
			openPlaceOf({ opened: true, deskOpen: true, communityOpen: true, boardView: true }),
		).toBe('board');
	});
});

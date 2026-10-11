import React from 'react';
import { render } from '@testing-library/react';
import HighlightedText, { splitByRanges } from '../HighlightedText';

describe('splitByRanges', () => {
	it('returns the whole text when nothing matched', () => {
		expect(splitByRanges('Talk')).toEqual([{ text: 'Talk', match: false }]);
	});

	it('marks matched parts in order', () => {
		expect(
			splitByRanges('Talk about parks', [
				{ start: 11, end: 16 },
				{ start: 0, end: 4 },
			]),
		).toEqual([
			{ text: 'Talk', match: true },
			{ text: ' about ', match: false },
			{ text: 'parks', match: true },
		]);
	});

	it('merges overlapping and touching ranges and clamps out-of-bounds ones', () => {
		expect(
			splitByRanges('Talk', [
				{ start: 0, end: 2 },
				{ start: 1, end: 3 },
				{ start: 3, end: 99 },
				{ start: -5, end: 0 },
			]),
		).toEqual([{ text: 'Talk', match: true }]);
	});
});

describe('HighlightedText', () => {
	it('wraps matches in mark elements', () => {
		const { container } = render(
			<HighlightedText text="Talk about parks" ranges={[{ start: 0, end: 4 }]} className="extra" />,
		);

		const marks = container.querySelectorAll('mark.highlighted-text__mark');
		expect(marks).toHaveLength(1);
		expect(marks[0].textContent).toBe('Talk');
		expect(container.firstElementChild?.className).toBe('highlighted-text extra');
		expect(container.textContent).toBe('Talk about parks');
	});
});

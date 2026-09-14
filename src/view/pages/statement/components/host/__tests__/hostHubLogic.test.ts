import {
	buildHostHubPath,
	countHidden,
	DEFAULT_HOST_HUB_SECTION,
	HOST_HUB_SECTIONS,
	isHostHubSection,
	parseHostHubSection,
} from '../hostHubLogic';

describe('hostHubLogic', () => {
	it('parses ?section= and falls back to Live now', () => {
		expect(parseHostHubSection(new URLSearchParams('section=people'))).toBe('people');
		expect(parseHostHubSection(new URLSearchParams('section=nope'))).toBe(DEFAULT_HOST_HUB_SECTION);
		expect(parseHostHubSection(new URLSearchParams(''))).toBe('live');
	});

	it('recognises exactly the six sections', () => {
		HOST_HUB_SECTIONS.forEach((id) => expect(isHostHubSection(id)).toBe(true));
		expect(isHostHubSection('members')).toBe(false);
		expect(isHostHubSection(null)).toBe(false);
	});

	it('builds a canonical deep link', () => {
		expect(buildHostHubPath('q1', 'results')).toBe('/statement-screen/q1/settings?section=results');
	});

	it('counts hidden answers', () => {
		expect(countHidden([{ hide: true }, {}, { hide: false }, { hide: true }])).toBe(2);
		expect(countHidden([])).toBe(0);
	});
});

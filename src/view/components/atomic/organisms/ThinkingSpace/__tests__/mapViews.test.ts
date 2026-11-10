import { Screen } from '@freedi/shared-types';
import { mapViews } from '../MapExplorer';

describe('mapViews names', () => {
	it.each(mapViews.map((view) => [view.id, view] as const))('%s has one name', (_id, view) => {
		expect(view.title).toBe(view.rowTitle);
	});

	it('uses the agreed names', () => {
		const titleOf = (id: Screen) => mapViews.find((view) => view.id === id)?.title;

		expect(titleOf(Screen.mindMap)).toBe('Mind map');
		expect(titleOf(Screen.clusterBoard)).toBe('Topics map');
		expect(titleOf(Screen.agreementMap)).toBe('Agreement Map');
		expect(titleOf(Screen.polarizationIndex)).toBe('Disagreement map');
		expect(titleOf(Screen.subQuestionsMap)).toBe('Questions map');
	});
});

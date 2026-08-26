/**
 * The map's rating row must be the app's own face scale — sad → smiley by
 * default, not a generic emoji set — and must stay laid out like every other
 * rating row so the two never disagree on which end is which.
 */

import { getMapEvaluationFaces } from '../mapHelpers/mapEvaluationFaces';

describe('getMapEvaluationFaces', () => {
	it('defaults to the signed -1 … +1 scale', () => {
		expect(getMapEvaluationFaces('agree-disagree').map((f) => f.value)).toEqual([
			1, 0.5, 0, -0.5, -1,
		]);
	});

	it('draws the default scale with the app face SVGs, not emoji', () => {
		const faces = getMapEvaluationFaces('agree-disagree');
		expect(faces.every((f) => Boolean(f.svg))).toBe(true);
		expect(faces.every((f) => f.emoji === undefined)).toBe(true);
	});

	it('lists faces high → low, since the row is laid out row-reverse', () => {
		// Rendered left-to-right this is unhappy → happy. Reversing the array
		// without also flipping the CSS would silently invert the scale.
		const values = getMapEvaluationFaces('agree-disagree').map((f) => f.value);
		expect(values).toEqual([...values].sort((a, b) => b - a));
	});

	it('uses the shared scale wording for its labels', () => {
		const faces = getMapEvaluationFaces('agree-disagree');
		expect(faces[0].labelKey).toBe('Strongly Agree');
		expect(faces[4].labelKey).toBe('Strongly Disagree');
	});

	it('switches to positive-only emoji in reactions mode', () => {
		const faces = getMapEvaluationFaces('reactions');
		expect(faces.map((f) => f.value)).toEqual([1, 0.75, 0.5, 0.25, 0]);
		expect(faces.every((f) => Boolean(f.emoji))).toBe(true);
		expect(faces.every((f) => f.svg === undefined)).toBe(true);
	});
});

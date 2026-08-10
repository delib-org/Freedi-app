import { AgoraCamp } from '@freedi/shared-types';
import { eligiblePoolFor } from '../fn_onAgoraEvaluation';

const CLASS = { left: 4, right: 3, center: 2 };

describe('eligiblePoolFor', () => {
	it('removes the author from their own camp', () => {
		// The square never serves anyone their own text, so counting the author
		// would leave a fully-participating class permanently one rating short
		// of a census — and a census is exactly what the correction needs to
		// recognise.
		expect(eligiblePoolFor({ authorCamp: AgoraCamp.left, authorPositioned: true }, CLASS)).toEqual({
			left: 3,
			right: 3,
			center: 2,
		});
	});

	it('removes nobody when the author never positioned', () => {
		// An unpositioned author holds no seat in the census, so there is
		// nothing to subtract.
		expect(eligiblePoolFor({ authorCamp: AgoraCamp.left, authorPositioned: false }, CLASS)).toEqual(
			CLASS,
		);
	});

	it('treats a legacy score doc as unpositioned', () => {
		// authorPositioned is absent on docs written before it existed. Reading
		// it as false makes the pool one seat too large, which understates the
		// consensus — the safe direction, since too small an N inflates it.
		expect(eligiblePoolFor({ authorCamp: AgoraCamp.right }, CLASS)).toEqual(CLASS);
	});

	it('never drives a camp below zero', () => {
		expect(
			eligiblePoolFor(
				{ authorCamp: AgoraCamp.center, authorPositioned: true },
				{ left: 1, right: 1, center: 0 },
			),
		).toEqual({ left: 1, right: 1, center: 0 });
	});

	it('leaves the other camps untouched', () => {
		const result = eligiblePoolFor({ authorCamp: AgoraCamp.center, authorPositioned: true }, CLASS);
		expect(result.left).toBe(CLASS.left);
		expect(result.right).toBe(CLASS.right);
		expect(result.center).toBe(CLASS.center - 1);
	});
});

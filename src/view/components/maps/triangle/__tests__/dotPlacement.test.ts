import { placeDot, MIN_DOT_FILL_OPACITY } from '../dotPlacement';

describe('placeDot', () => {
	describe('absolute scale', () => {
		it('places sums against the most-evaluated option', () => {
			const placement = placeDot({ sumPro: 5, sumCon: 2, numberOfEvaluators: 8 }, 10, 'absolute');

			expect(placement).toEqual({ pro: 0.5, con: 0.2, fillOpacity: 1 });
		});

		it('survives zero max evaluators', () => {
			const placement = placeDot({ sumPro: 0, sumCon: 0, numberOfEvaluators: 0 }, 0, 'absolute');

			expect(placement).toEqual({ pro: 0, con: 0, fillOpacity: 1 });
		});
	});

	describe('average scale', () => {
		it('places a late option by its per-evaluator average', () => {
			const late = placeDot({ sumPro: 1.8, sumCon: 0, numberOfEvaluators: 2 }, 100, 'average');

			expect(late.pro).toBeCloseTo(0.9);
			expect(late.con).toBe(0);
		});

		it('fills fully for the most-evaluated option', () => {
			const placement = placeDot(
				{ sumPro: 50, sumCon: 10, numberOfEvaluators: 100 },
				100,
				'average',
			);

			expect(placement.fillOpacity).toBe(1);
		});

		it('fills faintly for an option few people evaluated', () => {
			const placement = placeDot({ sumPro: 1, sumCon: 0, numberOfEvaluators: 1 }, 100, 'average');

			expect(placement.fillOpacity).toBeCloseTo(
				MIN_DOT_FILL_OPACITY + (1 - MIN_DOT_FILL_OPACITY) * 0.01,
			);
		});

		it('never leaves the 0..1 range on corrupted data', () => {
			const placement = placeDot({ sumPro: 9, sumCon: -3, numberOfEvaluators: 2 }, 1, 'average');

			expect(placement).toEqual({ pro: 1, con: 0, fillOpacity: 1 });
		});

		it('survives zero evaluators', () => {
			const placement = placeDot({ sumPro: 0, sumCon: 0, numberOfEvaluators: 0 }, 0, 'average');

			expect(placement).toEqual({ pro: 0, con: 0, fillOpacity: MIN_DOT_FILL_OPACITY });
		});
	});
});

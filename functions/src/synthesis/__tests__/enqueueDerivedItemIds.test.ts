import { deriveItemId } from '../queue/enqueue';

describe('synthesis queue item IDs', () => {
	it('produces a stable ID for process-option', () => {
		const a = deriveItemId({
			questionId: 'q1',
			kind: 'process-option',
			optionId: 'opt-42',
		});
		const b = deriveItemId({
			questionId: 'q1',
			kind: 'process-option',
			optionId: 'opt-42',
			forceProcess: true,
		});
		expect(a).toBe('opt-opt-42');
		expect(b).toBe('opt-opt-42');
	});

	it('normalizes medoid pair order so (A,B) === (B,A)', () => {
		const ab = deriveItemId({
			questionId: 'q1',
			kind: 'rejudge-medoid-pair',
			medoidPair: { a: 'clusterX', b: 'clusterY' },
		});
		const ba = deriveItemId({
			questionId: 'q1',
			kind: 'rejudge-medoid-pair',
			medoidPair: { a: 'clusterY', b: 'clusterX' },
		});
		expect(ab).toBe(ba);
	});

	it('different options produce different IDs', () => {
		const a = deriveItemId({ questionId: 'q1', kind: 'process-option', optionId: 'opt1' });
		const b = deriveItemId({ questionId: 'q1', kind: 'process-option', optionId: 'opt2' });
		expect(a).not.toBe(b);
	});

	it('different medoid pairs produce different IDs', () => {
		const a = deriveItemId({
			questionId: 'q1',
			kind: 'rejudge-medoid-pair',
			medoidPair: { a: 'c1', b: 'c2' },
		});
		const b = deriveItemId({
			questionId: 'q1',
			kind: 'rejudge-medoid-pair',
			medoidPair: { a: 'c1', b: 'c3' },
		});
		expect(a).not.toBe(b);
	});
});

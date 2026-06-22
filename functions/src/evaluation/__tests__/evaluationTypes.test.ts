import {
	ActionTypes,
	buildProcessedEventKey,
	PROCESSED_EVALUATION_EVENTS_COLLECTION,
	PROCESSED_EVENT_TTL_MS,
} from '../evaluationTypes';

describe('evaluation idempotency helpers', () => {
	describe('buildProcessedEventKey', () => {
		it('namespaces the key by action so different actions never collide', () => {
			const eventId = 'abc123';

			expect(buildProcessedEventKey(ActionTypes.new, eventId)).toBe('new__abc123');
			expect(buildProcessedEventKey(ActionTypes.update, eventId)).toBe('update__abc123');
			expect(buildProcessedEventKey(ActionTypes.delete, eventId)).toBe('delete__abc123');
		});

		it('produces a Firestore-safe id by replacing slashes', () => {
			const key = buildProcessedEventKey(ActionTypes.new, 'projects/p/events/e/1');

			expect(key).not.toContain('/');
			expect(key).toBe('new__projects_p_events_e_1');
		});

		it('is deterministic for the same inputs', () => {
			const a = buildProcessedEventKey(ActionTypes.update, 'evt-9');
			const b = buildProcessedEventKey(ActionTypes.update, 'evt-9');

			expect(a).toBe(b);
		});
	});

	describe('constants', () => {
		it('exposes a stable markers collection name', () => {
			expect(PROCESSED_EVALUATION_EVENTS_COLLECTION).toBe('processedEvaluationEvents');
		});

		it('keeps markers long enough to outlive redelivery windows', () => {
			expect(PROCESSED_EVENT_TTL_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
		});
	});
});

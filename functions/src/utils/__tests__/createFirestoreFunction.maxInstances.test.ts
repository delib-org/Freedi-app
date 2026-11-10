import { describe, it, expect, jest } from '@jest/globals';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { functionConfig } from '@freedi/shared-types';
import { createFirestoreFunction } from '../createFirestoreFunction';
import { TRIGGER_MAX_INSTANCES } from '../../config/triggerLimits';

const PATH = '/evaluations/{evaluationId}';
const noop = async (): Promise<void> => undefined;

function optionsPassedToTrigger(): Record<string, unknown> {
	const mock = onDocumentCreated as unknown as jest.Mock;

	return mock.mock.calls[mock.mock.calls.length - 1][0] as Record<string, unknown>;
}

describe('createFirestoreFunction maxInstances', () => {
	it('passes maxInstances to the trigger and keeps the region', () => {
		createFirestoreFunction(PATH, onDocumentCreated, noop, 'test', {
			maxInstances: TRIGGER_MAX_INSTANCES.ratingWrite,
		});

		expect(optionsPassedToTrigger()).toMatchObject({
			document: PATH,
			region: functionConfig.region,
			maxInstances: TRIGGER_MAX_INSTANCES.ratingWrite,
		});
	});

	it('leaves maxInstances out when not given', () => {
		createFirestoreFunction(PATH, onDocumentCreated, noop, 'test');

		expect(optionsPassedToTrigger()).not.toHaveProperty('maxInstances');
	});
});

describe('TRIGGER_MAX_INSTANCES', () => {
	it('stays below the platform default of 100 and above zero', () => {
		for (const cap of Object.values(TRIGGER_MAX_INSTANCES)) {
			expect(cap).toBeGreaterThan(0);
			expect(cap).toBeLessThan(100);
		}
	});
});

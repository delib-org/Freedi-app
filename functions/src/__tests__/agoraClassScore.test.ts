import { describe, it, expect, jest } from '@jest/globals';

// classScore imports ../db, which calls getFirestore on an uninitialized app.
// leadFields is pure — it never touches the database.
jest.mock('../db', () => ({ db: {} }));

import { leadFields } from '../agora/classScore';

describe('agora classScore.leadFields', () => {
	const lead = { statementId: 'proposal-1', text: 'build the aqueduct' };
	const consensus = { consensus: 0.62, n: 7, eligible: 9 };

	it('reports the lead proposal when the class rated one', () => {
		expect(leadFields(lead, consensus)).toEqual({
			leadStatementId: 'proposal-1',
			leadConsensus: 0.62,
			leadCoverage: { rated: 7, eligible: 9 },
		});
	});

	// The whole classScore write is one batch: a single undefined anywhere in it
	// makes Firestore reject the lot, and the recap never reaches the students.
	it('omits the keys entirely when nothing was rated', () => {
		const fields = leadFields(undefined, undefined);

		expect(Object.keys(fields)).toHaveLength(0);
		expect(Object.values(fields)).not.toContain(undefined);
	});

	it('omits the consensus half when the lead has no class histogram yet', () => {
		const fields = leadFields(lead, undefined);

		expect(fields).toEqual({ leadStatementId: 'proposal-1' });
		expect('leadConsensus' in fields).toBe(false);
		expect('leadCoverage' in fields).toBe(false);
	});
});

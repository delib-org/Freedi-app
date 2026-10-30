import { describe, it, expect } from '@jest/globals';
import { classifySubscription, formatIdentityScan } from '../scanSubscriptionIdentity';

describe('classifySubscription', () => {
	it('passes a sound subscription', () => {
		expect(
			classifySubscription('u1--s1', {
				userId: 'u1',
				statementId: 's1',
				role: 'admin',
				user: { uid: 'u1' },
			}),
		).toBeUndefined();
	});

	it('flags a forged id (way A) and a moved statementId (way B) as hits', () => {
		const a = classifySubscription('t--jcClass_x', {
			userId: 't',
			statementId: 's',
			role: 'admin',
		});
		expect(a).toMatchObject({ verdict: 'hit', problems: ['id-mismatch'] });
		const b = classifySubscription('t--s', {
			userId: 't',
			statementId: 'jcClass_x',
			role: 'admin',
		});
		expect(b).toMatchObject({ verdict: 'hit', problems: ['id-mismatch'] });
		const c = classifySubscription('t--s', {
			userId: 't',
			statementId: 's',
			role: 'admin',
			user: { uid: 'someone' },
		});
		expect(c?.verdict).toBe('hit');
	});

	it('reports the server shape (user = the statement creator) without making it a hit', () => {
		const f = classifySubscription('t--s', {
			userId: 't',
			statementId: 's',
			role: 'admin',
			user: { uid: 'owner' },
			statement: { creatorId: 'owner' },
		});
		expect(f).toMatchObject({ verdict: 'server-shape', problems: ['user-mismatch'] });
		const report = formatIdentityScan([f!]);
		expect(report).toContain('SERVER-SHAPE t--s');
		expect(report).toContain('0 hit(s), 1 server-shape');
	});
});

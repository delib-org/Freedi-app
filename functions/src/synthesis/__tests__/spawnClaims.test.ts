import { blockingModes, isClaimLive, spawnClaimId } from '../pipeline/spawnClaims';

describe('spawn claims', () => {
	describe('spawnClaimId', () => {
		it('is stable per parent, mode and member', () => {
			expect(spawnClaimId('q1', 'synth', 'a')).toBe('q1__synth__a');
			expect(spawnClaimId('q1', 'cluster', 'a')).not.toBe(spawnClaimId('q1', 'synth', 'a'));
		});
	});

	describe('blockingModes', () => {
		it('lets a synth form inside a theme, but not over another synth', () => {
			expect(blockingModes('synth')).toEqual(['synth']);
		});

		it('blocks a theme over either kind of owner', () => {
			expect(blockingModes('cluster')).toEqual(['synth', 'cluster']);
		});
	});

	describe('isClaimLive', () => {
		const claim = { memberId: 'a' };

		it('stands while its cluster is visible and still lists the member', () => {
			expect(isClaimLive(claim, { hide: false, integratedOptions: ['a', 'b'] })).toBe(true);
		});

		it('lapses when the cluster was dissolved (deleted)', () => {
			expect(isClaimLive(claim, undefined)).toBe(false);
		});

		it('lapses when the cluster is hidden', () => {
			expect(isClaimLive(claim, { hide: true, integratedOptions: ['a', 'b'] })).toBe(false);
		});

		it('lapses when the member left the cluster', () => {
			expect(isClaimLive(claim, { hide: false, integratedOptions: ['b', 'c'] })).toBe(false);
		});

		it('is not live without a claim', () => {
			expect(isClaimLive(undefined, { hide: false, integratedOptions: ['a'] })).toBe(false);
		});
	});
});
